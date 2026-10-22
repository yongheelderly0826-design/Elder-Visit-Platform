/**
 * 台灣手機／電話正規化：去掉分隔符、補回前導 0。
 * 供註冊、名冊匯出與 GAS 同步使用。
 */

/** 去掉空白、連字號等，手機缺前導 0 時補上（9xxxxxxxx → 09xxxxxxxx）。 */
export function normalizeTaiwanMobilePhone(input: string | number | null | undefined): string {
  if (input == null || input === "") return "";
  const digits = String(input)
    .trim()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[^\d]/g, "");
  if (!digits) return "";
  if (/^09\d{8}$/.test(digits)) return digits;
  if (/^9\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
}

/**
 * CSV 匯出用：強制 Excel 以「文字／公式」開啟，避免前導 0 被吃掉。
 * 寫成 `="09xxxxxxxx"`；搭配 CSV 引號後為 `"=""09xxxxxxxx"""`，
 * Excel 雙擊開啟會當公式，畫面顯示完整 09 開頭號碼。
 */
export function formatPhoneForCsvText(input: string | number | null | undefined): string {
  const phone = normalizeTaiwanMobilePhone(input);
  if (!phone) return "";
  return `="${phone}"`;
}
