/**
 * 公所登打／衛福部進度：訪查員下拉用。
 * 隱藏測試／驗證帳號，並依中文姓氏排序方便查找。
 */

const TEST_STAFF_NAME_RE =
  /測試|驗證|Cookie|寫入第|Joe\s*訪員|志工管理員|正式寫入|系統測試|信箱驗證|核准流程|核准畫面|核准\s*Cookie/i;

/** 營運可選人名（排除測試／驗證／單字姓 stub） */
export function isDeskOperationalStaffName(name: string | null | undefined): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  // 「張」這類單字／僅姓 stub 不當正式選項
  if (Array.from(n).length <= 1) return false;
  if (TEST_STAFF_NAME_RE.test(n)) return false;
  return true;
}

export function compareChinesePersonName(a: string, b: string): number {
  return String(a || "")
    .trim()
    .localeCompare(String(b || "").trim(), "zh-Hant");
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
): T[] {
  return rows.filter((row) => isDeskOperationalStaffName(getName(row)));
}
