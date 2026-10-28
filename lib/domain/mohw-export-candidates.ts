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

/** 統一成 yyyy-MM-dd，無法解析則空字串。 */
export function normalizeMohwFilterDate(value: unknown): string {
  const text = String(value ?? "").trim();
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
  const stamped = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return stamped ? stamped[1] : "";
}

/** 篩選用日期：優先訪視日，其次送出日。 */
export function mohwCandidateFilterDate(item: Pick<MohwExportCandidate, "visitDate" | "submittedAt">) {
  return normalizeMohwFilterDate(item.visitDate) || normalizeMohwFilterDate(item.submittedAt);
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
