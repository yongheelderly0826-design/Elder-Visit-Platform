export type MohwExportCandidate = {
  caseId: string;
  encodedId: string;
  externalId: string;
  name: string;
  district: string;
  village: string;
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

export function mapMohwExportCandidate(raw: Record<string, unknown>): MohwExportCandidate {
  return {
    caseId: String(raw.case_id ?? ""),
    encodedId: String(raw.encoded_id ?? ""),
    externalId: String(raw.external_id ?? ""),
    name: String(raw.name ?? ""),
    district: String(raw.visit_district ?? ""),
    village: String(raw.visit_village ?? ""),
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
