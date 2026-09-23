/**
 * 補齊 Joe 訪員 GAS 主檔 + Email 密碼帳號（正式站 GAS 登入）
 * Usage: npx tsx scripts/setup-joe-gas-account.ts
 */
import fs from "node:fs";
import path from "node:path";
import { hashGasPassword, verifyGasPassword } from "../lib/auth/gas-password";

const JOE = {
  email: "joe@elder.org",
  password: "joejoe123456",
  visitorId: "V-YH-834059",
  name: "Joe訪員",
  idNumber: "E123456783",
  phone: "0912000888",
  serviceAreas: "永和區",
  volunteerGroup: "elder_care",
  bankAccount: "0123456789012345",
};

function loadEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return {} as Record<string, string>;
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
      }),
  );
}

async function gas(action: string, { params = {}, body }: { params?: Record<string, string>; body?: unknown } = {}) {
  const env = loadEnv(path.join(process.cwd(), ".env.local"));
  const GAS_URL = env.GAS_WEB_APP_URL;
  const GAS_TOKEN = env.GAS_API_TOKEN;
  if (!GAS_URL || !GAS_TOKEN) throw new Error("Missing GAS_WEB_APP_URL / GAS_API_TOKEN");

  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  if (body && Object.keys(body).length) {
    url.searchParams.set("body", JSON.stringify(body));
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${GAS_TOKEN}` },
    redirect: "follow",
  });
  const json = (await res.json()) as {
    ok: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  if (!json.ok) {
    throw new Error(`${action} ${json.error?.code ?? "ERR"}: ${json.error?.message ?? "failed"}`);
  }
  return json.data;
}

async function main() {
  const hashed = await hashGasPassword(JOE.password);

  const visitor = (await gas("visitors.update", {
    body: {
      visitor_id: JOE.visitorId,
      name: JOE.name,
      email: JOE.email,
      phone: JOE.phone,
      id_number: JOE.idNumber,
      service_areas: JOE.serviceAreas,
      volunteer_group: JOE.volunteerGroup,
      bank_account: JOE.bankAccount,
      status: "已核准",
    },
  })) as Record<string, unknown>;

  const account = (await gas("accounts.upsertAuth", {
    body: {
      email: JOE.email,
      visitor_id: JOE.visitorId,
      full_name: JOE.name,
      role_key: "visitor",
      password_hash: hashed.passwordHash,
      password_salt: hashed.passwordSalt,
      password_params: hashed.passwordParams,
    },
  })) as Record<string, unknown>;

  const auth = (await gas("accounts.getAuthByEmail", {
    params: { email: JOE.email },
  })) as {
    email: string;
    visitor_id: string;
    status: string;
    password_hash: string;
    password_salt: string;
    password_params: string;
  };

  const passwordOk = await verifyGasPassword({
    password: JOE.password,
    passwordHash: auth.password_hash,
    passwordSalt: auth.password_salt,
    passwordParams: auth.password_params,
  });

  console.log(
    JSON.stringify(
      {
        ok: passwordOk,
        email: JOE.email,
        password: JOE.password,
        visitor_id: visitor.visitor_id ?? JOE.visitorId,
        account_id: account.account_id,
        auth_status: auth.status,
        password_verified: passwordOk,
      },
      null,
      2,
    ),
  );

  if (!passwordOk) process.exit(2);
}

void main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error) }, null, 2));
  process.exit(1);
});
