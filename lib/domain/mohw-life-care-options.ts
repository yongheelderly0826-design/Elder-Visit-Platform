import { MOHW_LIFE_CARE_COLUMNS } from "@/lib/domain/mohw-life-care-form";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";

/**
 * Official allowed-value helpers for MOHW 生活關懷表.
 * Values must match 生活關懷表檔案說明範本「允許值」字串（含底線與全形標點）。
 */

export function parseOfficialAllowedValues(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Display label for UI; keep official token for storage/export. */
export function displayOfficialOption(option: string): string {
  return option.replace(/_/g, "／");
}

/**
 * Legacy / simplified wording → official allowed value.
 * Applied before validation and export.
 */
export const MOHW_OPTION_ALIASES: Record<string, Record<string, string>> = {
  education: {
    初中: "初(國)中",
    國中: "初(國)中",
    高中: "高中(職)",
    高中職: "高中(職)",
    專科以上: "專科",
    大學以上: "大學",
  },
  living_status: {
    同住配偶年滿65歲: "與他人同住",
    同住者無照顧能力: "與他人同住",
  },
  living_address_type: {
    居住地址為: "未住戶籍地址",
    居住地址不詳: "未住戶籍地址",
  },
  loneliness_2w: {
    只有幾天: "只有幾天：1至6天",
    一半以上天數: "一半以上天數：7至11天",
    幾乎每天: "幾乎每天：12至14天",
  },
  depressed_2w: {
    只有幾天: "只有幾天：1至6天",
    一半以上天數: "一半以上天數：7至11天",
    幾乎每天: "幾乎每天：12至14天",
  },
  loss_interest_2w: {
    只有幾天: "只有幾天：1至6天",
    一半以上天數: "一半以上天數：7至11天",
    幾乎每天: "幾乎每天：12至14天",
  },
  life_difficulties: {
    外出交通不方便: "外出交通不方便（例如缺乏公車或客運）",
  },
  worries: {
    自己經濟問題: "自己經濟問題(如債務)",
  },
  home_safety_issues: {
    照明不足: "照明設備不足(如夜起時)",
  },
  self_care_flag: {
    可以但行動緩慢: "可以，但行動緩慢",
  },
  self_care_observation: {
    使用器具可自行移動: "使用器具(例如輪椅、拐杖)就可以自行移動",
    "使用器具(例如輪椅、拐杖)可自行移動": "使用器具(例如輪椅、拐杖)就可以自行移動",
  },
  service_willingness: {
    電話問安: "關懷服務",
  },
  emergency_contact_relation: {
    親戚: "親戚_其他親屬",
    其他親屬: "親戚_其他親屬",
    "親戚／其他親屬": "親戚_其他親屬",
    "親戚 其他親屬": "親戚_其他親屬",
  },
  information_channels: {
    "社群媒體": "社群媒體(如：Line、FB、IG)",
    Line: "社群媒體(如：Line、FB、IG)",
    FB: "社群媒體(如：Line、FB、IG)",
  },
};

export function getOfficialOptionsForKey(key: string): string[] {
  const column = MOHW_LIFE_CARE_COLUMNS.find((item) => item.key === key);
  return parseOfficialAllowedValues(column?.allowedValues);
}

export function normalizeMohwOptionValue(key: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const aliases = MOHW_OPTION_ALIASES[key];
  if (aliases?.[trimmed]) {
    return aliases[trimmed];
  }

  const official = getOfficialOptionsForKey(key);
  if (official.length === 0) return trimmed;

  const exact = official.find((option) => option === trimmed);
  if (exact) return exact;

  // Accept UI display form that swapped _ → ／
  const fromDisplay = official.find(
    (option) => displayOfficialOption(option) === trimmed || option.replace(/_/g, " ") === trimmed,
  );
  if (fromDisplay) return fromDisplay;

  return trimmed;
}

export function normalizeMohwAnswersOptions(answers: MohwLifeCareAnswers): MohwLifeCareAnswers {
  const next: MohwLifeCareAnswers = { ...answers };

  for (const column of MOHW_LIFE_CARE_COLUMNS) {
    const raw = next[column.key];
    if (raw == null || raw === "") continue;

    if (Array.isArray(raw)) {
      next[column.key] = raw.map((item) => normalizeMohwOptionValue(column.key, String(item)));
      continue;
    }

    if (typeof raw === "string" && column.inputType.includes("多選") && raw.includes(";")) {
      next[column.key] = raw
        .split(";")
        .map((item) => normalizeMohwOptionValue(column.key, item))
        .join(";");
      continue;
    }

    if (typeof raw === "string" && (column.allowedValues || MOHW_OPTION_ALIASES[column.key])) {
      next[column.key] = normalizeMohwOptionValue(column.key, raw);
    }
  }

  return next;
}

export function isOfficialOption(key: string, value: string): boolean {
  const official = getOfficialOptionsForKey(key);
  if (official.length === 0) return true;
  const normalized = normalizeMohwOptionValue(key, value);
  return official.includes(normalized);
}
