export type MohwExportCandidate = {
  caseId: string;
  encodedId: string;
  externalId: string;
  name: string;
  district: string;
  village: string;
  /** 訪視日（民國或 ISO）；篩選整批用 */
  visitDate: string;
  careformId: string;
  careformStatus: string;
  visitResult: string;
  submittedAt: string;
  auditedAt: string;
  auditDecision: string;
  exportReady: boolean;
  validationOk: boolean;
  errorCount: number;
  errorLines: string[];
};

/** ISO／時間戳 → 台北日曆 yyyy-MM-dd（避免 UTC 切日差一天）。 */
export function toTaipeiCalendarDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

/** 統一成 yyyy-MM-dd，無法解析則空字串。 */
export function normalizeMohwFilterDate(value: unknown): string {
  // 關懷表畫面常存「115 / 10 / 28」含空白；先去掉空白再解析
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[./．。]/g, "/");
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const roc = text.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (roc) {
    const year = Number(roc[1]) + 1911;
    const month = String(Number(roc[2])).padStart(2, "0");
    const day = String(Number(roc[3])).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  // 帶時間的 ISO：用台北日，勿直接切 UTC 日期
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(value ?? "").trim()) || Number.isFinite(Date.parse(String(value ?? "")))) {
    return toTaipeiCalendarDate(value);
  }
  const stamped = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return stamped ? stamped[1] : "";
}

/** 列表用訪視日：優先 answers.visit_date，其次送出日（台北）。 */
export function mohwCandidateFilterDate(item: Pick<MohwExportCandidate, "visitDate" | "submittedAt">) {
  return normalizeMohwFilterDate(item.visitDate) || toTaipeiCalendarDate(item.submittedAt);
}

/** 匯出日期篩選基準：只依訪視日，或只依登打／送出日（台北）。 */
export type MohwDateFilterMode = "visit" | "submitted";

/** 依 mode 取出要比對的 yyyy-MM-dd（訪視日或登打／送出日）。 */
export function mohwCandidateDateForMode(
  item: Pick<MohwExportCandidate, "visitDate" | "submittedAt">,
  mode: MohwDateFilterMode = "visit",
) {
  if (mode === "submitted") {
    return toTaipeiCalendarDate(item.submittedAt);
  }
  return normalizeMohwFilterDate(item.visitDate);
}

/** 是否符合日期篩選：可單日，或起迄區間（含兩端；依 mode 只比對一個欄位）。 */
export function mohwCandidateMatchesDateFilter(
  item: Pick<MohwExportCandidate, "visitDate" | "submittedAt">,
  filterDate: string,
  mode: MohwDateFilterMode = "visit",
  filterDateEnd?: string,
) {
  const from = normalizeMohwFilterDate(filterDate);
  const to = normalizeMohwFilterDate(filterDateEnd);
  if (!from && !to) return true;
  const day = mohwCandidateDateForMode(item, mode);
  if (!day) return false;
  if (from && to) {
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    return day >= start && day <= end;
  }
  const want = from || to;
  return day === want;
}

export function mohwCandidateAreaLabel(item: Pick<MohwExportCandidate, "district" | "village">) {
  return `${item.district} ${item.village}`.trim();
}

export function mapMohwExportCandidate(raw: Record<string, unknown>): MohwExportCandidate {
  return {
    caseId: String(raw.case_id ?? ""),
    encodedId: String(raw.encoded_id ?? ""),
    externalId: String(raw.external_id ?? ""),
    name: String(raw.name ?? ""),
    district: String(raw.visit_district ?? ""),
    village: String(raw.visit_village ?? ""),
    visitDate: String(raw.visit_date ?? ""),
    careformId: String(raw.careform_id ?? ""),
    careformStatus: String(raw.careform_status ?? ""),
    visitResult: String(raw.visit_result ?? ""),
    submittedAt: String(raw.submitted_at ?? ""),
    auditedAt: String(raw.audited_at ?? ""),
    auditDecision: String(raw.audit_decision ?? ""),
    exportReady: Boolean(raw.export_ready),
    validationOk: Boolean(raw.validation_ok),
    errorCount: Number(raw.error_count ?? 0),
    errorLines: Array.isArray(raw.error_lines) ? raw.error_lines.map(String) : [],
  };
}
