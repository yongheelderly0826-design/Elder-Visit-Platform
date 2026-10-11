import { mohwVillagesFor, normalizeMohwAdminName } from "@/lib/domain/mohw-life-care-template";

/**
 * 常見錯字／俗稱 → 正確里名。
 * 僅在對應行政區官方名冊存在時才採用。
 */
const VILLAGE_ALIASES: Record<string, string> = {
  新星: "新生",
  新星里: "新生里",
  新庿: "新廍",
  新庿里: "新廍里",
  新廟: "新廍",
  新廟里: "新廍里",
};

function stripLi(name: string) {
  const text = normalizeMohwAdminName(name);
  return text.endsWith("里") ? text.slice(0, -1) : text;
}

function withLi(name: string) {
  const text = normalizeMohwAdminName(name);
  if (!text) return "";
  return text.endsWith("里") ? text : `${text}里`;
}

function officialMatch(list: readonly string[], candidate: string): string | null {
  const target = normalizeMohwAdminName(withLi(candidate));
  if (!target) return null;
  for (const item of list) {
    if (normalizeMohwAdminName(item) === target) return item;
  }
  return null;
}

/** 從地址抽出可能的「○○里」。 */
export function extractVillagesFromAddress(address: string): string[] {
  const text = normalizeMohwAdminName(address);
  if (!text) return [];
  const matches = text.match(/[\u4e00-\u9fff]{1,6}里/g) ?? [];
  return matches.filter((item) => item !== "村里" && item.length >= 2);
}

/**
 * 依官方村里名冊 + 地址內「里」+ 常見別名，解析可匯出的村里。
 * 無法確信時回傳原值（讓驗證繼續擋下）。
 */
export function resolveOfficialVillage(options: {
  city: string;
  district: string;
  village: string;
  address?: string;
}): { village: string; corrected: boolean; source: "unchanged" | "official" | "alias" | "address" } {
  const list = mohwVillagesFor(options.city, options.district);
  if (!list?.length) {
    return { village: options.village, corrected: false, source: "unchanged" };
  }

  const current = normalizeMohwAdminName(options.village);
  const already = officialMatch(list, current);
  if (already) {
    return {
      village: already,
      corrected: already !== options.village,
      source: already !== options.village ? "official" : "unchanged",
    };
  }

  const aliasTarget = VILLAGE_ALIASES[current] || VILLAGE_ALIASES[stripLi(current)];
  if (aliasTarget) {
    const fromAlias = officialMatch(list, aliasTarget);
    if (fromAlias) {
      return { village: fromAlias, corrected: true, source: "alias" };
    }
  }

  const addressText = normalizeMohwAdminName(options.address ?? "");
  if (addressText) {
    // 優先：地址是否直接含官方里名（避免「永和區竹林里」被整段誤抓）
    const byOfficial = [...list]
      .sort((a, b) => b.length - a.length)
      .find((item) => addressText.includes(normalizeMohwAdminName(item)));
    if (byOfficial) {
      return { village: byOfficial, corrected: true, source: "address" };
    }

    for (const candidate of extractVillagesFromAddress(addressText)) {
      const hit = officialMatch(list, candidate);
      if (hit) {
        return { village: hit, corrected: true, source: "address" };
      }
      const alias = VILLAGE_ALIASES[candidate] || VILLAGE_ALIASES[stripLi(candidate)];
      if (alias) {
        const fromAlias = officialMatch(list, alias);
        if (fromAlias) {
          return { village: fromAlias, corrected: true, source: "address" };
        }
      }
    }
  }

  return { village: options.village, corrected: false, source: "unchanged" };
}

/** 對關懷表戶籍／居住村里做自動修正（僅在可對到官方名冊時）。 */
export function applyMohwVillageAutoFix<T extends Record<string, unknown>>(answers: T): T {
  const next = { ...answers };

  const household = resolveOfficialVillage({
    city: String(next.household_city ?? ""),
    district: String(next.household_district ?? ""),
    village: String(next.household_village ?? ""),
    address: String(next.household_address ?? ""),
  });
  if (household.corrected) {
    (next as Record<string, unknown>).household_village = household.village;
  }

  const living = resolveOfficialVillage({
    city: String(next.living_city ?? next.household_city ?? ""),
    district: String(next.living_district ?? next.household_district ?? ""),
    village: String(next.living_village ?? ""),
    address: String(next.living_address ?? next.household_address ?? ""),
  });
  if (living.corrected) {
    (next as Record<string, unknown>).living_village = living.village;
  }

  return next;
}
