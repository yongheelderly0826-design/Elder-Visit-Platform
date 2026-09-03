import {
  MOHW_LIFE_CARE_COLUMNS,
  type MohwLifeCareAnswers,
} from "@/lib/domain/mohw-life-care-form";
import {
  normalizeMohwAnswersOptions,
  normalizeMohwOptionValue,
  parseOfficialAllowedValues,
} from "@/lib/domain/mohw-life-care-options";

export type MohwValidationError = {
  /** Excel-style cell, e.g. `I3` */
  cell: string;
  /** 1-based column index */
  col: number;
  /** Column letter, e.g. `I` */
  colLetter: string;
  key: string;
  label: string;
  code:
    | "REQUIRED"
    | "INVALID_NATIONAL_ID"
    | "INVALID_DATE"
    | "INVALID_TIME"
    | "INVALID_OPTION"
    | "INVALID_MULTI"
    | "INVALID_NUMBER"
    | "MAX_LENGTH"
    | "PHONE_OR_MOBILE"
    | "VISITOR_REQUIRED";
  message: string;
  /** Full MOHW-style message: `I3 身分證號碼格式不正確` */
  display: string;
};

export type MohwValidationResult = {
  ok: boolean;
  errors: MohwValidationError[];
  /** Same format as central system upload result lines */
  errorLines: string[];
};

const SKIP_QUESTIONNAIRE = new Set(["拒絕訪視", "查無此人", "無法溝通", "住址不詳"]);

const NATIONAL_ID_KEYS = new Set([
  "national_id",
  "social_worker_national_id",
  "civil_worker_national_id",
]);

const DATE_KEYS = new Set([
  "visit_date",
  "birth_date",
  "social_worker_date",
  "civil_worker_date",
]);

const TIME_KEYS = new Set(["visit_start_time", "visit_end_time"]);

const NOTE_MAX = 200;

type Cond =
  | { type: "always" }
  | { type: "equals"; key: string; value: string }
  | { type: "includes"; key: string; value: string }
  | { type: "and"; rules: Cond[] }
  | { type: "or"; rules: Cond[] };

