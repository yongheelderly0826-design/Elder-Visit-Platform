import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/api/authorization";
import { GasApiError, gasClient, isGasConfigured } from "@/lib/gas-client";
import { cachedRead, GAS_READ_TAGS } from "@/lib/gas-read-cache";
import { getSystemStatus } from "@/lib/system/env";
import {
  formatWorkflowCounts,
  type ManagementWorkflowCountValues,
} from "@/lib/domain/management-workflow-counts";

function asString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function uniqueCount(keys: string[]) {
  return new Set(keys.filter(Boolean)).size;
}

export async function GET(request: NextRequest) {
  const forbidden = requireAnyCapability(request, [
    "dashboard.read",
    "cases.read",
    "assignment.manage",
    "assignment.confirm",
    "audit.run",
    "audit.approve",
    "audit.reject",
    "exports.create",
    "notifications.manage",
    "notifications.send",
  ]);
  if (forbidden) return forbidden;

  const status = getSystemStatus();
  if (status.dataMode !== "gas_ready" || !isGasConfigured()) {
    const empty: ManagementWorkflowCountValues = {
      pendingAssignments: 0,
      inProgressVisits: 0,
      pendingFollowUp: 0,
      pendingAudit: 0,
      pendingExport: 0,
    };
    return NextResponse.json({
      data: {
        mode: "demo",
        values: empty,
        counts: formatWorkflowCounts(empty),
        note: "非 GAS 模式，步驟數字暫為 0。",
      },
    });
  }

  try {
    const [cases, audits] = await Promise.all([
      cachedRead(["workflow-counts-cases"], [GAS_READ_TAGS.assignmentDashboard], () =>
        gasClient.cases.list({ district: "永和區" }),
      ),
      cachedRead(["workflow-counts-audits"], [GAS_READ_TAGS.auditQueue], () =>
        gasClient.audit.queue({ decision: "all" }),
      ),
    ]);

    const caseRows = (cases ?? []) as Array<Record<string, unknown>>;
    const auditRows = (audits ?? []) as Array<Record<string, unknown>>;

    const pendingAssignments = caseRows.filter((row) => {
      const visitStatus = asString(row.visit_status);
      return visitStatus === "待訪" || visitStatus === "待派案" || visitStatus === "";
    }).length;

    const inProgressVisits = caseRows.filter((row) => {
      return asString(row.visit_status) === "進行中";
    }).length;

    const pendingAudit = uniqueCount(
      auditRows
        .filter((row) => !asString(row.decision))
        .map(
          (row) =>
            asString(row.case_id) || asString(row.careform_id) || asString(row.audit_id),
        ),
    );

    const pendingFollowUp = uniqueCount(
      auditRows
        .filter((row) => {
          const decision = asString(row.decision);
          const careformStatus = asString(row.careform_status);
          return decision === "退回補件" || careformStatus === "待補件";
        })
        .map(
          (row) =>
            asString(row.case_id) || asString(row.careform_id) || asString(row.audit_id),
        ),
    );

    const pendingExport = uniqueCount(
      auditRows
        .filter((row) => {
          const decision = asString(row.decision);
          const careformStatus = asString(row.careform_status);
          return decision === "通過" || careformStatus === "已稽核";
        })
        .map(
          (row) =>
            asString(row.case_id) || asString(row.careform_id) || asString(row.audit_id),
        ),
    );

    const values: ManagementWorkflowCountValues = {
      pendingAssignments,
      inProgressVisits,
      pendingFollowUp,
      pendingAudit,
      pendingExport,
    };

    return NextResponse.json({
      data: {
        mode: "gas",
        values,
        counts: formatWorkflowCounts(values),
      },
    });
  } catch (error) {
    const message =
      error instanceof GasApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "讀取流程數字失敗";
    return NextResponse.json(
      { error: { code: "WORKFLOW_COUNTS_FAILED", message } },
      { status: 502 },
    );
  }
}
