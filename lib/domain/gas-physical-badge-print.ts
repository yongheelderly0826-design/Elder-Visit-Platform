import { gasClient, isGasConfigured } from "@/lib/gas-client";

/** 官方證件套裁切比例（單張含完整黑框） */
export const GAS_BADGE_ASPECT = "781 / 1076";

/** 證件照內縮於灰框內，保留框線可見 */
export const GAS_BADGE_PHOTO_SLOT = {
  left: "33.03%",
  top: "38.20%",
  width: "37.77%",
  height: "35.32%",
} as const;

export const GAS_BADGE_RULES = [
  "會配戴訪員證",
  "會主動出示衛生福利部公文",
  "不會洩漏個人資料給任何人",
  "不會詢問與訪查無關的資料",
  "不會要求提供帳號、存摺、印章",
] as const;

/** A4 一頁張數：2×2，利於裁切 */
export const GAS_BADGES_PER_A4_PAGE = 4;

export type GasBadgePrintVisitor = {
  visitorId: string;
  name: string;
  email: string;
  status: string;
  hasPhoto: boolean;
};

export type GasBadgePrintMode = "front" | "back" | "duplex" | "check";

/** 直式 A4、長邊翻面：左右對調。0↔1、2↔3 */
export function duplexLongEdgeSlot(frontIndex: number): number {
  return frontIndex ^ 1;
}

/** 把正面 2×2 的人放到翻面後會對準的背面格子。 */
export function placeBackSlots<T>(frontChunk: T[], size = GAS_BADGES_PER_A4_PAGE): Array<T | null> {
  const slots: Array<T | null> = Array.from({ length: size }, () => null);
  frontChunk.forEach((item, frontIndex) => {
    if (frontIndex >= size) return;
    slots[duplexLongEdgeSlot(frontIndex)] = item;
  });
  return slots;
}

function asVisitorRows(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    const obj = data as { items?: unknown; rows?: unknown };
    if (Array.isArray(obj.items)) return obj.items as Array<Record<string, unknown>>;
    if (Array.isArray(obj.rows)) return obj.rows as Array<Record<string, unknown>>;
  }
  return [];
}

function isApprovedStatus(status: string) {
  if (!status) return true;
  return /已核准|核准|approved|active/i.test(status);
}

export async function listGasBadgePrintVisitors(input?: {
  visitorIds?: string[];
}): Promise<GasBadgePrintVisitor[]> {
  if (!isGasConfigured()) {
    throw new Error("GAS 尚未設定，無法讀取訪員名冊。");
  }

  const wanted = new Set(
    (input?.visitorIds ?? []).map((id) => id.trim()).filter(Boolean),
  );

  const [visitors, registrations] = await Promise.all([
    gasClient.visitors.list(),
    gasClient.registrations.list({ status: "approved" }),
  ]);

  const byId = new Map<string, GasBadgePrintVisitor>();

  for (const row of asVisitorRows(visitors)) {
    const visitorId = String(row.visitor_id || row.id || "").trim();
    const email = String(row.email || "")
      .trim()
      .toLowerCase();
    const name = String(row.name || row.full_name || "").trim();
    const status = String(row.status || "");
    if (!visitorId) continue;
    if (!isApprovedStatus(status)) continue;
    if (wanted.size > 0 && !wanted.has(visitorId)) continue;
    byId.set(visitorId, {
      visitorId,
      name: name || "訪員",
      email,
      status: status || "已核准",
      hasPhoto: Boolean(String(row.photo_url || "").trim()),
    });
  }

  for (const reg of registrations) {
    if (String(reg.status) !== "approved") continue;
    const visitorId = String(reg.visitor_id || "").trim();
    if (!visitorId) continue;
    if (wanted.size > 0 && !wanted.has(visitorId)) continue;
    const prev = byId.get(visitorId);
    byId.set(visitorId, {
      visitorId,
      name: String(reg.full_name || prev?.name || "訪員").trim() || "訪員",
      email: String(reg.email || prev?.email || "")
        .trim()
        .toLowerCase(),
      status: prev?.status || "已核准",
      hasPhoto: prev?.hasPhoto || Boolean(reg.profile?.headshotProcessedUrl),
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-Hant") || a.visitorId.localeCompare(b.visitorId),
  );
}

export function chunkForA4Pages<T>(items: T[], size = GAS_BADGES_PER_A4_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}
