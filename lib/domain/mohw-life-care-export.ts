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

const SKIP_QUESTIONNAIRE = new Set(["拒絕訪視", "查無此人", "無法溝通", "住址不詳"]);

export function buildMohwLifeCareExportRow(input: MohwLifeCareExportInput): MohwLifeCareExportRow {
  const answers = buildMohwLifeCareAnswers(input);
  const headers = MOHW_LIFE_CARE_HEADERS;
  const visitStatus = String(answers.visit_status ?? "").trim();
  const skipQuestionnaire = SKIP_QUESTIONNAIRE.has(visitStatus);
  // AC:CN（col 29–92）問卷與同意欄不帶入；CO:CY 訪查人仍保留。
  const values = MOHW_LIFE_CARE_COLUMNS.map((column) => {
    if (skipQuestionnaire && column.col >= 29 && column.col <= 92) return "";
    return formatMohwCell(answers[column.key], column);
  });
  const keyed = Object.fromEntries(
    MOHW_LIFE_CARE_COLUMNS.map((column, index) => [column.key, values[index]]),
  );

  const requiredMissing = MOHW_LIFE_CARE_COLUMNS.filter(
    (column) => column.required &&
      !(skipQuestionnaire && column.col >= 29 && column.col <= 92) &&
      !values[column.col - 1]?.trim(),
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
  // 必須先看欄位語意，再處理數字，否則 Excel 日期序列會原樣流出。
  const raw: unknown = value;
  if (DATE_KEYS.has(column.key) && (typeof raw === "string" || typeof raw === "number" || raw instanceof Date)) {
    return formatRocDate(raw);
  }
  if (TIME_KEYS.has(column.key)) {
    if (raw instanceof Date) {
      if (Number.isNaN(raw.getTime())) return "INVALID_TIME";
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(raw);
      return `${parts.find(p => p.type === "hour")?.value}:${parts.find(p => p.type === "minute")?.value}`;
    }
    return formatTime(String(value).trim());
  }
  if (Array.isArray(value)) return value.map(v => String(v).trim()).join(";");
  if (typeof value === "boolean") {
    const allowed = (column.allowedValues ?? "").split(";");
    if (allowed.includes("同意") && allowed.includes("不同意")) return value ? "同意" : "不同意";
    if (allowed.includes("是") && allowed.includes("否")) return value ? "是" : "否";
    return String(value); // 不猜測非布林選項的意義。
  }
  const text = String(value).trim();
  if (PHONE_KEYS.has(column.key)) return formatMohwPhone(text);
  return text;
}

const OFFICIAL_ROC_DATE = /^\d{3}\/\d{2}\/\d{2}$/;

/**
 * ISO、Date、Excel 序列或民國斜線 → `yyy/MM/dd` 文字。
 * 年固定 3 碼、月日 2 碼；四碼年明確視為西元，不依「今年」猜測改寫。
 */
export function formatRocDate(input: string | Date | number) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return "INVALID_DATE";
    // 對齊 GAS：以台北時區拆出年月日
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(input);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return toRocParts(year, month, day) || "INVALID_DATE";
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

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return toRocParts(Number(iso[1]), Number(iso[2]), Number(iso[3])) || text;
  }

  // 明確附時區的 ISO timestamp 依臺灣時間取日期；不接受含糊尾綴。
  const stamp = text.match(
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/,
  );
  if (stamp) {
    const validDate = toRocParts(Number(stamp[1]), Number(stamp[2]), Number(stamp[3]));
    const dateTime = new Date(text);
    if (!validDate || Number.isNaN(dateTime.getTime())) return text;
    return formatRocDate(dateTime);
  }

  const slash = text.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    if (slash[1].length === 4 && Number(slash[1]) < 1912) return text;
    return toRocParts(Number(slash[1]), Number(slash[2]), Number(slash[3])) || text;
  }

  return text;
}

/** 能寫進匯出檔的官方民國日期文字；無法轉換則 null。 */
export function toOfficialRocDateText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const formatted = formatRocDate(value);
  if (!OFFICIAL_ROC_DATE.test(formatted)) return null;
  const [rocYear, month, day] = formatted.split("/").map(Number);
  if (rocYear < 1 || rocYear > 999) return null;
  const date = new Date(Date.UTC(rocYear + 1911, month - 1, day));
  return date.getUTCFullYear() === rocYear + 1911 && date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? formatted : null;
}

function excelSerialToRoc(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 10000 || serial > 80000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return null;
  return toRocParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function toRocParts(year: number, month: number, day: number) {
  const rocYear = year >= 1911 ? year - 1911 : year;
  const westernYear = rocYear + 1911;
  const date = new Date(Date.UTC(westernYear, month - 1, day));
  if (
    rocYear < 1 ||
    rocYear > 999 ||
    date.getUTCFullYear() !== westernYear ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${String(rocYear).padStart(3, "0")}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

/** 只清理明確電話分隔符；不刪字母、不猜測遺失的前導 0。 */
export function formatMohwPhone(input: string) {
  const text = String(input ?? "").trim();
  if (!text || !/^[0-9 ()-]+$/.test(text)) return text;
  return text.replace(/[ ()-]/g, "");
}

/** `HH:mm` 24h; Excel serial fractions also supported. */
export function formatTime(input: string) {
  const text = String(input).trim();
  const numeric = Number(text);
  if (/^0(?:\.\d+)?$/.test(text) && numeric >= 0 && numeric < 1) {
    // 依分鐘截取，避免 23:59:59 四捨五入成不合法的 24:00。
    const totalMinutes = Math.min(1439, Math.floor(numeric * 1440 + 1e-8));
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match && Number(match[1]) <= 23 && Number(match[2]) <= 59) {
    return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
  }
  return text;
}
