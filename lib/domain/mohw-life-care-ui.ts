import type { GovernmentFormField } from "@/lib/domain/government-forms";
import type { ElderCase, VisitSchedule } from "@/lib/domain/types";
import {
  MOHW_LIFE_CARE_COLUMNS,
  type MohwLifeCareAnswers,
  type MohwLifeCareColumn,
} from "@/lib/domain/mohw-life-care-form";
import {
  displayOfficialOption,
  parseOfficialAllowedValues,
} from "@/lib/domain/mohw-life-care-options";
import { newTaipeiCareFormSampleAnswers } from "@/lib/domain/new-taipei-care-form";

export type MohwFormField = GovernmentFormField & {
  mohwKey: string;
  /** MOHW column index (1-based). */
  col: number;
  showWhen?: MohwFieldCondition[];
  /** Optional display labels parallel to `options` (official tokens stay in options). */
  optionLabels?: string[];
};

export type MohwFieldCondition =
  | { key: string; equals: string }
  | { key: string; notEquals: string }
  | { key: string; includes: string }
  | { key: string; notIn: string[] };

export type MohwCareFormSection = {
  title: string;
  fields: MohwFormField[];
};

export type MohwCareFormCompletion = {
  completed: number;
  required: number;
  percent: number;
  sections: Array<{
    title: string;
    completed: number;
    required: number;
    missingLabels: string[];
  }>;
  missingLabels: string[];
};

const QUESTIONNAIRE_SKIP_STATUSES = ["拒絕訪視", "查無此人", "無法溝通", "住址不詳"];

const UI_SECTIONS: Array<{ title: string; fromCol: number; toCol: number }> = [
  { title: "一、訪查資訊", fromCol: 1, toCol: 5 },
  { title: "二、基本資料", fromCol: 6, toCol: 17 },
  { title: "三、戶籍與居住地址", fromCol: 18, toCol: 28 },
  { title: "四、居住與家庭支持", fromCol: 29, toCol: 42 },
  { title: "五、身體健康", fromCol: 43, toCol: 55 },
  { title: "六、生活困難與社交", fromCol: 56, toCol: 70 },
  { title: "七、活動、情緒與服務意願", fromCol: 71, toCol: 81 },
  { title: "八、訪查員觀察", fromCol: 82, toCol: 89 },
  { title: "九、個資與健康資料同意", fromCol: 90, toCol: 92 },
  { title: "十、社政訪查人", fromCol: 93, toCol: 97 },
  { title: "十一、民政訪查人", fromCol: 98, toCol: 102 },
];

