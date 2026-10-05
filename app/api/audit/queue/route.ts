import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/api/authorization";
import { auditQueue } from "@/lib/domain/audit-data";
import { mapGasAuditQueueItem } from "@/lib/domain/gas-audit";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { cachedRead, GAS_READ_TAGS } from "@/lib/gas-read-cache";
import { getSystemStatus } from "@/lib/system/env";
import type { AuditQueueItem } from "@/lib/domain/types";

function dedupeByCareform(items: AuditQueueItem[]) {
  const seen = new Set<string>();
  const result: AuditQueueItem[] = [];
  for (const item of items) {
    const key = item.caseId || item.careformId || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export async function GET(request: NextRequest) {
  const forbidden = requireAnyCapability(request, ["audit.run", "audit.approve", "audit.reject"]);
  if (forbidden) return forbidden;

  const decision = request.nextUrl.searchParams.get("decision") ?? "pending";
  const includeOverview = request.nextUrl.searchParams.get("overview") !== "0";
  const status = getSystemStatus();

  if (status.dataMode === "gas_ready") {
    try {
      const [pendingRows, allRows, cases, assignments] = await Promise.all([
        cachedRead(["audit-queue", "pending"], [GAS_READ_TAGS.auditQueue], () =>
          gasClient.audit.queue({ decision: "pending" }),
        ),
        includeOverview
          ? cachedRead(["audit-queue", "all"], [GAS_READ_TAGS.auditQueue], () =>
              gasClient.audit.queue({ decision: "all" }),
            )
          : Promise.resolve([] as Record<string, unknown>[]),
        includeOverview
          ? cachedRead(["cases-list-audit"], [GAS_READ_TAGS.assignmentDashboard], () =>
              gasClient.cases.list(),
            )
          : Promise.resolve([] as unknown[]),
        includeOverview
          ? cachedRead(["assignments-list-audit"], [GAS_READ_TAGS.assignmentDashboard], () =>
              gasClient.assignments.list(),
            )
          : Promise.resolve([] as unknown[]),
      ]);

      const pendingItems = dedupeByCareform(pendingRows.map(mapGasAuditQueueItem));
      const allItems = dedupeByCareform(allRows.map(mapGasAuditQueueItem));
      const supplementItems = allItems.filter(
        (item) =>
          item.decision === "退回補件" ||
          item.careformStatus === "待補件" ||
          item.auditState === "rejected",
      );
      const approvedItems = allItems.filter(
        (item) => item.decision === "通過" || item.auditState === "approved",
      );

      const caseRows = cases as Array<Record<string, unknown>>;
      const assignmentRows = assignments as Array<Record<string, unknown>>;
      const pendingAssignments = caseRows.filter((row) => {
        const visitStatus = String(row.visit_status ?? "");
        return visitStatus === "待訪" || visitStatus === "待派案" || visitStatus === "";
      }).length;
      const inProgressByVisitor: Record<string, number> = {};
      for (const row of assignmentRows) {
        const statusText = String(row.status ?? "");
        if (!["待接案", "進行中", "空訪續訪"].includes(statusText)) continue;
        const visitorId = String(row.visitor_id ?? "未指派");
        inProgressByVisitor[visitorId] = (inProgressByVisitor[visitorId] || 0) + 1;
      }

      const selected =
        decision === "all"
          ? allItems
          : decision === "退回補件" || decision === "supplement"
            ? supplementItems
            : decision === "通過"
              ? approvedItems
              : pendingItems;

      return NextResponse.json({
        data: {
          mode: "gas",
          total: selected.length,
          items: selected,
          pendingItems,
          supplementItems,
          approvedItems,
          counts: {
            pendingAssignments: `${pendingAssignments} 件`,
            pendingFollowUp: `${supplementItems.length} 件`,
            pendingAudit: `${pendingItems.length} 件`,
            pendingExport: `${approvedItems.length} 件`,
          },
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
      pendingItems: items,
      supplementItems: [],
      approvedItems: [],
      counts: {
        pendingAssignments: "—",
        pendingFollowUp: "—",
        pendingAudit: `${items.length} 件`,
        pendingExport: "—",
      },
      note: "目前非 GAS 模式，顯示示範稽核佇列。",
    },
  });
}
