/**
 * 公所登打／衛福部進度：訪查員下拉用。
 * 隱藏測試／驗證帳號，並依中文姓氏排序方便查找。
 */

const TEST_STAFF_NAME_RE =
  /測試|驗證|Cookie|寫入第|Joe\s*訪員|志工管理員|正式寫入|系統測試|信箱驗證|核准流程|核准畫面|核准\s*Cookie|第四測/i;

/** 明示排除（regex 備援；含使用者截圖中仍出現的測試帳） */
const DESK_STAFF_NAME_DENYLIST = new Set([
  "測試內勤乙",
  "測試送餐甲",
  "測試送餐乙",
  "正式寫入第四測",
  "系統測試訪員 0525",
  "系統驗證訪員-762216",
  "信箱驗證訪員 0525",
  "核准流程測試",
  "核准流程測試-1779598383896",
  "核准畫面回饋測試",
  "核准 Cookie 測試",
  "驗證訪員",
  "Joe訪員",
  "志工管理員",
]);

const DESK_STAFF_BADGE_DENYLIST = new Set(["T-MEAL", "T-OFF"]);

function normalizeStaffLabel(value: string | null | undefined): string {
  return String(value || "").trim();
}

/** 營運可選人名（排除測試／驗證／單字姓 stub） */
export function isDeskOperationalStaffName(name: string | null | undefined): boolean {
  const n = normalizeStaffLabel(name);
  if (!n) return false;
  // 「張」這類單字／僅姓 stub 不當正式選項
  if (Array.from(n).length <= 1) return false;
  if (DESK_STAFF_NAME_DENYLIST.has(n)) return false;
  if (TEST_STAFF_NAME_RE.test(n)) return false;
  return true;
}

export function isDeskOperationalStaffBadge(badgeNo: string | null | undefined): boolean {
  const badge = normalizeStaffLabel(badgeNo).toUpperCase();
  if (!badge) return true;
  return !DESK_STAFF_BADGE_DENYLIST.has(badge);
}

/** 姓名＋證號同時檢查（下拉列用） */
export function isDeskOperationalStaff(row: {
  name?: string | null;
  badgeNo?: string | null;
}): boolean {
  return isDeskOperationalStaffName(row.name) && isDeskOperationalStaffBadge(row.badgeNo);
}

export function compareChinesePersonName(a: string, b: string): number {
  return normalizeStaffLabel(a).localeCompare(normalizeStaffLabel(b), "zh-Hant");
}

export function sortByChineseSurname<T>(
  rows: T[],
  getName: (row: T) => string,
): T[] {
  return [...rows].sort((a, b) => compareChinesePersonName(getName(a), getName(b)));
}

export function filterOperationalStaffByName<T>(
  rows: T[],
  getName: (row: T) => string,
  getBadgeNo?: (row: T) => string,
): T[] {
  return rows.filter((row) => {
    if (!isDeskOperationalStaffName(getName(row))) return false;
    if (getBadgeNo && !isDeskOperationalStaffBadge(getBadgeNo(row))) return false;
    return true;
  });
}
