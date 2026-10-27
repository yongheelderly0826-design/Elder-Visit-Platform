import { randomBytes } from "node:crypto";
import { hashGasPassword, verifyGasPassword } from "@/lib/auth/gas-password";
import { gasClient } from "@/lib/gas-client";

export const DESK_CLERK_BATCH_SIZE = 20;
export const DESK_CLERK_ID_PREFIX = "TEMP-";

export type DeskClerkRecord = {
  clerkId: string;
  displayName: string;
  status: "active" | "disabled";
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  disabledAt: string | null;
  lastLoginAt: string | null;
};

export type DeskClerkCredential = DeskClerkRecord & {
  passcode: string;
};

export type DeskClerkStatsRow = {
  clerkId: string;
  displayName: string;
  status?: string;
  validUntil?: string | null;
  lastLoginAt?: string | null;
  keyCount: number;
  pieceCount: number;
  lastKeyedAt: string | null;
};

export type DeskKeyLogRow = {
  logId: string;
  clerkId: string;
  displayName: string;
  assignmentId: string;
  careformId: string;
  caseId: string;
  caseLabel: string;
  visitResult: string;
  visitDate: string;
  keyedAt: string;
  countsAsPiece: number;
};

function padClerkIndex(index: number) {
  return String(index).padStart(2, "0");
}

export function formatDeskClerkId(index: number) {
  return `${DESK_CLERK_ID_PREFIX}${padClerkIndex(index)}`;
}

export function normalizeDeskClerkId(value: string) {
  const raw = String(value || "").trim().toUpperCase();
  if (/^TEMP-\d{1,2}$/.test(raw)) {
    const num = Number(raw.split("-")[1]);
    return formatDeskClerkId(num);
  }
  if (/^\d{1,2}$/.test(raw)) {
    return formatDeskClerkId(Number(raw));
  }
  return raw;
}

function generatePasscode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