const CONDITIONAL_RULES: Record<string, MohwFieldCondition[]> = {
  line_id: [{ key: "line_id_status", equals: "有" }],
  emergency_contact_relation_other: [{ key: "emergency_contact_relation", equals: "其他" }],
  living_address_note: [{ key: "living_address_type", equals: "未住戶籍地址" }],
  living_city: [
    { key: "living_address_type", equals: "未住戶籍地址" },
    { key: "living_address_note", equals: "居住地址為" },
  ],
  living_district: [
    { key: "living_address_type", equals: "未住戶籍地址" },
    { key: "living_address_note", equals: "居住地址為" },
  ],
  living_village: [
    { key: "living_address_type", equals: "未住戶籍地址" },
    { key: "living_address_note", equals: "居住地址為" },
  ],
  living_address: [
    { key: "living_address_type", equals: "未住戶籍地址" },
    { key: "living_address_note", equals: "居住地址為" },
  ],
  living_address_other: [{ key: "living_address_type", equals: "查無此人" }],
  housing_type_other: [{ key: "housing_type", equals: "其他" }],
  cohabitation_status: [{ key: "living_status", equals: "與他人同住" }],
  cohabitant_relation: [{ key: "cohabitation_status", equals: "同住者有照顧能力" }],
  cohabitant_age: [{ key: "cohabitation_status", equals: "同住者有照顧能力" }],
  cohabitant_no_care_capacity_note: [
    { key: "cohabitation_status", equals: "同住者無照顧能力" },
  ],
  marital_status_other: [{ key: "marital_status", equals: "其他" }],
  sons_count: [{ key: "has_children", equals: "存" }],
  daughters_count: [{ key: "has_children", equals: "存" }],
  children_same_city: [{ key: "has_children", equals: "存" }],
  diseases_cancer_note: [{ key: "diseases", includes: "癌症" }],
  diseases_other_note: [{ key: "diseases", includes: "其他" }],
  recent_medical_note: [{ key: "recent_medical_event", equals: "是" }],
  hearing_aid: [{ key: "hearing_issue", equals: "是" }],
  life_difficulties: [{ key: "life_difficulties_flag", equals: "有" }],
  life_difficulties_other: [{ key: "life_difficulties", includes: "其他" }],
  worries: [{ key: "worries_flag", equals: "有" }],
  worries_other: [{ key: "worries", includes: "其他" }],
  help_sources_none: [{ key: "help_sources_flag", equals: "無" }],
  help_sources_none_other: [{ key: "help_sources_none", includes: "其他" }],
  help_sources_has: [{ key: "help_sources_flag", equals: "有" }],
  help_sources_has_other: [{ key: "help_sources_has", includes: "其他" }],
  information_channels_other: [{ key: "information_channels", includes: "其他" }],
  past_activities_other: [{ key: "past_activities", includes: "其他" }],
  desired_activities_other: [{ key: "desired_activities", includes: "其他" }],
  service_willingness: [{ key: "service_willingness_flag", equals: "有" }],
  service_willingness_referral_other: [{ key: "service_willingness", includes: "轉介：其他服務，長者期待" }],
  self_care_observation: [{ key: "self_care_flag", equals: "不可以" }],
  self_care_other: [{ key: "self_care_observation", includes: "其他" }],
  home_hygiene_other: [{ key: "home_hygiene_issues", includes: "其他" }],
  home_safety_other: [{ key: "home_safety_issues", includes: "其他" }],
};

const SENSITIVE_KEYS = new Set([
  "name",
  "national_id",
  "birth_date",
  "phone",
  "mobile",
  "line_id",
  "emergency_contact_name",
  "emergency_contact_phone",
  "household_address",
  "living_address",
  "social_worker_national_id",
  "civil_worker_national_id",
]);

export const mohwLifeCareSections: MohwCareFormSection[] = UI_SECTIONS.map((section) => ({
  title: section.title,
  fields: MOHW_LIFE_CARE_COLUMNS.filter(
    (column) => column.col >= section.fromCol && column.col <= section.toCol,
  ).map((column) => columnToMohwField(column)),
}));

export function columnToMohwField(column: MohwLifeCareColumn): MohwFormField {
  const label = column.header.replace(/\s*\*+$/, "").replace(/\*$/, "");
  const options = parseOfficialAllowedValues(column.allowedValues);
  let type: GovernmentFormField["type"] = "text";

  if (column.inputType.includes("多選")) {
    type = "multi_choice";
  } else if (column.inputType.includes("單選")) {
    type = "single_choice";
  } else if (column.inputType.includes("日期")) {
    type = "date";
  } else if (column.inputType === "數字") {
    type = "number";
  } else if (column.inputType.includes("時間")) {
    type = "text";
  } else if (options.length > 0 && !column.inputType) {
    type = "single_choice";
  }

  return {
    key: column.key,
    mohwKey: column.key,
    col: column.col,
    label,
    type,
    required: column.required,
    sensitive: SENSITIVE_KEYS.has(column.key),
    options: options.length > 0 ? options : defaultOptionsForKey(column.key),
    optionLabels: options.length > 0 ? options.map(displayOfficialOption) : undefined,
    showWhen: CONDITIONAL_RULES[column.key],
  };
}

function defaultOptionsForKey(key: string): string[] | undefined {
  // Fallback only when schema allowedValues is empty (should be rare after official sync).
  const defaults: Record<string, string[]> = {
    visit_status: ["已完成", "拒絕訪視", "查無此人", "無法溝通", "住址不詳"],
  };
  return defaults[key];
}

export function isMohwQuestionnaireSkipped(answers: MohwLifeCareAnswers) {
  const status = String(answers.visit_status ?? "");
  return QUESTIONNAIRE_SKIP_STATUSES.includes(status);
}

