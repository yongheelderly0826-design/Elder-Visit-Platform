/**
 * 關懷表建檔（desk）問卷預設值。
 * 紙本大量 KEY：個資由名冊／身分證帶入；問卷採安全預設（無疾病、無住院等）。
 */
import {
  DESK_BATCH_SLOT_MINUTES,
  addMinutesToTime,
} from "@/lib/domain/desk-care-batch";
import { formatRocDate, CASE_PHONE_NONE, CASE_PHONE_REFUSED } from "@/lib/domain/mohw-life-care-export";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { createInitialMohwAnswers } from "@/lib/domain/mohw-life-care-ui";
import type { ElderCase, VisitSchedule } from "@/lib/domain/types";

export const MOHW_DESK_FORM_DEFAULTS_SOURCE = "紙本建檔預設（2026-10 定案）";

/** 多選欄位：選「以上均無」時與其餘選項互斥。 */
export const MOHW_NONE_OF_ABOVE = "以上均無";

export const MOHW_EXCLUSIVE_NONE_MULTI_KEYS = new Set([
  "diseases",
  "information_channels",
  "past_activities",
  "desired_activities",
  "home_safety_issues",
  "home_hygiene_issues",
]);

export const MOHW_DESK_FORM_DEFAULTS: MohwLifeCareAnswers = {
  visit_status: "已完成",
  visit_notes: "首訪",
  housing_type: "電梯大樓",
  living_status: "與他人同住",
  cohabitation_status: "同住者有照顧能力",
  cohabitant_relation: "兒子",
  cohabitant_age: "45",
  education: "小學",
  marital_status: "有配偶或同居",
  has_children: "存",
  sons_count: "1",
  daughters_count: "1",
  children_same_city: "是",
  health_self_rating: "還算好",
  height_cm: "165",
  weight_kg: "60",
  weight_change_3m: "無改變",
  appetite_3m: "無變化",
  diseases: [MOHW_NONE_OF_ABOVE],
  recent_medical_event: "否",
  recent_medical_note: "",
  hearing_issue: "否",
  hearing_aid: "",
  vision_issue: "否",
  family_interaction: "每周1次",
  neighbor_interaction: "每天",
  life_difficulties_flag: "無",
  life_difficulties: [],
  worries_flag: "無",
  worries: [],
  help_sources_flag: "有",
  help_sources_has: ["家人"],
  help_sources_has_other: "",
  information_channels: ["電視", "親友或鄰里"],
  past_activities: ["參與宗教活動"],
  desired_activities: ["健身運動"],
  home_safety_feeling: "大致安全",
  loneliness_2w: "完全沒有",
  depressed_2w: "完全沒有",
  loss_interest_2w: "完全沒有",
  service_willingness_flag: "無",
  service_willingness: [],
  mental_status: "無特殊情形",
  self_care_flag: "可以",
  home_hygiene_issues: [MOHW_NONE_OF_ABOVE],
  home_safety_issues: [MOHW_NONE_OF_ABOVE],
  consent_personal_data: "同意",
  consent_health_db: "同意",
  consent_signature: "是",
  living_address_type: "與戶籍地址相同",
  living_address_note: "",
};

/** 身分證第 2 碼：奇數男、偶數女。 */
export function inferGenderFromNationalId(nationalId: string | null | undefined): "男" | "女" | "" {
  const id = String(nationalId ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z][12]\d{8}$/.test(id) && !/^[A-Z]\d{9}$/.test(id)) {
    // 仍嘗試用第 2 碼（本國／常見格式）
  }
  const digit = id.charAt(1);
  if (!/^\d$/.test(digit)) return "";
  return Number(digit) % 2 === 1 ? "男" : "女";
}

/** 匯入出生日期 → 官方民國 `yyy/MM/dd`。 */
export function formatDeskBirthDate(raw: string | Date | number | null | undefined): string {
  if (raw == null || raw === "") return "";
  const formatted = formatRocDate(raw as string | Date | number);
  if (!formatted || formatted === "INVALID_DATE") return "";
  if (/^\d{3}\/\d{2}\/\d{2}$/.test(formatted)) return formatted;
  return formatted;
}

