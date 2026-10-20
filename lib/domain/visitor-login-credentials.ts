import { randomBytes } from "node:crypto";
import { hashGasPassword } from "@/lib/auth/gas-password";
import { gasClient, isGasConfigured } from "@/lib/gas-client";

export type VisitorCredentialCandidate = {
  email: string;
  fullName: string;
  visitorId: string;
  status: string;
  hasPasswordHash: boolean;
  requestId: string;
};

export type VisitorCredentialDeliveryResult = {
  email: string;
  fullName: string;
  visitorId: string;
  password: string;
  loginUrl: string;
  emailed: boolean;
  error?: string;
};

function generateVisitorPassword() {
  return `Ev${randomBytes(6)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "X")
    .slice(0, 8)}`;
}

function resolveLoginUrl(origin: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const base = configured || origin.replace(/\/$/, "");
  return `${base}/visitor/login`;
}

export async function listVisitorCredentialCandidates(): Promise<VisitorCredentialCandidate[]> {
  if (!isGasConfigured()) {
    throw new Error("GAS 尚未設定，無法讀取訪員帳號。");
  }

  const [registrations, visitors] = await Promise.all([
    gasClient.registrations.list(),
    gasClient.visitors.list(),
  ]);

  const byEmail = new Map<string, VisitorCredentialCandidate>();

  for (const visitor of visitors as Array<Record<string, unknown>>) {
    const email = String(visitor.email || "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    const status = String(visitor.status || "");
    // 僅列出已核准／啟用中的訪員主檔
    if (status && !/已核准|核准|active|approved/i.test(status)) continue;
    byEmail.set(email, {
      email,
      fullName: String(visitor.name || visitor.full_name || ""),
      visitorId: String(visitor.visitor_id || visitor.id || ""),
      status: status || "已核准",
      hasPasswordHash: false,
      requestId: "",
    });
  }

  for (const reg of registrations) {
    if (String(reg.status) !== "approved") continue;
    const email = String(reg.email || "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    byEmail.set(email, {
      email,
      fullName: String(reg.full_name || prev?.fullName || ""),
      visitorId: String(reg.visitor_id || prev?.visitorId || ""),
      status: String(prev?.status || "已核准"),
      hasPasswordHash: false,
      requestId: String(reg.id || prev?.requestId || ""),
    });
  }

  return [...byEmail.values()]
    .filter((row) => row.visitorId)
    .sort((a, b) =>
      (a.fullName || a.email).localeCompare(b.fullName || b.email, "zh-Hant"),
    );
}

export async function issueVisitorLoginCredentials(input: {
  emails: string[];
  origin: string;
  sendEmail: boolean;
}): Promise<{
  loginUrl: string;
  results: VisitorCredentialDeliveryResult[];
  summary: { total: number; saved: number; emailed: number; failed: number };
}> {
  if (!isGasConfigured()) {
    throw new Error("GAS 尚未設定，無法寫入訪員密碼。");
  }

  const wanted = new Set(
    input.emails.map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  if (wanted.size === 0) {
    throw new Error("請至少選擇一位訪員。");
  }

  const candidates = await listVisitorCredentialCandidates();
  const selected = candidates.filter((row) => wanted.has(row.email));
  if (selected.length === 0) {
    throw new Error("找不到可處理的已核准訪員帳號。");
  }

  const loginUrl = resolveLoginUrl(input.origin);
  const results: VisitorCredentialDeliveryResult[] = [];

  for (const row of selected) {
    const password = generateVisitorPassword();
    try {
      const hashed = await hashGasPassword(password);
      await gasClient.accounts.upsertAuth({
        email: row.email,
        visitor_id: row.visitorId,
        full_name: row.fullName,
        role_key: "visitor",
        password_hash: hashed.passwordHash,
        password_salt: hashed.passwordSalt,
        password_params: hashed.passwordParams,
      });

      let emailed = false;
      if (input.sendEmail) {
        await gasClient.accounts.sendLoginCredentials({
          email: row.email,
          full_name: row.fullName,
          login_url: loginUrl,
          password,
        });
        emailed = true;
      }

      results.push({
        email: row.email,
        fullName: row.fullName,
        visitorId: row.visitorId,
        password,
        loginUrl,
        emailed,
      });
    } catch (error) {
      results.push({
        email: row.email,
        fullName: row.fullName,
        visitorId: row.visitorId,
        password: "",
        loginUrl,
        emailed: false,
        error: error instanceof Error ? error.message : "處理失敗",
      });
    }
  }

  return {
    loginUrl,
    results,
    summary: {
      total: results.length,
      saved: results.filter((row) => row.password && !row.error).length,
      emailed: results.filter((row) => row.emailed).length,
      failed: results.filter((row) => row.error).length,
    },
  };
}
