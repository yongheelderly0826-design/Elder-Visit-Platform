import { auditQueue } from "@/lib/domain/audit-data";
import type {
  AuditCheck,
  AuditDecision,
  AuditDecisionResult,
  PaymentLockResult,
  PaymentCalculation,
  VisitSubmission,
} from "@/lib/domain/types";

export function runVisitAuditChecks(submission: VisitSubmission): AuditCheck[] {
  const hasSignature = Boolean(submission.signatureDataUrl?.length);
  const hasGps = typeof submission.gpsLat === "number" && typeof submission.gpsLng === "number";
  const notes = submission.notes ?? "";

  return [
    {
      key: "visit_result_present",
      label: "訪查結果完整",
      severity: "blocking",
      passed: Boolean(submission.visitResult),
      message: submission.visitResult ? "已填寫訪查結果。" : "缺少訪查結果。",
    },
    {
      key: "consent_required",
      label: "同意書狀態",
      // 暫不阻擋稽核／核銷；僅提醒
      severity: "warning",
      passed: submission.consentSigned && hasSignature,
      message:
        submission.consentSigned && hasSignature
          ? "已取得同意與簽名。"
          : "尚未取得同意或簽名（暫不阻擋核准）。",
    },
    {
      key: "gps_recommended",
      label: "定位資料",
      severity: "warning",
      passed: hasGps,
      message: hasGps ? "已取得定位。" : "未取得定位，可能需主管覆核。",
    },
    {
      key: "risk_follow_up",
      label: "風險追蹤註記",
      severity: "warning",
      passed: submission.healthStatus !== "疑似急迫風險" || notes.length > 0,
      message:
        submission.healthStatus === "疑似急迫風險" && notes.length === 0
          ? "急迫風險需補充處置紀錄。"
          : "無需補充。",
    },
  ];
}

export function getAuditState(checks: AuditCheck[]) {
  const hasBlockingFailure = checks.some(
    (check) => check.severity === "blocking" && !check.passed,
  );

  return hasBlockingFailure ? "blocked" : "ready";
}

export function calculateVisitPayment(submission: VisitSubmission): PaymentCalculation {
  const checks = runVisitAuditChecks(submission);
  const auditState = getAuditState(checks);

  if (auditState === "blocked") {
    return {
      visitFee: 0,
      dataFee: 0,
      auditFee: 0,
      otherFee: 0,
      totalFee: 0,
      status: "blocked",
      calculationDetail: ["阻擋項目未通過，暫不產生核銷金額。"],
    };
  }

  const visitFee = submission.visitResult === "訪視成功" ? 600 : 200;
  const dataFee = 100;
  const auditFee = 50;
  const otherFee = 0;

  return {
    visitFee,
    dataFee,
    auditFee,
    otherFee,
    totalFee: visitFee + dataFee + auditFee + otherFee,
    status: "draft",
    calculationDetail: [
      `訪查結果：${submission.visitResult}`,
      `訪查費：${visitFee}`,
      `資料費：${dataFee}`,
      `稽核費：${auditFee}`,
    ],
  };
}

export function submitAuditDecision(decision: AuditDecision): AuditDecisionResult {
  const item = auditQueue.find((queueItem) => queueItem.id === decision.auditId);

  if (!item) {
    return {
      auditId: decision.auditId,
      auditState: "rejected",
      nextStep: "找不到稽核項目，請重新整理佇列。",
      decisionLog: createDecisionLog(decision),
    };
  }

  const hasBlockingFailure = item.checks.some(
    (check) => check.severity === "blocking" && !check.passed,
  );
  const hasWarningFailure = item.checks.some(
    (check) => check.severity === "warning" && !check.passed,
  );

  if (decision.decision === "approve" && hasBlockingFailure) {
    return {
      auditId: item.id,
      auditState: "blocked",
      nextStep: "阻擋項目未通過，不可核准。請退回補件。",
      decisionLog: createDecisionLog(decision),
    };
  }

  if (decision.decision === "approve" && hasWarningFailure && !decision.overrideWarnings) {
    return {
      auditId: item.id,
      auditState: "ready",
      nextStep: "尚有提醒項目，需勾選主管覆核後才能核准。",
      decisionLog: createDecisionLog(decision),
    };
  }

  if (decision.decision === "approve") {
    return {
      auditId: item.id,
      auditState: "approved",
      nextStep: "已核准，產生核銷草稿。",
      decisionLog: createDecisionLog(decision),
      payment: {
        visitFee: 600,
        dataFee: 100,
        auditFee: 50,
        otherFee: 0,
        totalFee: 750,
        status: "draft",
        calculationDetail: ["主管核准後建立核銷草稿。", `稽核備註：${decision.supervisorNote || "無"}`],
      },
    };
  }

  return {
    auditId: item.id,
    auditState: "rejected",
    nextStep:
      decision.decision === "request_changes" ? "已退回訪員補件。" : "已駁回，不進入核銷。",
    decisionLog: createDecisionLog(decision),
  };
}

export function lockPaymentDraft(paymentId: string, calculation: PaymentCalculation): PaymentLockResult {
  if (calculation.status === "blocked" || calculation.totalFee <= 0) {
    return {
      paymentId,
      status: "blocked",
      lockedAt: null,
      message: "核銷金額為 0 或稽核阻擋，不能鎖定。",
      exportReady: false,
    };
  }

  return {
    paymentId,
    status: "locked",
    lockedAt: new Date().toISOString(),
    message: "核銷已鎖定，可進入匯出批次。",
    exportReady: true,
  };
}

function createDecisionLog(decision: AuditDecision) {
  return {
    entityType: "audit_record" as const,
    action: decision.decision,
    createdAt: new Date().toISOString(),
  };
}
