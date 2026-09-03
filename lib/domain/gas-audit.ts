import type { AuditCheck, AuditQueueItem } from "@/lib/domain/types";

type GasAuditRow = Record<string, unknown>;

function asString(value: unknown) {
  return value == null ? "" : String(value);
}

function asBool(value: unknown) {
  return value === true || value === "true" || value === "是" || value === "TRUE";
}

function buildChecks(row: GasAuditRow): AuditCheck[] {
  const visitResult = asString(row.visit_result);
  const consentSigned = asBool(row.consent_signed);
  const validationOk = row.validation_ok !== false;
  const errorCount = Number(row.error_count ?? 0);
  const status = asString(row.careform_status);

  return [
    {
      key: "careform_submitted",
      label: "關懷表已送出",
      severity: "blocking",
      passed: status === "已提交" || status === "已稽核" || status === "待補件",
      message: status ? `目前狀態：${status}` : "尚無關懷表送出紀錄。",
    },
    {
      key: "visit_result_present",
      label: "訪查結果完整",
      severity: "blocking",
      passed: Boolean(visitResult),
      message: visitResult ? `訪查結果：${visitResult}` : "缺少訪查結果。",
    },
    {
      key: "consent_required",
      label: "同意書狀態",
      severity: "blocking",
      passed: consentSigned,
      message: consentSigned ? "已取得同意。" : "未取得同意，不可核准匯出。",
    },
    {
      key: "mohw_validation",
      label: "中央系統欄位驗證",
      severity: "blocking",
      passed: validationOk,
      message: validationOk
        ? "102 欄驗證通過。"
        : `尚有 ${errorCount} 項錯誤，核准後仍無法匯出。`,
    },
  ];
}

function mapAuditState(row: GasAuditRow, checks: AuditCheck[]): AuditQueueItem["auditState"] {
  const decision = asString(row.decision);
  if (decision === "通過") return "approved";
  if (decision === "退回補件" || decision === "駁回") return "rejected";
  if (checks.some((check) => check.severity === "blocking" && !check.passed)) return "blocked";
  return "ready";
}

export function mapGasAuditQueueItem(raw: GasAuditRow): AuditQueueItem {
  const checks = buildChecks(raw);
  const auditState = mapAuditState(raw, checks);
  const errorLines = Array.isArray(raw.error_lines)
    ? raw.error_lines.map((line) => String(line))
    : [];

  return {
    id: asString(raw.audit_id),
    visitRecordId: asString(raw.careform_id),
    scheduleId: asString(raw.assignment_id),
    caseCode: asString(raw.external_id || raw.encoded_id || raw.case_id),
    elderName: asString(raw.name) || "未知名",
    submittedAt: asString(raw.submitted_at) || asString(raw.decided_at) || new Date().toISOString(),
    auditState,
    checks,
    careformId: asString(raw.careform_id) || undefined,
    assignmentId: asString(raw.assignment_id) || undefined,
    encodedId: asString(raw.encoded_id) || undefined,
    caseId: asString(raw.case_id) || undefined,
    village: [asString(raw.visit_district), asString(raw.visit_village)].filter(Boolean).join(" "),
    visitResult: asString(raw.visit_result) || undefined,
    careformStatus: asString(raw.careform_status) || undefined,
    completionPct: Number(raw.completion_pct ?? 0),
    errorLines,
    exportReady: auditState === "approved" && raw.validation_ok !== false,
  };
}

export function mapUiDecisionToGas(decision: "approve" | "reject" | "request_changes") {
  if (decision === "approve") return "通過";
  if (decision === "request_changes") return "退回補件";
  return "駁回";
}
