import { formatRocDate } from "@/lib/domain/mohw-life-care-export";

/**
 * 永和名冊「出生日期」常見為民國兩碼／三碼斜線（如 24/01/01、036/04/11）。
 * 若原樣寫入 Google Sheets，兩碼年會被當成西元 20xx／19xx（24→2024→畫面 113/01/01）。
 * 匯入與畫面顯示前一律正規成官方民國文字 `yyy/MM/dd`。
 */
export function normalizeTaiwanBirthToRocText(
  input: string | Date | number | null | undefined,
): string {
  if (input == null || input === "") return "";

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return "";
    const formatted = formatRocDate(input);
    return formatted === "INVALID_DATE" ? "" : formatted;
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    const formatted = formatRocDate(input);
    return formatted && formatted !== "INVALID_DATE" ? formatted : "";
  }

  const text = String(input).trim();
  if (!text) return "";

  // 已是官方三碼民國
  if (/^\d{3}\/\d{2}\/\d{2}$/.test(text)) return text;

  // 民國 1～3 碼年（含兩碼 24/01/01）→ 不可當西元
  const rocSlash = text.match(/^(\d{1,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (rocSlash) {
    const year = Number(rocSlash[1]);
    const month = Number(rocSlash[2]);
    const day = Number(rocSlash[3]);
    if (year >= 1 && year <= 999 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(3, "0")}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
    }
  }

  // 西元 ISO／四碼斜線
  const formatted = formatRocDate(text);
  if (formatted && formatted !== "INVALID_DATE" && /^\d{3}\/\d{2}\/\d{2}$/.test(formatted)) {
    return formatted;
  }
  return "";
}
