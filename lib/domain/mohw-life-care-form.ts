import schema from "@/lib/domain/mohw-life-care-schema.json";
import type { CareFormAnswers } from "@/lib/domain/new-taipei-care-form";

export type MohwGapStatus = "has" | "partial" | "missing";

export type MohwLifeCareColumn = {
  col: number;
  header: string;
  key: string;
  gapStatus: MohwGapStatus;
  required: boolean;
  inputType: string;
  description: string;
  allowedValues: string;
  internalSource: string;
  internalKey: string;
  gapNote: string;
};

export type MohwLifeCareSchema = {
  version: string;
  templateName: string;
  columnCount: number;
  sourceFiles: string[];
  summary: Record<MohwGapStatus, number>;
  columns: MohwLifeCareColumn[];
};

export type MohwLifeCareAnswerValue = string | string[] | number | boolean | null | undefined;

/** Canonical 102-column answer bag keyed by `MohwLifeCareColumn.key`. */
export type MohwLifeCareAnswers = Partial<Record<string, MohwLifeCareAnswerValue>>;

export type MohwVisitMeta = {
  visitDate?: string | Date;
  visitStartTime?: string;
  visitEndTime?: string;
  visitStatus?: string;
  notes?: string;
  consentPersonalData?: boolean | string;
  consentHealthDb?: boolean | string;
  consentSignature?: boolean | string;
};

export type MohwCaseRegistry = {
  name?: string;
  nationalId?: string;
  birthDate?: string | Date;
  phone?: string;
  mobile?: string;
  householdCity?: string;
  householdDistrict?: string;
  householdVillage?: string;
  householdAddress?: string;
  livingCity?: string;
  livingDistrict?: string;
  livingVillage?: string;
  livingAddress?: string;
};

export const mohwLifeCareSchema = schema as MohwLifeCareSchema;

export const MOHW_LIFE_CARE_COLUMNS = mohwLifeCareSchema.columns;

export const MOHW_LIFE_CARE_HEADERS = MOHW_LIFE_CARE_COLUMNS.map((column) => column.header);

export const MOHW_LIFE_CARE_KEYS = MOHW_LIFE_CARE_COLUMNS.map((column) => column.key);

export function getMohwColumn(key: string) {
  return MOHW_LIFE_CARE_COLUMNS.find((column) => column.key === key);
}

export function summarizeMohwGap() {
  return mohwLifeCareSchema.summary;
}

/** Map simplified new-taipei care form keys → MOHW keys (best-effort for phase 1). */
export const NEW_TAIPEI_TO_MOHW_KEY: Record<string, string | string[]> = {
  name: "name",
  gender: "gender",
  birth_date: "birth_date",
  national_id: "national_id",
  phone: "phone",
  mobile: "mobile",
  line_id: "line_id",
  emergency_contact: ["emergency_contact_name"],
  household_address: ["household_city", "household_district", "household_village", "household_address"],
  living_address: ["living_city", "living_district", "living_village", "living_address"],
  housing_type: "housing_type",
  living_status: "living_status",
  education: "education",
  marital_status: "marital_status",
  children_status: ["has_children", "sons_count", "daughters_count", "children_same_city"],
  family_interaction: "family_interaction",
  neighbor_interaction: "neighbor_interaction",
  help_sources: ["help_sources_flag", "help_sources_has"],
  health_self_rating: "health_self_rating",
  height_cm: "height_cm",
  weight_kg: "weight_kg",
  weight_change_3m: "weight_change_3m",
  appetite_3m: "appetite_3m",
  diseases: "diseases",
  recent_medical_event: "recent_medical_event",
  hearing_issue: "hearing_issue",
  vision_issue: "vision_issue",
  life_difficulties: ["life_difficulties_flag", "life_difficulties"],
  worries: ["worries_flag", "worries"],
  information_channels: "information_channels",
  home_safety_feeling: "home_safety_feeling",
  loneliness_2w: "loneliness_2w",
  depressed_2w: "depressed_2w",
  loss_interest_2w: "loss_interest_2w",
  service_willingness: ["service_willingness_flag", "service_willingness"],
  suicide_ideation_observed: "mental_status",
  self_care_observation: ["self_care_flag", "self_care_observation"],
  home_hygiene_issues: "home_hygiene_issues",
  home_safety_issues: "home_safety_issues",
};