export function isMohwFieldVisible(field: MohwFormField, answers: MohwLifeCareAnswers) {
  if (isMohwQuestionnaireSkipped(answers) && field.col >= 29 && field.col <= 89) {
    return false;
  }

  if (!field.showWhen?.length) return true;

  return field.showWhen.every((condition) => matchesCondition(answers, condition));
}

function matchesCondition(answers: MohwLifeCareAnswers, condition: MohwFieldCondition) {
  const raw = answers[condition.key];
  const value = Array.isArray(raw) ? raw.join(";") : String(raw ?? "");

  if ("equals" in condition) return value === condition.equals;
  if ("notEquals" in condition) return value !== condition.notEquals && value !== "";
  if ("includes" in condition) return value.includes(condition.includes);
  if ("notIn" in condition) return !condition.notIn.includes(value);
  return true;
}

export function createInitialMohwAnswers(
  elderCase: ElderCase,
  schedule: VisitSchedule,
): MohwLifeCareAnswers {
  const livingSameAsHousehold =
    !elderCase.residenceAddress || elderCase.residenceAddress === elderCase.address;

  return {
    visit_date: schedule.visitDate,
    visit_status: "已完成",
    name: elderCase.name,
    gender: elderCase.gender ?? "",
    phone: elderCase.phone,
    mobile: elderCase.mobilePhone ?? "",
    line_id_status: elderCase.lineIdStatus ?? "",
    line_id: elderCase.lineIdNote ?? "",
    emergency_contact_name: elderCase.emergencyContactName ?? "",
    emergency_contact_relation: elderCase.emergencyContactRelationship ?? "",
    emergency_contact_phone: elderCase.emergencyContactPhone ?? "",
    household_city: elderCase.householdCity ?? "新北市",
    household_district: elderCase.householdDistrict ?? elderCase.district,
    household_village: elderCase.householdVillage ?? elderCase.village ?? "",
    household_address: elderCase.householdAddress ?? elderCase.address,
    living_address_type: livingSameAsHousehold ? "與戶籍地址相同" : "未住戶籍地址",
    living_city: elderCase.residenceCity ?? elderCase.householdCity ?? "新北市",
    living_district: elderCase.residenceDistrict ?? elderCase.district,
    living_village: elderCase.residenceVillage ?? elderCase.village ?? "",
    living_address: elderCase.residenceAddress ?? elderCase.address,
    living_address_note: livingSameAsHousehold
      ? ""
      : elderCase.residenceAddressNote || "居住地址為",
    consent_personal_data: "同意",
    consent_health_db: "同意",
    consent_signature: "是",
  };
}

