import { mohwVillagesFor, normalizeMohwAdminName } from "@/lib/domain/mohw-life-care-template";

/** 永和區落地：只自動修正這個行政區的村里。 */
export const MOHW_AUTOFIX_DISTRICT = "永和區";

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

function isOfficialVillage(city: string, district: string, village: string): boolean {
  const list = mohwVillagesFor(city, district);
  if (!list?.length || !village) return false;
  return Boolean(officialMatch(list, village));
}

export function isMohwAutofixDistrict(district: string): boolean {
  return normalizeMohwAdminName(district) === normalizeMohwAdminName(MOHW_AUTOFIX_DISTRICT);
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

export type MohwVillageAutoFixExtras = {
  /** 個案名冊訪視／主要地址（永和實務常比戶籍地址準） */
  visitAddress?: string;
};

/**
 * 只自動修正「永和區」村里；以居住地址為主。
 * 其他戶籍區（中和、板橋…）先不動、也不強行對齊。
 */
export function applyMohwVillageAutoFix<T extends Record<string, unknown>>(
  answers: T,
  extras: MohwVillageAutoFixExtras = {},
): T {
  const next = { ...answers } as Record<string, unknown>;
  const livingType = String(next.living_address_type ?? "").trim();
  const sameAsHousehold = !livingType || livingType === "與戶籍地址相同";
  const separateLiving = livingType === "未住戶籍地址";

  const householdCity = String(next.household_city ?? "");
  const householdDistrict = String(next.household_district ?? "");
  const livingCity = String(next.living_city || next.household_city || "");
  const livingDistrict = String(next.living_district || next.household_district || "");

  const visitAddress = String(extras.visitAddress ?? "");
  // 居住優先：living → visit → household（僅供永和修正參考）
  const preferAddress = String(
    next.living_address || visitAddress || next.household_address || "",
  );

  const livingInYonghe = isMohwAutofixDistrict(livingDistrict);
  const householdInYonghe = isMohwAutofixDistrict(householdDistrict);

  // 非永和居住地：不自動修正
  if (!livingInYonghe && !householdInYonghe) {
    return next as T;
  }

  // 1) 修永和「居住」村里
  if (livingInYonghe) {
    const livingSeed = String(
      next.living_village || (sameAsHousehold ? next.household_village : "") || "",
    );
    const livingResolved = resolveOfficialVillage({
      city: livingCity,
      district: livingDistrict,
      village: livingSeed,
      address: preferAddress,
    });

    if (separateLiving && livingResolved.corrected) {
      next.living_village = livingResolved.village;
    }

    if (sameAsHousehold && livingResolved.village) {
      // 僅當戶籍也是永和時，才把修正寫回戶籍村里
      if (
        householdInYonghe &&
        (livingResolved.corrected ||
          !isOfficialVillage(householdCity, householdDistrict, String(next.household_village ?? "")))
      ) {
        next.household_village = livingResolved.village;
      }
      if (
        next.living_village &&
        (livingResolved.corrected ||
          !isOfficialVillage(livingCity, livingDistrict, String(next.living_village)))
      ) {
        next.living_village = livingResolved.village;
      }
    }

    if (separateLiving) {
      const livingAgain = resolveOfficialVillage({
        city: livingCity,
        district: livingDistrict,
        village: String(next.living_village ?? ""),
        address: preferAddress,
      });
      if (livingAgain.corrected) next.living_village = livingAgain.village;
    }

    // 戶籍也是永和且仍無效、居住已有效 → 戶籍跟居住（不同區則不動戶籍）
    if (householdInYonghe) {
      const livingVillageFinal = String(
        (separateLiving ? next.living_village : livingResolved.village) ||
          next.living_village ||
          livingResolved.village ||
          "",
      );
      const livingOk = isOfficialVillage(livingCity, livingDistrict, livingVillageFinal);
      const householdOk = isOfficialVillage(
        householdCity,
        householdDistrict,
        String(next.household_village ?? ""),
      );
      if (!householdOk && livingOk && livingVillageFinal) {
        next.household_village = livingVillageFinal;
      } else if (!householdOk) {
        const householdResolved = resolveOfficialVillage({
          city: householdCity,
          district: householdDistrict,
          village: String(next.household_village ?? ""),
          address: preferAddress,
        });
        if (householdResolved.corrected) {
          next.household_village = householdResolved.village;
        }
      }
    }
  } else if (householdInYonghe && sameAsHousehold) {
    // 居住區非永和、但戶籍填永和且與戶籍相同：仍修戶籍（少見）
    const householdResolved = resolveOfficialVillage({
      city: householdCity,
      district: householdDistrict,
      village: String(next.household_village ?? ""),
      address: preferAddress,
    });
    if (householdResolved.corrected) {
      next.household_village = householdResolved.village;
    }
  }

  return next as T;
}
