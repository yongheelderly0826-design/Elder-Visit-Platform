import type { AuditQueueItem } from "@/lib/domain/types";

export const auditQueue: AuditQueueItem[] = [
  {
    id: "audit_001",
    visitRecordId: "visit_001",
    scheduleId: "schedule_001",
    caseCode: "EV-115-0001",
    elderName: "林阿梅",
    submittedAt: "2026-04-26T10:45:00+08:00",
    auditState: "ready",
    checks: [
      {
        key: "visit_result_present",
        label: "訪查結果完整",
        severity: "blocking",
        passed: true,
        message: "已填寫訪查結果。",
      },
      {
        key: "consent_required",
        label: "同意書狀態",
        severity: "blocking",
        passed: true,
        message: "已取得同意。",
      },
    ],
  },
  {
    id: "audit_002",
    visitRecordId: "visit_002",
    scheduleId: "schedule_002",
    caseCode: "EV-115-0002",
    elderName: "陳水木",
    submittedAt: "2026-04-26T14:30:00+08:00",
    auditState: "ready",
    checks: [
      {
        key: "consent_required",
        label: "同意書狀態",
        severity: "warning",
        passed: false,
        message: "尚未取得同意（暫不阻擋核准）。",
      },
    ],
  },
];