export function mergeCareFormIntoMohwAnswers(
  mohw: MohwLifeCareAnswers,
  careForm: CareFormAnswers,
): MohwLifeCareAnswers {
  const merged: MohwLifeCareAnswers = { ...mohw };

  for (const [sourceKey, target] of Object.entries(NEW_TAIPEI_TO_MOHW_KEY)) {
    const value = careForm[sourceKey as keyof CareFormAnswers];
    if (value === undefined || value === "") continue;

    const targets = Array.isArray(target) ? target : [target];
    for (const targetKey of targets) {
      if (merged[targetKey] === undefined || merged[targetKey] === "") {
        merged[targetKey] = value as MohwLifeCareAnswerValue;
      }
    }
  }

  if (Array.isArray(merged.help_sources_has) && !merged.help_sources_flag) {
    merged.help_sources_flag = "有";
  }

  if (Array.isArray(merged.life_difficulties) && !merged.life_difficulties_flag) {
    merged.life_difficulties_flag = merged.life_difficulties.length > 0 ? "有" : "無";
  }

  if (Array.isArray(merged.worries) && !merged.worries_flag) {
    merged.worries_flag = merged.worries.length > 0 ? "有" : "無";
  }

  if (Array.isArray(merged.service_willingness) && !merged.service_willingness_flag) {
    merged.service_willingness_flag = merged.service_willingness.length > 0 ? "有" : "無";
  }

  if (Array.isArray(merged.self_care_observation) && !merged.self_care_flag) {
    merged.self_care_flag = "有";
  }

  return merged;
}

export function mergeVisitMetaIntoMohwAnswers(
  mohw: MohwLifeCareAnswers,
  meta: MohwVisitMeta,
): MohwLifeCareAnswers {
  const merged: MohwLifeCareAnswers = { ...mohw };

  if (meta.visitDate) merged.visit_date = toIsoOrString(meta.visitDate);
  if (meta.visitStartTime) merged.visit_start_time = meta.visitStartTime;
  if (meta.visitEndTime) merged.visit_end_time = meta.visitEndTime;
  if (meta.visitStatus) merged.visit_status = meta.visitStatus;
  if (meta.notes) merged.visit_notes = meta.notes;
  if (meta.consentPersonalData !== undefined) {
    merged.consent_personal_data = formatConsent(meta.consentPersonalData);
  }
  if (meta.consentHealthDb !== undefined) {
    merged.consent_health_db = formatConsent(meta.consentHealthDb);
  }
  if (meta.consentSignature !== undefined) {
    merged.consent_signature = formatConsent(meta.consentSignature);
  }

  return merged;
}

export function mergeCaseRegistryIntoMohwAnswers(
  mohw: MohwLifeCareAnswers,
  caseRow: MohwCaseRegistry,
): MohwLifeCareAnswers {
  const merged: MohwLifeCareAnswers = { ...mohw };

  if (caseRow.name) merged.name = caseRow.name;
  if (caseRow.nationalId) merged.national_id = caseRow.nationalId;
  if (caseRow.birthDate) merged.birth_date = toIsoOrString(caseRow.birthDate);
  if (caseRow.phone) merged.phone = caseRow.phone;
  if (caseRow.mobile) merged.mobile = caseRow.mobile;
  if (caseRow.householdCity) merged.household_city = caseRow.householdCity;
  if (caseRow.householdDistrict) merged.household_district = caseRow.householdDistrict;
  if (caseRow.householdVillage) merged.household_village = caseRow.householdVillage;
  if (caseRow.householdAddress) merged.household_address = caseRow.householdAddress;
  if (caseRow.livingCity) merged.living_city = caseRow.livingCity;
  if (caseRow.livingDistrict) merged.living_district = caseRow.livingDistrict;
  if (caseRow.livingVillage) merged.living_village = caseRow.livingVillage;
  if (caseRow.livingAddress) merged.living_address = caseRow.livingAddress;

  return merged;
}

function formatConsent(value: boolean | string) {
  if (typeof value === "boolean") {
    return value ? "同意" : "不同意";
  }

  if (value === "是" || value === "同意") return "同意";
  if (value === "否" || value === "不同意") return "不同意";
  return value;
}

function toIsoOrString(value: string | Date) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}
