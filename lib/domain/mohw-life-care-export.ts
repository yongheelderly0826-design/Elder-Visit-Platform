import type { CareFormAnswers } from "@/lib/domain/new-taipei-care-form";
import {
  MOHW_LIFE_CARE_COLUMNS,
  MOHW_LIFE_CARE_HEADERS,
  mergeCareFormIntoMohwAnswers,
  mergeCaseRegistryIntoMohwAnswers,
  mergeVisitMetaIntoMohwAnswers,
  type MohwCaseRegistry,
  type MohwLifeCareAnswers,
  type MohwLifeCareColumn,
  type MohwVisitMeta,
} from "@/lib/domain/mohw-life-care-form";

export type MohwLifeCareExportInput = {
  /** Preferred: already keyed by MOHW column keys. */
  mohwAnswers?: MohwLifeCareAnswers;
  /** Fallback: simplified 41-field care form. */
  careForm?: CareFormAnswers;
  visitMeta?: MohwVisitMeta;
  caseRegistry?: MohwCaseRegistry;
};

export type MohwLifeCareExportRow = {
  headers: string[];
  values: string[];
  keyed: Record<string, string>;
  gapCounts: {
    filled: number;
    empty: number;
    requiredMissing: number;
  };
};

const MULTI_VALUE_KEYS = new Set(
  MOHW_LIFE_CARE_COLUMNS.filter((column) => column.inputType.includes("多選")).map(
    (column) => column.key,
  ),
);

const DATE_KEYS = new Set(["visit_date", "birth_date", "social_worker_date", "civil_worker_date"]);

const TIME_KEYS = new Set(["visit_start_time", "visit_end_time"]);

const PHONE_KEYS = new Set([
  "phone",
  "mobile",
  "emergency_contact_phone",
  "social_worker_phone",
  "civil_worker_phone",
]);

/** Visit result labels in UI → MOHW 訪視狀態 allowed values. */
const VISIT_STATUS_MAP: Record<string, string> = {
  訪視成功: "已完成",
  完成訪視: "已完成",
  已完成: "已完成",
  未遇: "查無此人",
  拒訪: "拒絕訪視",
  拒絕訪視: "拒絕訪視",
  無法溝通: "無法溝通",
  住址不詳: "住址不詳",
};

export function buildMohwLifeCareAnswers(input: MohwLifeCareExportInput): MohwLifeCareAnswers {
  let answers: MohwLifeCareAnswers = { ...(input.mohwAnswers ?? {}) };

  if (input.caseRegistry) {
    answers = mergeCaseRegistryIntoMohwAnswers(answers, input.caseRegistry);
  }

  if (input.careForm) {
    answers = mergeCareFormIntoMohwAnswers(answers, input.careForm);
  }

  if (input.visitMeta) {
    answers = mergeVisitMetaIntoMohwAnswers(answers, input.visitMeta);
  }

  if (answers.visit_status && typeof answers.visit_status === "string") {
    answers.visit_status = VISIT_STATUS_MAP[answers.visit_status] ?? answers.visit_status;
  }

  return answers;
}

export function buildMohwLifeCareExportRow(input: MohwLifeCareExportInput): MohwLifeCareExportRow {
  const answers = buildMohwLifeCareAnswers(input);
  const headers = MOHW_LIFE_CARE_HEADERS;
  const values = MOHW_LIFE_CARE_COLUMNS.map((column) => formatMohwCell(answers[column.key], column));
  const keyed = Object.fromEntries(
    MOHW_LIFE_CARE_COLUMNS.map((column, index) => [column.key, values[index]]),
  );

  const requiredMissing = MOHW_LIFE_CARE_COLUMNS.filter(
    (column) => column.required && !values[column.col - 1]?.trim(),
  ).length;
  const filled = values.filter((value) => value.trim().length > 0).length;

  return {
    headers,
    values,
    keyed,
    gapCounts: {
      filled,
      empty: values.length - filled,
      requiredMissing,
    },
  };
}

export function buildMohwLifeCareWorkbookRows(inputs: MohwLifeCareExportInput[]) {
  const headerRow = MOHW_LIFE_CARE_HEADERS;
  const dataRows = inputs.map((input) => buildMohwLifeCareExportRow(input).values);
  return [headerRow, ...dataRows];
}

export function formatMohwCell(value: MohwLifeCareAnswers[string], column: MohwLifeCareColumn) {
  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join(";");
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (typeof value === "number") {
    return String(value);
  }

  const text = String(value).trim();
  if (!text) return "";

  if (DATE_KEYS.has(column.key)) {
    return formatRocDate(text);
  }

  if (TIME_KEYS.has(column.key)) {
    return formatTime(text);
  }

  if (PHONE_KEYS.has(column.key)) {
    return formatMohwPhone(text);
  }

  if (MULTI_VALUE_KEYS.has(column.key) && text.includes(",")) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(";");
  }

  return text;
}

const OFFICIAL_ROC_DATE = /^\d{3}\/\d{2}\/\d{2}$/;

/**
 * ISO、Date、Excel 序列或民國斜線 → `yyy/MM/dd` 文字。
 * 年固定 3 碼（048、113），月日 2 碼，對齊範本例子 113/06/15。
 */
export function formatRocDate(input: string | Date | number) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return "";
    return toRocParts(input.getFullYear(), input.getMonth() + 1, input.getDate());
  }

  if (typeof input === "number") {
    return excelSerialToRoc(input) ?? String(input);
  }

  const text = String(input).trim();
  if (!text) return "";

  if (/^\d{4,6}(\.\d+)?$/.test(text)) {
    const fromSerial = excelSerialToRoc(Number(text));
    if (fromSerial) return fromSerial;
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return toRocParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = text.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    return toRocParts(Number(slash[1]), Number(slash[2]), Number(slash[3]));
  }

  return text;
}

/** 能寫進匯出檔的官方民國日期文字；無法轉換則 null。 */
export function toOfficialRocDateText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (value instanceof Date || typeof value === "number" || typeof value === "string") {
    const formatted = formatRocDate(value);
    return OFFICIAL_ROC_DATE.test(formatted) ? formatted : null;
  }
  const formatted = formatRocDate(String(value));
  return OFFICIAL_ROC_DATE.test(formatted) ? formatted : null;
}

function excelSerialToRoc(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 10000 || serial > 80000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return null;
  return toRocParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function toRocParts(year: number, month: number, day: number) {
  const currentWestern = new Date().getFullYear();
  let rocYear: number;
  if (year >= 1911) {
    // Excel 常把民國 28/5/10 誤讀成 2028 → 西元年 > 今年時還原為 ROC yy
    rocYear = year > currentWestern ? year % 100 : year - 1911;
  } else {
    rocYear = year; // 已是民國（0115 → 115）
  }
  return `${String(rocYear).padStart(3, "0")}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

/** 還原電話／手機前導 0（Sheets 常吃掉）. */
export function formatMohwPhone(input: string) {
  const text = input.trim();
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (!digits) return text;
  if (/^09\d{8}$/.test(digits) || /^0[2-8]\d{7,9}$/.test(digits)) return digits;
  if (/^9\d{8}$/.test(digits)) return `0${digits}`;
  if (/^[2-8]\d{7,9}$/.test(digits)) return `0${digits}`;
  return text;
}

/** `HH:mm` 24h; Excel serial fractions also supported. */
export function formatTime(input: string) {
  const numeric = Number(input);
  if (!Number.isNaN(numeric) && numeric > 0 && numeric < 1) {
    const totalMinutes = Math.round(numeric * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
  }

  return input;
}
