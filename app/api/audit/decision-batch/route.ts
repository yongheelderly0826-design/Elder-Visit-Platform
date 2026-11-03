import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/api/authorization";
import { mapGasAuditQueueItem, mapUiDecisionToGas } from "@/lib/domain/gas-audit";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";
import { getSystemStatus } from "@/lib/system/env";

export const maxDuration = 300;

/** Align with frontend chunk; keep headroom under GAS 6-minute kill. */
const MAX_BATCH = 20;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    auditIds?: string[];
    decision?: "approve" | "reject" | "request_changes";
    supervisorNote?: string;
  };

  const decision = body.decision === "approve" ? "approve" : body.decision;
  if (decision !== "approve" && decision !== "request_changes" && decision !== "reject") {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "decision 無效" } },
      { status: 400 },
    );
  }

  const requiredCapability = decision === "approve" ? "audit.approve" : "audit.reject";
  const forbidden = requireAnyCapability(request, [requiredCapability]);
  if (forbidden) return forbidden;

  const auditIds = Array.from(
    new Set((body.auditIds ?? []).map((id) => String(id || "").trim()).filter(Boolean)),
  );
  if (!auditIds.length) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請提供 auditIds" } },
      { status: 400 },
    );
  }
  if (auditIds.length > MAX_BATCH) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: `單次最多 ${MAX_BATCH} 筆，請分批核准`,
        },
      },
      { status: 400 },
    );
  }

  const status = getSystemStatus();
  if (status.dataMode !== "gas_ready") {
    return NextResponse.json(
      { error: { code: "NOT_GAS", message: "批次核准僅支援 GAS 模式" } },
      { status: 400 },
    );
  }

  try {
    const batch = await gasClient.audit.decideBatch({
      audit_ids: auditIds,
      decision: mapUiDecisionToGas(decision),
      reason: body.supervisorNote || "批次核准",
    });
    invalidateGasReadCaches();

    const results = (batch.results ?? []).map((row) => {
      const itemRaw = row.item as Record<string, unknown> | undefined;
      return {
        ok: row.ok === true,
        auditId: String(row.audit_id ?? ""),
        code: row.code ? String(row.code) : undefined,
        message: row.message ? String(row.message) : undefined,
        errorLines: Array.isArray(row.error_lines)
          ? row.error_lines.map(String)
          : undefined,
        item: itemRaw ? mapGasAuditQueueItem(itemRaw) : undefined,
      };
    });

    return NextResponse.json({
      data: {
        successCount: Number(batch.success_count ?? 0),
        failCount: Number(batch.fail_count ?? 0),
        results,
      },
    });
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
    const message = error instanceof Error ? error.message : "GAS 批次稽核失敗";
    return NextResponse.json(
      { error: { code: "GAS_AUDIT_BATCH_FAILED", message } },
      { status: 502 },
    );
  }
}
