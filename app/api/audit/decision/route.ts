import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/api/authorization";
import { submitAuditDecision } from "@/lib/domain/audit";
import { mapGasAuditQueueItem, mapUiDecisionToGas } from "@/lib/domain/gas-audit";
import type { AuditDecision, AuditDecisionResult } from "@/lib/domain/types";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function POST(request: NextRequest) {
  const decision = (await request.json()) as AuditDecision;
  const requiredCapability = decision.decision === "approve" ? "audit.approve" : "audit.reject";
  const forbidden = requireAnyCapability(request, [requiredCapability]);
  if (forbidden) return forbidden;

  const status = getSystemStatus();

  if (status.dataMode === "gas_ready") {
    try {
      const updated = await gasClient.audit.decide({
        audit_id: decision.auditId,
        decision: mapUiDecisionToGas(decision.decision),
        reason: decision.supervisorNote,
      });
      const item = mapGasAuditQueueItem(updated);
      const approved = decision.decision === "approve";
      const result: AuditDecisionResult = {
        auditId: item.id,
        auditState: item.auditState,
        nextStep: approved
          ? "已核准，關懷表標記為已稽核，可至匯出管理勾選此個案。"
          : decision.decision === "request_changes"
            ? "已退回補件，關懷表改為待補件。"
            : "已駁回，不進入匯出批次。",
        decisionLog: {
          entityType: "audit_record",
          action: decision.decision,
          createdAt: new Date().toISOString(),
        },
      };
      return NextResponse.json({ data: result });
    } catch (error) {
      if (error instanceof GasApiError) {
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.message,
              errorLines: error.errorLines,
            },
          },
          { status: error.code === "NOT_FOUND" ? 404 : 400 },
        );
      }
      const message = error instanceof Error ? error.message : "GAS 稽核決策失敗";
      return NextResponse.json({ error: { code: "GAS_AUDIT_DECIDE_FAILED", message } }, { status: 502 });
    }
  }

  const result = submitAuditDecision(decision);
  return NextResponse.json({ data: result });
}
