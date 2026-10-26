import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import {
  compareDeskCasesByVillageSeq,
  isActiveAssignmentStatus,
  mapDeskCase,
} from "@/lib/domain/manager-care-form-desk";
import {
  formatYongheVillageCode,
  mapVillageAdminRow,
} from "@/lib/domain/village-admins";
import { gasClient } from "@/lib/gas-client";

export type QuickPendingItem = {
  caseId: string;
  caseCode: string;
  caseName: string;
  village: string;
  villageSeq: number | null;
  villageCode: string;
  address: string;
  visitStatus: string;
  activeAssignmentId: string | null;
  activeVisitorId: string | null;
  activeVisitorName: string | null;
  blockedByOther: boolean;
  canContinue: boolean;
};

export async function GET(request: NextRequest) {
  // 訪員與承辦／場生皆可查待訪名單（快速 KEY）
  const forbidden = requireCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const villageCode = formatYongheVillageCode(
    request.nextUrl.searchParams.get("villageCode"),
  );
  const visitorId = String(request.nextUrl.searchParams.get("visitorId") ?? "").trim();

  if (!/^\d{6}$/.test(villageCode)) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請輸入六碼里編碼（例如 040051）。" } },
      { status: 400 },
    );
  }

  try {
    const [caseRows, adminRows, assignmentRows, visitorRowsRaw] = await Promise.all([
      gasClient.cases.list({ district: "永和區" }) as Promise<Record<string, unknown>[]>,
      gasClient.villageAdmins.list().catch(() => [] as Record<string, unknown>[]),
      gasClient.assignments.list({ active_only: "true" }).catch(
        () => [] as Record<string, unknown>[],
      ),
      gasClient.visitors.list({ slim: true }).catch(() => [] as unknown[]),
    ]);
    const visitorRows = visitorRowsRaw as Record<string, unknown>[];
    const assignmentList = assignmentRows as Record<string, unknown>[];

    const villageCodeByName: Record<string, string> = {};
    const villageNamesForCode = new Set<string>();
    for (const row of adminRows.map(mapVillageAdminRow)) {
      const code = formatYongheVillageCode(row.villageCode);
      if (row.villageName && code) villageCodeByName[row.villageName] = code;
      if (code === villageCode && row.villageName) {
        villageNamesForCode.add(row.villageName);
      }
    }

    const nameByVisitorId = new Map(
      visitorRows.map((row: Record<string, unknown>) => [
        String(row.visitor_id ?? ""),
        String(row.name ?? row.full_name ?? ""),
      ]),
    );

    const activeByCase = new Map<
      string,
      { assignmentId: string; visitorId: string; visitorName: string }
    >();
    for (const row of assignmentList) {
      const status = String(row.status ?? "");
      if (!isActiveAssignmentStatus(status)) continue;
      const caseId = String(row.case_id ?? "").trim();
      const assignmentId = String(row.assignment_id ?? "").trim();
      const rowVisitorId = String(row.visitor_id ?? "").trim();
      if (!caseId || !assignmentId) continue;
      if (activeByCase.has(caseId)) continue;
      activeByCase.set(caseId, {
        assignmentId,
        visitorId: rowVisitorId,
        visitorName: nameByVisitorId.get(rowVisitorId) || rowVisitorId,
      });
    }

    const cases = caseRows
      .map((row) => mapDeskCase(row, villageCodeByName))
      .filter((item) => {
        if (!item.id || !item.name) return false;
        if (item.visitStatus === "不訪" || item.visitStatus === "已完成") return false;
        const code = formatYongheVillageCode(item.villageCode);
        if (code === villageCode) return true;
        if (villageNamesForCode.has(item.village)) return true;
        return false;
      })
      .sort(compareDeskCasesByVillageSeq);

    const items: QuickPendingItem[] = cases.map((item) => {
      const active = activeByCase.get(item.id) ?? null;
      const blockedByOther = Boolean(
        active && visitorId && active.visitorId && active.visitorId !== visitorId,
      );
      const canContinue = Boolean(
        active && visitorId && active.visitorId === visitorId,
      );
      return {
        caseId: item.id,
        caseCode: item.caseCode,
        caseName: item.name,
        village: item.village,
        villageSeq: item.villageSeq,
        villageCode: formatYongheVillageCode(item.villageCode) || villageCode,
        address: item.address,
        visitStatus: item.visitStatus,
        activeAssignmentId: active?.assignmentId ?? null,
        activeVisitorId: active?.visitorId ?? null,
        activeVisitorName: active?.visitorName ?? null,
        blockedByOther,
        canContinue,
      };
    });

    return NextResponse.json({
      data: {
        villageCode,
        villageNames: [...villageNamesForCode],
        count: items.length,
        items,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入待訪名單";
    return NextResponse.json({ error: { code: "GAS_LIST_FAILED", message } }, { status: 502 });
  }
}
