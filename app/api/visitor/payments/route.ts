import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { getDemoVisitorLink } from "@/lib/domain/demo-visitor-link";
import { listDemoVisitorPayments } from "@/lib/domain/demo-visitor-payments";
import { paymentFeeRules } from "@/lib/domain/payments";
import { gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "payments.read");
  if (forbidden) return forbidden;

  const email = request.cookies.get("demo_email")?.value?.toLowerCase() ?? "";
  const link = getDemoVisitorLink(email);
  const demoItems = listDemoVisitorPayments(email);

  let auditItems: Array<{
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
    lockedAt: string | null;
    updatedAt: string;
  }> = [];

  if (getSystemStatus().dataMode === "gas_ready" && link?.visitorId) {
    try {
      const approved = await gasClient.audit.queue({ decision: "通過" });
      const pending = await gasClient.audit.queue({ decision: "pending" });
      const mine = [...approved, ...pending].filter(
        (row) => String(row.visitor_id ?? "") === link.visitorId,
      );

      auditItems = mine.map((row) => {
        const decision = String(row.decision ?? "");
        const assignmentId = String(row.assignment_id ?? "");
        const demoMatch = demoItems.find((item) => item.assignmentId === assignmentId);
        if (demoMatch) {
          return {
            ...demoMatch,
            lockedAt: demoMatch.lockedAt ?? null,
          };
        }
        const status =
          decision === "通過"
            ? ("approved" as const)
            : decision === "駁回" || decision === "退回補件"
              ? ("rejected" as const)
              : ("pending_audit" as const);
        return {
          id: String(row.audit_id ?? assignmentId),
          caseId: String(row.case_id ?? ""),
          caseName: String(row.name ?? ""),
          assignmentId,
          visitResult: String(row.visit_result ?? ""),
          auditDecision: decision || "待審",
          status,
          visitFee: paymentFeeRules.visitFee,
          dataProcessingFee: paymentFeeRules.dataProcessingFee,
          totalFee: paymentFeeRules.totalPerCompletedVisit,
          lockedAt: null,
          updatedAt: String(row.decided_at || row.submitted_at || new Date().toISOString()),
        };
      });
    } catch {
      // Fall back to demo payments file.
    }
  }

  const byAssignment = new Map<string, (typeof auditItems)[number]>();
  for (const item of [...auditItems, ...demoItems.map((row) => ({ ...row, lockedAt: row.lockedAt ?? null }))]) {
    byAssignment.set(item.assignmentId || item.id, item);
  }

  return NextResponse.json({
    data: {
      visitorId: link?.visitorId ?? null,
      visitorName: link?.name ?? request.cookies.get("demo_name")?.value ?? null,
      feeRule: paymentFeeRules,
      items: Array.from(byAssignment.values()),
    },
  });
}