function mapClerk(row: Record<string, unknown>): DeskClerkRecord {
  const status = String(row.status ?? "disabled") === "active" ? "active" : "disabled";
  return {
    clerkId: String(row.clerk_id ?? ""),
    displayName: String(row.display_name ?? ""),
    status,
    validFrom: row.valid_from ? String(row.valid_from) : null,
    validUntil: row.valid_until ? String(row.valid_until) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    disabledAt: row.disabled_at ? String(row.disabled_at) : null,
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

export async function listDeskClerks() {
  const rows = (await gasClient.deskClerks.list()) as Record<string, unknown>[];
  return rows.map(mapClerk);
}

function parseDeskClerkIndex(clerkId: string) {
  const match = /^TEMP-(\d{1,2})$/.exec(String(clerkId || "").trim().toUpperCase());
  return match ? Number(match[1]) : null;
}

async function upsertDeskClerkRange(input: {
  startIndex: number;
  endIndex: number;
  validUntil?: string | null;
  displayNames?: Record<string, string>;
}): Promise<DeskClerkCredential[]> {
  const startIndex = Math.min(99, Math.max(1, Math.floor(input.startIndex)));
  const endIndex = Math.min(99, Math.max(startIndex, Math.floor(input.endIndex)));
  const validUntil = input.validUntil ? String(input.validUntil) : "";
  const credentials: DeskClerkCredential[] = [];
  const items: Record<string, unknown>[] = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    const clerkId = formatDeskClerkId(index);
    const passcode = generatePasscode();
    const hashed = await hashGasPassword(passcode);
    const displayName = String(input.displayNames?.[clerkId] ?? "").trim();
    items.push({
      clerk_id: clerkId,
      display_name: displayName,
      status: "active",
      passcode_hash: hashed.passwordHash,
      passcode_salt: hashed.passwordSalt,
      passcode_params: hashed.passwordParams,
      valid_until: validUntil,
    });
    credentials.push({
      clerkId,
      displayName,
      status: "active",
      validFrom: null,
      validUntil: validUntil || null,
      createdAt: null,
      updatedAt: null,
      disabledAt: null,
      lastLoginAt: null,
      passcode,
    });
  }

  const saved = await gasClient.deskClerks.upsertBatch({ items });
  const savedById = new Map(
    ((saved.items ?? []) as Record<string, unknown>[]).map((row) => [
      String(row.clerk_id),
      mapClerk(row),
    ]),
  );

  return credentials.map((item) => {
    const savedRow = savedById.get(item.clerkId);
    return savedRow ? { ...savedRow, passcode: item.passcode } : item;
  });
}

/** 建立／重設 TEMP-01～TEMP-N（會覆寫該範圍通行碼）。 */
export async function createDeskClerkBatch(input?: {
  count?: number;
  validUntil?: string | null;
  displayNames?: Record<string, string>;
}): Promise<DeskClerkCredential[]> {
  const count = Math.min(99, Math.max(1, Math.floor(input?.count ?? DESK_CLERK_BATCH_SIZE)));
  return upsertDeskClerkRange({
    startIndex: 1,
    endIndex: count,
    validUntil: input?.validUntil,
    displayNames: input?.displayNames,
  });
}

/** 從現有最大號之後增開，不改動既有帳密。上限 TEMP-99。 */
export async function appendDeskClerks(input?: {
  count?: number;
  validUntil?: string | null;
}): Promise<{ credentials: DeskClerkCredential[]; fromId: string; toId: string }> {
  const existing = await listDeskClerks();
  let maxIndex = 0;
  for (const row of existing) {
    const index = parseDeskClerkIndex(row.clerkId);
    if (index != null) maxIndex = Math.max(maxIndex, index);
  }
  if (maxIndex >= 99) {
    throw new Error("已達 TEMP-99 上限，無法再增開。");
  }
  const requested = Math.min(40, Math.max(1, Math.floor(input?.count ?? 5)));
  const startIndex = maxIndex + 1;
  const endIndex = Math.min(99, startIndex + requested - 1);
  const credentials = await upsertDeskClerkRange({
    startIndex,
    endIndex,
    validUntil: input?.validUntil,
  });
  return {
    credentials,
    fromId: formatDeskClerkId(startIndex),
    toId: formatDeskClerkId(endIndex),
  };
}

export async function setDeskClerkStatus(input: {
  clerkId: string;
  status: "active" | "disabled";
  validUntil?: string | null;
  displayName?: string;
}) {
  const row = (await gasClient.deskClerks.setStatus({
    clerk_id: normalizeDeskClerkId(input.clerkId),
    status: input.status,
    ...(input.validUntil !== undefined ? { valid_until: input.validUntil ?? "" } : {}),
    ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
  })) as Record<string, unknown>;
  return mapClerk(row);
}

export async function setDeskClerkStatusBatch(input: {
  clerkIds: string[];
  status: "active" | "disabled";
  validUntil?: string | null;
}) {
  const clerkIds = [...new Set(input.clerkIds.map(normalizeDeskClerkId).filter(Boolean))];
  if (!clerkIds.length) {
    throw new Error("請勾選至少一個臨時帳號。");
  }
  const result = await gasClient.deskClerks.setStatusBatch({
    clerk_ids: clerkIds,
    status: input.status,
    ...(input.validUntil !== undefined ? { valid_until: input.validUntil ?? "" } : {}),
  });
  return {
    count: Number(result.count ?? 0),
    status: input.status,
    clerks: ((result.items ?? []) as Record<string, unknown>[]).map(mapClerk),
  };
}

export async function disableAllDeskClerks() {
  return gasClient.deskClerks.disableAll({});
}

export async function authenticateDeskClerk(clerkIdRaw: string, passcode: string) {
  const clerkId = normalizeDeskClerkId(clerkIdRaw);
  if (!clerkId || !passcode.trim()) {
    throw new Error("請輸入臨時帳號與通行碼。");
  }
  const row = (await gasClient.deskClerks.get(clerkId, { include_secrets: true })) as Record<
    string,
    unknown
  > | null;
  if (!row?.clerk_id) {
    throw new Error("帳號或通行碼不正確。");
  }
  if (String(row.status) !== "active") {
    throw new Error("此臨時帳號已停用。");
  }
  const validUntil = String(row.valid_until || "").trim();
  if (validUntil) {
    const endMs = Date.parse(validUntil);
    if (Number.isFinite(endMs) && Date.now() > endMs) {
      await gasClient.deskClerks.setStatus({
        clerk_id: clerkId,
        status: "disabled",
      });
      throw new Error("此臨時帳號已到期，無法登入。");
    }
  }
  const ok = await verifyGasPassword({
    password: passcode.trim(),
    passwordHash: String(row.passcode_hash || ""),
    passwordSalt: String(row.passcode_salt || ""),
    passwordParams: String(row.passcode_params || ""),
  });
  if (!ok) {
    throw new Error("帳號或通行碼不正確。");
  }
  const loggedIn = (await gasClient.deskClerks.markLogin({ clerk_id: clerkId })) as Record<
    string,
    unknown
  >;
  return mapClerk(loggedIn);
}

export async function logDeskClerkKey(input: {
  clerkId: string;
  displayName?: string;
  assignmentId: string;
  careformId?: string;
  caseId: string;
  caseLabel?: string;
  visitResult?: string;
  visitDate?: string;
  keyedAt?: string;
}) {
  return gasClient.deskClerks.logKey({
    clerk_id: normalizeDeskClerkId(input.clerkId),
    display_name: input.displayName ?? "",
    assignment_id: input.assignmentId,
    careform_id: input.careformId ?? "",
    case_id: input.caseId,
    case_label: input.caseLabel ?? "",
    visit_result: input.visitResult ?? "",
    visit_date: input.visitDate ?? "",
    keyed_at: input.keyedAt ?? new Date().toISOString(),
  });
}

export async function listDeskClerkStats(params?: { from?: string; to?: string }) {
  const result = (await gasClient.deskClerks.stats({
    ...(params?.from ? { from: params.from } : {}),
    ...(params?.to ? { to: params.to } : {}),
  })) as {
    items?: Record<string, unknown>[];
    piece_total?: number;
    key_total?: number;
  };
  const items: DeskClerkStatsRow[] = (result.items ?? []).map((row) => ({
    clerkId: String(row.clerk_id ?? ""),
    displayName: String(row.display_name ?? row.clerk_id ?? ""),
    status: row.status ? String(row.status) : undefined,
    validUntil: row.valid_until ? String(row.valid_until) : null,
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    keyCount: Number(row.key_count ?? 0),
    pieceCount: Number(row.piece_count ?? 0),
    lastKeyedAt: row.last_keyed_at ? String(row.last_keyed_at) : null,
  }));
  return {
    items,
    pieceTotal: Number(result.piece_total ?? 0),
    keyTotal: Number(result.key_total ?? 0),
  };
}

export async function listDeskKeyLogs(params?: {
  clerkId?: string;
  from?: string;
  to?: string;
}) {
  const result = (await gasClient.deskClerks.listLogs({
    ...(params?.clerkId ? { clerk_id: normalizeDeskClerkId(params.clerkId) } : {}),
    ...(params?.from ? { from: params.from } : {}),
    ...(params?.to ? { to: params.to } : {}),
  })) as { items?: Record<string, unknown>[]; total?: number };
  const items: DeskKeyLogRow[] = (result.items ?? []).map((row) => ({
    logId: String(row.log_id ?? ""),
    clerkId: String(row.clerk_id ?? ""),
    displayName: String(row.display_name ?? ""),
    assignmentId: String(row.assignment_id ?? ""),
    careformId: String(row.careform_id ?? ""),
    caseId: String(row.case_id ?? ""),
    caseLabel: String(row.case_label ?? ""),
    visitResult: String(row.visit_result ?? ""),
    visitDate: String(row.visit_date ?? ""),
    keyedAt: String(row.keyed_at ?? ""),
    countsAsPiece: Number(row.counts_as_piece ?? 0) ? 1 : 0,
  }));
  return { items, total: result.total ?? items.length };
}
