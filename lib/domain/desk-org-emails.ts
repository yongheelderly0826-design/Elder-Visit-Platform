import { VILLAGE_ORG_SLUGS } from "@/lib/domain/village-admins";

/**
 * 組織共用登入 Email → org slug。
 * 可用環境變數覆寫：DESK_ORG_EMAILS=a@x.com:org:gentlemen,b@y.com:org:civil-affairs
 */
export function getDeskOrgEmailMap(): Record<string, string> {
  const map: Record<string, string> = {};
  const raw = process.env.DESK_ORG_EMAILS ?? "";
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const email = trimmed.slice(0, idx).trim().toLowerCase();
    const slug = trimmed.slice(idx + 1).trim();
    if (email && slug) map[email] = slug;
  }
  // 預設：總承辦信箱也可用民政課代管視角（optional）— 不強制
  void VILLAGE_ORG_SLUGS;
  return map;
}