/** Conditional required rules aligned with 生活關懷表檔案說明範本 */
const CONDITIONAL_REQUIRED: Array<{ key: string; when: Cond; message?: string }> = [
  { key: "line_id", when: { type: "equals", key: "line_id_status", value: "有" } },
  {
    key: "living_address_note",
    when: { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
  },
  {
    key: "living_city",
    when: {
      type: "and",
      rules: [
        { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
        { type: "equals", key: "living_address_note", value: "居住地址為" },
      ],
    },
  },
  {
    key: "living_district",
    when: {
      type: "and",
      rules: [
        { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
        { type: "equals", key: "living_address_note", value: "居住地址為" },
      ],
    },
  },
  {
    key: "living_village",
    when: {
      type: "and",
      rules: [
        { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
        { type: "equals", key: "living_address_note", value: "居住地址為" },
      ],
    },
  },
  {
    key: "living_address",
    when: {
      type: "and",
      rules: [
        { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
        { type: "equals", key: "living_address_note", value: "居住地址為" },
      ],
    },
  },
  {
    key: "living_address_other",
    when: { type: "equals", key: "living_address_type", value: "查無此人" },
  },
  {
    key: "housing_type_other",
    when: { type: "equals", key: "housing_type", value: "其他" },
    message: "住宅類型=其他時必須填寫其他說明",
  },
  {
    key: "cohabitation_status",
    when: { type: "equals", key: "living_status", value: "與他人同住" },
  },
  {
    key: "cohabitant_relation",
    when: { type: "equals", key: "cohabitation_status", value: "同住者有照顧能力" },
  },
  {
    key: "cohabitant_age",
    when: { type: "equals", key: "cohabitation_status", value: "同住者有照顧能力" },
  },
  {
    key: "cohabitant_no_care_capacity_note",
    when: { type: "equals", key: "cohabitation_status", value: "同住者無照顧能力" },
  },
  {
    key: "marital_status_other",
    when: { type: "equals", key: "marital_status", value: "其他" },
    message: "婚姻狀況=其他時必須填寫其他說明",
  },
  { key: "sons_count", when: { type: "equals", key: "has_children", value: "存" } },
  { key: "daughters_count", when: { type: "equals", key: "has_children", value: "存" } },
  { key: "children_same_city", when: { type: "equals", key: "has_children", value: "存" } },
  {
    key: "diseases_cancer_note",
    when: { type: "includes", key: "diseases", value: "癌症" },
    message: "疾病史包含癌症時必須填寫癌症說明",
  },
  {
    key: "diseases_other_note",
    when: { type: "includes", key: "diseases", value: "其他" },
    message: "疾病史包含其他時必須填寫其他說明",
  },
  {
    key: "recent_medical_note",
    when: { type: "equals", key: "recent_medical_event", value: "是" },
  },
  {
    key: "hearing_aid",
    when: { type: "equals", key: "hearing_issue", value: "是" },
  },
  {
    key: "life_difficulties",
    when: { type: "equals", key: "life_difficulties_flag", value: "有" },
  },
  {
    key: "life_difficulties_other",
    when: { type: "includes", key: "life_difficulties", value: "其他" },
  },
  { key: "worries", when: { type: "equals", key: "worries_flag", value: "有" } },
  {
    key: "worries_other",
    when: { type: "includes", key: "worries", value: "其他" },
  },
  {
    key: "help_sources_none",
    when: { type: "equals", key: "help_sources_flag", value: "無" },
  },
  {
    key: "help_sources_none_other",
    when: { type: "includes", key: "help_sources_none", value: "其他" },
  },
  {
    key: "help_sources_has",
    when: { type: "equals", key: "help_sources_flag", value: "有" },
  },
  {
    key: "help_sources_has_other",
    when: { type: "includes", key: "help_sources_has", value: "其他" },
  },
  {
    key: "information_channels_other",
    when: { type: "includes", key: "information_channels", value: "其他" },
  },
  {
    key: "past_activities_other",
    when: { type: "includes", key: "past_activities", value: "其他" },
  },
  {
    key: "desired_activities_other",
    when: { type: "includes", key: "desired_activities", value: "其他" },
  },
  {
    key: "service_willingness",
    when: { type: "equals", key: "service_willingness_flag", value: "有" },
  },
  {
    key: "service_willingness_referral_other",
    when: { type: "includes", key: "service_willingness", value: "轉介：其他服務，長者期待" },
  },
  {
    key: "self_care_observation",
    when: { type: "equals", key: "self_care_flag", value: "不可以" },
  },
  {
    key: "self_care_other",
    when: { type: "includes", key: "self_care_observation", value: "其他" },
  },
  {
    key: "home_hygiene_other",
    when: { type: "includes", key: "home_hygiene_issues", value: "其他" },
  },
  {
    key: "home_safety_other",
    when: { type: "includes", key: "home_safety_issues", value: "其他" },
  },
];

export function colIndexToLetter(col: number): string {
  let n = col;
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

export function mohwCellRef(col: number, row: number): string {
  return `${colIndexToLetter(col)}${row}`;
}

/** Taiwan national ID / ROC ID check digit (same algorithm as GAS Validation.gs). */
export function validateTaiwanId(id: string): boolean {
  if (!id || id.length !== 10) return false;
  const letters = "ABCDEFGHJKLMNPQRSTUVXYWZIO";
  const letterIndex = letters.indexOf(id.charAt(0).toUpperCase());
  if (letterIndex === -1) return false;
  if (!/^[A-Z][12]\d{8}$/i.test(id)) return false;

  const nums = [Math.floor(letterIndex / 10) + 1, letterIndex % 10];
  for (let i = 1; i < 9; i++) {
    nums.push(Number.parseInt(id.charAt(i), 10));
  }
  const checksum = Number.parseInt(id.charAt(9), 10);
  let sum = nums[0] + nums[1] * 9;
  for (let j = 2; j < 10; j++) {
    sum += nums[j] * (10 - j);
  }
  return (10 - (sum % 10)) % 10 === checksum;
}

export function isRocDate(value: string): boolean {
  // Accept ROC yyy/M/d or padded; also ISO yyyy-MM-dd (will be converted on export)
  if (/^\d{1,3}\/\d{1,2}\/\d{1,2}$/.test(value)) {
    const [y, m, d] = value.split("/").map(Number);
    return y >= 1 && y <= 200 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  return false;
}

export function isHhMm(value: string): boolean {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function asString(value: MohwLifeCareAnswers[string]): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(";");
  return String(value).trim();
}

function asList(value: MohwLifeCareAnswers[string]): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  const text = asString(value);
  if (!text) return [];
  return text.split(/[;；]/).map((v) => v.trim()).filter(Boolean);
}

function hasValue(value: MohwLifeCareAnswers[string]): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return asString(value).length > 0;
}

function evalCond(answers: MohwLifeCareAnswers, cond: Cond): boolean {
  if (cond.type === "always") return true;
  if (cond.type === "equals") return asString(answers[cond.key]) === cond.value;
  if (cond.type === "includes") return asList(answers[cond.key]).some((v) => v.includes(cond.value) || v === cond.value);
  if (cond.type === "and") return cond.rules.every((rule) => evalCond(answers, rule));
  if (cond.type === "or") return cond.rules.some((rule) => evalCond(answers, rule));
  return false;
}

function columnByKey(key: string) {
  return MOHW_LIFE_CARE_COLUMNS.find((column) => column.key === key);
}

function pushError(
  errors: MohwValidationError[],
  opts: {
    key: string;
    row: number;
    code: MohwValidationError["code"];
    message: string;
  },
) {
  const column = columnByKey(opts.key);
  if (!column) return;
  const colLetter = colIndexToLetter(column.col);
  const cell = `${colLetter}${opts.row}`;
  const label = column.header.replace(/\s*\*+$/, "").replace(/\*$/, "");
  errors.push({
    cell,
    col: column.col,
    colLetter,
    key: opts.key,
    label,
    code: opts.code,
    message: opts.message,
    display: `${cell} ${opts.message}`,
  });
}

/**
 * Validate one MOHW life-care row.
 * @param row Excel data row number (header is row 1; first data row is usually 2)
 */
export function validateMohwLifeCareRow(
  answers: MohwLifeCareAnswers,
  options: { row?: number } = {},
): MohwValidationResult {
  const row = options.row ?? 2;
  const errors: MohwValidationError[] = [];
  answers = normalizeMohwAnswersOptions(answers);
  const visitStatus = asString(answers.visit_status);
  const skipQuestionnaire = SKIP_QUESTIONNAIRE.has(visitStatus);

  // Always-required (non-questionnaire) fields
  const alwaysRequired = MOHW_LIFE_CARE_COLUMNS.filter((column) => {
    if (!column.required) return false;
    // Questionnaire required fields start from housing_type (col 29)
    if (skipQuestionnaire && column.col >= 29 && column.col <= 89) return false;
    // Visitor fields handled as either-or below
    if (column.col >= 93) return false;
    return true;
  });

  for (const column of alwaysRequired) {
    if (!hasValue(answers[column.key])) {
      pushError(errors, {
        key: column.key,
        row,
        code: "REQUIRED",
        message: `${column.header.replace(/\s*\*+$/, "").replace(/\*$/, "")}為必填`,
      });
    }
  }

  // Phone or mobile
  if (!hasValue(answers.phone) && !hasValue(answers.mobile)) {
    pushError(errors, {
      key: "phone",
      row,
      code: "PHONE_OR_MOBILE",
      message: "電話、手機擇一必填",
    });
  }

  // Conditional required (questionnaire skipped → skip col 29–89 conditionals)
  for (const rule of CONDITIONAL_REQUIRED) {
    const column = columnByKey(rule.key);
    if (!column) continue;
    if (skipQuestionnaire && column.col >= 29 && column.col <= 89) continue;
    if (!evalCond(answers, rule.when)) continue;
    if (!hasValue(answers[rule.key])) {
      pushError(errors, {
        key: rule.key,
        row,
        code: "REQUIRED",
        message: rule.message ?? `${column.header.replace(/\s*\*+$/, "").replace(/\*$/, "")}為條件必填`,
      });
    }
  }

  // Social / civil visitor either-or
  const hasSocial =
    hasValue(answers.social_worker_role) ||
    hasValue(answers.social_worker_name) ||
    hasValue(answers.social_worker_national_id) ||
    hasValue(answers.social_worker_phone) ||
    hasValue(answers.social_worker_date);
  const hasCivil =
    hasValue(answers.civil_worker_role) ||
    hasValue(answers.civil_worker_name) ||
    hasValue(answers.civil_worker_national_id) ||
    hasValue(answers.civil_worker_phone) ||
    hasValue(answers.civil_worker_date);

  if (!hasSocial && !hasCivil) {
    pushError(errors, {
      key: "social_worker_role",
      row,
      code: "VISITOR_REQUIRED",
      message: "社政訪查人與民政訪查人擇一必填",
    });
  }

  if (hasSocial) {
    for (const key of [
      "social_worker_role",
      "social_worker_name",
      "social_worker_national_id",
      "social_worker_phone",
      "social_worker_date",
    ] as const) {
      if (!hasValue(answers[key])) {
        pushError(errors, {
          key,
          row,
          code: "REQUIRED",
          message: `${columnByKey(key)?.header ?? key}為必填（已填社政訪查人）`,
        });
      }
    }
  }

  if (hasCivil) {
    for (const key of [
      "civil_worker_role",
      "civil_worker_name",
      "civil_worker_national_id",
      "civil_worker_phone",
      "civil_worker_date",
    ] as const) {
      if (!hasValue(answers[key])) {
        pushError(errors, {
          key,
          row,
          code: "REQUIRED",
          message: `${columnByKey(key)?.header ?? key}為必填（已填民政訪查人）`,
        });
      }
    }
  }

  // Format checks for filled values
  for (const column of MOHW_LIFE_CARE_COLUMNS) {
    const raw = answers[column.key];
    if (!hasValue(raw)) continue;
    if (skipQuestionnaire && column.col >= 29 && column.col <= 89) continue;

    const text = asString(raw);

    if (NATIONAL_ID_KEYS.has(column.key) && !validateTaiwanId(text)) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_NATIONAL_ID",
        message: "身分證號碼格式不正確",
      });
    }

    if (DATE_KEYS.has(column.key) && !isRocDate(text)) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_DATE",
        message: "日期格式不正確（請用民國年 yyy/MM/dd 或 yyyy-MM-dd）",
      });
    }

    if (TIME_KEYS.has(column.key) && !isHhMm(text)) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_TIME",
        message: "時間格式不正確（請用 HH:mm）",
      });
    }

    if (column.inputType === "數字" && Number.isNaN(Number(text))) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_NUMBER",
        message: "必須為數字",
      });
    }

    if (column.allowedValues) {
      const allowed = parseOfficialAllowedValues(column.allowedValues);

      if (allowed.length > 0) {
        if (column.inputType.includes("多選")) {
          const values = asList(raw).map((value) =>
            normalizeMohwOptionValue(column.key, value),
          );
          const invalid = values.filter((value) => !allowed.includes(value));
          // Also reject comma separators (MOHW requires ;)
          if (typeof raw === "string" && raw.includes(",") && !raw.includes(";")) {
            pushError(errors, {
              key: column.key,
              row,
              code: "INVALID_MULTI",
              message: "多選請用半形分號 ; 分隔，不可使用 ,",
            });
          } else if (invalid.length > 0) {
            pushError(errors, {
              key: column.key,
              row,
              code: "INVALID_OPTION",
              message: `含有不允許的選項：${invalid.join("、")}`,
            });
          }
        } else if (column.inputType.includes("單選")) {
          const normalized = normalizeMohwOptionValue(column.key, text);
          if (!allowed.includes(normalized)) {
            pushError(errors, {
              key: column.key,
              row,
              code: "INVALID_OPTION",
              message: `選項不在允許值內（官方：${allowed.join("、")}）`,
            });
          }
        }
      }
    }

    if (
      (column.key.includes("other") || column.key === "visit_notes") &&
      text.length > NOTE_MAX
    ) {
      pushError(errors, {
        key: column.key,
        row,
        code: "MAX_LENGTH",
        message: `字數不可超過 ${NOTE_MAX} 字`,
      });
    }
  }

  // De-duplicate by cell+code
  const seen = new Set<string>();
  const unique = errors.filter((error) => {
    const id = `${error.cell}:${error.code}:${error.message}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return {
    ok: unique.length === 0,
    errors: unique,
    errorLines: unique.map((error) => error.display),
  };
}

export function validateMohwLifeCareBatch(
  rows: MohwLifeCareAnswers[],
  options: { startRow?: number } = {},
): {
  ok: boolean;
  successCount: number;
  failCount: number;
  results: Array<MohwValidationResult & { row: number }>;
  errorLines: string[];
} {
  const startRow = options.startRow ?? 2;
  const results = rows.map((answers, index) => {
    const row = startRow + index;
    return { row, ...validateMohwLifeCareRow(answers, { row }) };
  });
  const successCount = results.filter((result) => result.ok).length;
  const failCount = results.length - successCount;
  return {
    ok: failCount === 0,
    successCount,
    failCount,
    results,
    errorLines: results.flatMap((result) => result.errorLines),
  };
}
