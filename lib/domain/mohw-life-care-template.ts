import template from "@/lib/domain/mohw-life-care-template.json";

/** 第 1 列必須與「生活關懷表匯入範本」逐字相同。 */
export const MOHW_IMPORT_TEMPLATE_HEADERS: readonly string[] = template.headers;

/** 範本預設為文字格式的欄（1-based）。日期、電話、Line ID 都在這裡。 */
export const MOHW_TEXT_COLUMN_INDEXES: readonly number[] = template.textColumns;

export const MOHW_DATE_CELL_MESSAGE =
  "日期格式錯誤:此欄需為文字格式並填民國年(例如 048/6/15、113/06/15)。目前儲存格是日期格式(可能來自複製貼上或格式被修改),請在儲存格上按右鍵→儲存格格式→文字,清空後重填";

export const MOHW_CASE_MISSING_MESSAGE = "無個案資料";

export const MOHW_VISITOR_ORDER_MESSAGE =
  "訪查人欄位順序不符，請重新下載最新版匯入範本";

export const MOHW_HELP_NONE_OTHER_BLANK_MESSAGE =
  "未勾選「其他」時，「求助對象無-其他說明」應留空";

const villagesByCityDistrict = template.villagesByCityDistrict as Record<string, string[]>;

export function normalizeMohwAdminName(value: string): string {
  return value.normalize("NFKC").trim().replace(/台/g, "臺");
}

/** 縣市 + 鄉鎮區 → 該區村里。對不到這組地名時回 null。 */
export function mohwVillagesFor(city: string, district: string): readonly string[] | null {
  const list = villagesByCityDistrict[normalizeMohwAdminName(city) + normalizeMohwAdminName(district)];
  return list ?? null;
}

export function mohwHeadersMatchTemplate(headers: readonly string[]): boolean {
  if (headers.length !== MOHW_IMPORT_TEMPLATE_HEADERS.length) return false;
  return headers.every((header, index) => header === MOHW_IMPORT_TEMPLATE_HEADERS[index]);
}
