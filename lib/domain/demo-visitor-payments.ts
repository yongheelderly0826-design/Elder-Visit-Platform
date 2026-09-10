import payments from "@/lib/domain/demo-visitor-payments.json";
import { paymentFeeRules } from "@/lib/domain/payments";

export type DemoVisitorPaymentItem = {
  id: string;
  caseId: string;
  caseName: string;
  assignmentId: string;
  visitResult: string;
  auditDecision: string;
  status: "pending_audit" | "approved" | "locked" | "rejected";
  visitFee: number;
  dataProcessingFee: number;
  totalFee: number;
  lockedAt?: string | null;
  updatedAt: string;
};

export function listDemoVisitorPayments(email: string | null | undefined): DemoVisitorPaymentItem[] {
  if (!email) return [];
  const rows = (payments as Record<string, DemoVisitorPaymentItem[]>)[email.toLowerCase()];
  return Array.isArray(rows) ? rows : [];
}

export function buildLockedDemoPayment(input: {
  caseId: string;
  caseName: string;
  assignmentId: string;
  visitResult?: string;
}): DemoVisitorPaymentItem {
  const now = new Date().toISOString();
  return {
    id: `pay_${input.assignmentId}`,
    caseId: input.caseId,
    caseName: input.caseName,
    assignmentId: input.assignmentId,
    visitResult: input.visitResult ?? "完成訪視",
    auditDecision: "通過",
    status: "locked",
    visitFee: paymentFeeRules.visitFee,
    dataProcessingFee: paymentFeeRules.dataProcessingFee,
    totalFee: paymentFeeRules.totalPerCompletedVisit,
    lockedAt: now,
    updatedAt: now,
  };
}
