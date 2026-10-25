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
  visitorCode: string;
  name: string;
  email: string;
  status: string;
  hasPhoto: boolean;
};

export const GAS_BADGE_PRINT_TRAY_KEY = "elder-visit:gas-badge-print-tray";

export type GasBadgePrintMode = "front" | "back" | "duplex" | "check";

function normalizeVisitorKey(value: string) {
  return value.trim().toLowerCase();
}

export function uniqueVisitorIds(ids: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function visitorMatchesPrintQuery(visitor: GasBadgePrintVisitor, query: string) {
  const needle = normalizeVisitorKey(query);
  if (!needle) return false;
  return [visitor.name, visitor.visitorId, visitor.visitorCode, visitor.email].some((value) =>
    normalizeVisitorKey(value).includes(needle),
  );
}

export function visitorMatchesWanted(visitor: GasBadgePrintVisitor, wanted: Set<string>) {
  if (wanted.size === 0) return true;
  const normalizedWanted = new Set([...wanted].map(normalizeVisitorKey).filter(Boolean));
  return [visitor.visitorId, visitor.visitorCode, visitor.email]
    .map(normalizeVisitorKey)
    .some((key) => key && normalizedWanted.has(key));
}

export function resolveGasBadgeVisitorIds(
  catalog: GasBadgePrintVisitor[],
  requestedKeys: Array<string | null | undefined>,
) {
  const visitorIdByKey = new Map<string, string>();
  for (const visitor of catalog) {
    for (const key of [visitor.visitorId, visitor.visitorCode, visitor.email]) {
      const normalized = normalizeVisitorKey(key);
      if (normalized) visitorIdByKey.set(normalized, visitor.visitorId);
    }
  }

  return uniqueVisitorIds(
    requestedKeys.map((key) => visitorIdByKey.get(normalizeVisitorKey(String(key ?? "")))),
  );
}

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

export function chunkForA4Pages<T>(items: T[], size = GAS_BADGES_PER_A4_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}