/** 多選答案可能是陣列或 `;` 字串（草稿／匯入）。 */
export function asMultiChoiceValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text
    .split(/[;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function multiIncludesNoneOfAbove(
  values: string[],
  noneLabel: string = MOHW_NONE_OF_ABOVE,
) {
  return values.some((item) => item === noneLabel || item.includes(noneLabel));
}

export function toggleExclusiveNoneMulti(
  current: string[],
  option: string,
  noneLabel: string = MOHW_NONE_OF_ABOVE,
): string[] {
  const selected = current.includes(option);
  if (option === noneLabel) {
    return selected ? [] : [noneLabel];
  }
  const withoutNone = current.filter((item) => item !== noneLabel);
  if (selected) {
    return withoutNone.filter((item) => item !== option);
  }
  return [...withoutNone, option];
}

/**
 * 建檔電話／手機：僅前綴或空白 → 0000000000；不願提供 → 9999999999。
 */
export function finalizeDeskContactPhone(value: unknown, kind: "phone" | "mobile"): string {
  const text = String(value ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (digits === CASE_PHONE_REFUSED || /^9{10}$/.test(digits)) return CASE_PHONE_REFUSED;
  if (!digits || digits === "0" || digits === "02" || digits === "09" || digits === "9") {
    return CASE_PHONE_NONE;
  }
  if (kind === "mobile") {
    if (/^09\d{8}$/.test(digits)) return digits;
    if (/^9\d{8}$/.test(digits)) return `0${digits}`;
    if (digits.length < 10) return CASE_PHONE_NONE;
    return digits;
  }
  // 市話：至少 02 + 更多碼；否則當留白
  if (digits === "02" || (digits.startsWith("02") && digits.length < 9)) {
    return CASE_PHONE_NONE;
  }
  if (/^0\d{8,9}$/.test(digits)) return digits;
  if (digits.length < 9) return CASE_PHONE_NONE;
  return digits;
}

export function finalizeDeskContactPhones(answers: MohwLifeCareAnswers): MohwLifeCareAnswers {
  return {
    ...answers,
    phone: finalizeDeskContactPhone(answers.phone, "phone"),
    mobile: finalizeDeskContactPhone(answers.mobile, "mobile"),
  };
}

/** 現場現在：民國訪查日＋開始／結束（預設時長與建檔批次相同，10 分）。 */
export function getDeskNowVisitClock(now: Date = new Date()): {
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
} {
  const visitDate = formatDeskBirthDate(now) || formatRocDate(now);
  const safeDate =
    visitDate && visitDate !== "INVALID_DATE" && /^\d{3}\/\d{2}\/\d{2}$/.test(visitDate)
      ? visitDate
      : formatRocDate(now);
  const startTotal = now.getHours() * 60 + now.getMinutes();
  const pad = (n: number) => String(n).padStart(2, "0");
  const visitStartTime = `${pad(Math.floor(startTotal / 60))}:${pad(startTotal % 60)}`;
  const visitEndTime =
    addMinutesToTime(visitStartTime, DESK_BATCH_SLOT_MINUTES) || visitStartTime;
  return {
    visitDate: safeDate === "INVALID_DATE" ? "" : safeDate,
    visitStartTime,
    visitEndTime,
  };
}

/** 建檔初始答案。 */
export function createMohwDeskInitialAnswers(
  elderCase: ElderCase,
  schedule: VisitSchedule,
): MohwLifeCareAnswers {
  const fromCase = createInitialMohwAnswers(elderCase, schedule);
  const inferredGender = inferGenderFromNationalId(elderCase.nationalId);
  const birthDate = formatDeskBirthDate(elderCase.birthDate ?? null);
  const clock = getDeskNowVisitClock();

  const householdCity = String(fromCase.household_city || "新北市");
  const householdDistrict = String(fromCase.household_district || elderCase.district || "永和區");
  const householdVillage = String(
    fromCase.household_village || elderCase.village || "",
  );
  const householdAddress = String(
    fromCase.household_address || elderCase.address || "",
  );

  return {
    ...MOHW_DESK_FORM_DEFAULTS,
    ...fromCase,
    // 一律帶入「今天＋現場時間」（民國），勿留西元 ISO
    visit_date: clock.visitDate || fromCase.visit_date,
    visit_start_time: clock.visitStartTime,
    visit_end_time: clock.visitEndTime,
    gender: inferredGender || String(fromCase.gender || elderCase.gender || ""),
    birth_date: birthDate,
    living_address_type: "與戶籍地址相同",
    living_address_note: "",
    living_city: householdCity,
    living_district: householdDistrict,
    living_village: householdVillage,
    living_address: householdAddress,
    living_address_other: "",
    // 畫面預填區碼；送出時若未再填會變成 0000000000
    phone: "02",
    mobile: "09",
    diseases: [MOHW_NONE_OF_ABOVE],
    recent_medical_event: "否",
    recent_medical_note: "",
    hearing_issue: "否",
    hearing_aid: "",
    life_difficulties_flag: "無",
    life_difficulties: [],
    worries_flag: "無",
    worries: [],
    service_willingness_flag: "無",
    service_willingness: [],
    home_safety_issues: [MOHW_NONE_OF_ABOVE],
  };
}
