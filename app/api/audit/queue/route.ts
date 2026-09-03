import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/api/authorization";
import { auditQueue } from "@/lib/domain/audit-data";
import { mapGasAuditQueueItem } from "@/lib/domain/gas-audit";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const forbidden = requireAnyCapability(request, ["audit.run", "audit.approve", "audit.reject"]);
  if (forbidden) return forbidden;

  const decision = request.nextUrl.searchParams.get("decision") ?? "pending";
  const status = getSystemStatus();

  if (status.dataMode === "gas_ready") {
    try {
      const rows = await gasClient.audit.queue({ decision });
      const items = rows.map(mapGasAuditQueueItem);
      return NextResponse.json({
        data: {
          mode: "gas",
          total: items.length,
          items,
        },
      });
    } catch (error) {
      const message =
        error instanceof GasApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "讀取稽核佇列失敗";
      return NextResponse.json(
        { error: { code: "GAS_AUDIT_QUEUE_FAILED", message } },
        { status: 502 },
      );
    }
  }

  const items =
    decision === "pending"
      ? auditQueue.filter((item) => item.auditState === "ready" || item.auditState === "blocked")
      : auditQueue;

  return NextResponse.json({
    data: {
      mode: "demo",
      total: items.length,
      items,
      note: "目前非 GAS 模式，顯示示範稽核佇列。",
    },
  });
}
