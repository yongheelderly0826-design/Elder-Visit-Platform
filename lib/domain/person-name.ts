/** 訪員端名單用：李煥力 → 李ＯＯ，只留姓氏。 */
export function maskPersonName(name: string | null | undefined) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "";
  const chars = Array.from(trimmed);
  if (chars.length === 1) return chars[0];
  return `${chars[0]}${"Ｏ".repeat(chars.length - 1)}`;
}