export const mohwLifeCareSampleAnswers: MohwLifeCareAnswers = {
  visit_date: "2026-05-22",
  visit_start_time: "09:30",
  visit_end_time: "10:30",
  visit_status: "已完成",
  visit_notes: "首訪",
  name: newTaipeiCareFormSampleAnswers.name,
  gender: newTaipeiCareFormSampleAnswers.gender,
  birth_date: newTaipeiCareFormSampleAnswers.birth_date,
  national_id: "A123456789",
  phone: newTaipeiCareFormSampleAnswers.phone,
  mobile: newTaipeiCareFormSampleAnswers.mobile,
  line_id_status: "有",
  line_id: newTaipeiCareFormSampleAnswers.line_id,
  emergency_contact_name: "陳美玲",
  emergency_contact_relation: "子女",
  emergency_contact_phone: "0912-222-333",
  household_city: "新北市",
  household_district: "板橋區",
  household_village: "文化里",
  household_address: "文化路一段 100 號",
  living_address_type: "與戶籍地址相同",
  housing_type: newTaipeiCareFormSampleAnswers.housing_type,
  living_status: newTaipeiCareFormSampleAnswers.living_status,
  cohabitation_status: "同住者有照顧能力",
  education: "小學",
  marital_status: "喪偶",
  has_children: "存",
  sons_count: "1",
  daughters_count: "1",
  children_same_city: "是",
  health_self_rating: newTaipeiCareFormSampleAnswers.health_self_rating,
  height_cm: newTaipeiCareFormSampleAnswers.height_cm,
  weight_kg: newTaipeiCareFormSampleAnswers.weight_kg,
  weight_change_3m: newTaipeiCareFormSampleAnswers.weight_change_3m,
  appetite_3m: newTaipeiCareFormSampleAnswers.appetite_3m,
  diseases: newTaipeiCareFormSampleAnswers.diseases,
  recent_medical_event: newTaipeiCareFormSampleAnswers.recent_medical_event,
  hearing_issue: "否",
  hearing_aid: "否",
  vision_issue: newTaipeiCareFormSampleAnswers.vision_issue,
  family_interaction: newTaipeiCareFormSampleAnswers.family_interaction,
  neighbor_interaction: newTaipeiCareFormSampleAnswers.neighbor_interaction,
  life_difficulties_flag: "有",
  life_difficulties: ["外出交通不方便（例如缺乏公車或客運）"],
  worries_flag: "有",
  worries: ["自己經濟問題(如債務)"],
  help_sources_flag: "有",
  help_sources_has: newTaipeiCareFormSampleAnswers.help_sources,
  information_channels: newTaipeiCareFormSampleAnswers.information_channels,
  past_activities: ["參與宗教活動"],
  desired_activities: ["健身運動"],
  home_safety_feeling: newTaipeiCareFormSampleAnswers.home_safety_feeling,
  loneliness_2w: "只有幾天：1至6天",
  depressed_2w: "完全沒有",
  loss_interest_2w: "只有幾天：1至6天",
  service_willingness_flag: "有",
  service_willingness: ["關懷服務", "送餐服務"],
  mental_status: "無特殊情形",
  self_care_flag: "可以，但行動緩慢",
  self_care_observation: ["使用器具(例如輪椅、拐杖)就可以自行移動"],
  home_hygiene_issues: ["以上均無"],
  home_safety_issues: ["照明設備不足(如夜起時)"],
  consent_personal_data: "同意",
  consent_health_db: "同意",
  consent_signature: "是",
  social_worker_role: "社工",
  social_worker_name: "張社工",
  social_worker_national_id: "B223456782",
  social_worker_phone: "0933445566",
  social_worker_date: "2026-05-13",
};

export function calculateMohwCareFormCompletion(answers: MohwLifeCareAnswers): MohwCareFormCompletion {
  const sections = mohwLifeCareSections.map((section) => {
    const visibleFields = section.fields.filter((field) => isMohwFieldVisible(field, answers));
    const requiredFields = visibleFields.filter((field) => field.required);
    const missingFields = requiredFields.filter((field) => !hasMohwAnswer(answers[field.key]));

    return {
      title: section.title,
      completed: requiredFields.length - missingFields.length,
      required: requiredFields.length,
      missingLabels: missingFields.map((field) => field.label),
    };
  });

  const completed = sections.reduce((sum, section) => sum + section.completed, 0);
  const required = sections.reduce((sum, section) => sum + section.required, 0);

  return {
    completed,
    required,
    percent: required > 0 ? Math.round((completed / required) * 100) : 100,
    sections,
    missingLabels: sections.flatMap((section) => section.missingLabels),
  };
}

function hasMohwAnswer(value: MohwLifeCareAnswers[string]) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  return typeof value === "string" && value.trim().length > 0;
}

export function syncMohwConsentFromSubmission(
  answers: MohwLifeCareAnswers,
  submission: {
    consentSigned: boolean;
    consentScope: string[];
    signatureDataUrl: string;
  },
): MohwLifeCareAnswers {
  return {
    ...answers,
    consent_personal_data: submission.consentSigned ? "同意" : "不同意",
    consent_health_db: submission.consentScope.includes("research_use") ? "同意" : "不同意",
    consent_signature: submission.signatureDataUrl.trim() ? "是" : "否",
  };
}

export function syncMohwVisitMetaFromSubmission(
  answers: MohwLifeCareAnswers,
  submission: {
    visitResult: string;
    notes: string;
  },
): MohwLifeCareAnswers {
  const visitStatusMap: Record<string, string> = {
    訪視成功: "已完成",
    未遇: "查無此人",
    拒訪: "拒絕訪視",
  };

  return {
    ...answers,
    visit_status: visitStatusMap[submission.visitResult] ?? answers.visit_status ?? "已完成",
    visit_notes: submission.notes || answers.visit_notes,
  };
}
