import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireOwnerOrManagerCapability } from "@/lib/api/authorization";
import { mapMohwProgressMarkRow } from "@/lib/domain/mohw-progress";
import { YONGHE_VILLAGE_NAMES, sortYongheVillagesByCode } from "@/lib/domain/village-admins";
import { gasClient } from "@/lib/gas-client";

export async function GET(request: NextRequest) {
  const forbidden = requireOwnerOrManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  try {
    const village = String(request.nextUrl.searchParams.get("village") ?? "").trim();
    const [rawMarks, caseRows] = await Promise.all([
      gasClient.mohwProgress.listMarks(village ? { village_name: village } : undefined),
      village
        ? (gasClient.cases.list({
            district: "永和區",
            visit_village: village,
          }) as Promise<Record<string, unknown>[]>)
        : Promise.resolve([] as Record<string, unknown>[]),
    ]);

    const nameByCaseId = new Map<string, string>();
    for (const row of caseRows) {
      const caseId = String(row.case_id || "").trim();
      if (!caseId) continue;
      nameByCaseId.set(caseId, String(row.name || row.elder_name || "").trim());
    }

    const marks = rawMarks
      .map((row) => mapMohwProgressMarkRow(row, nameByCaseId))
      .filter((row) => row.mark_id);

    const villages = sortYongheVillagesByCode([
      ...new Set([
        ...YONGHE_VILLAGE_NAMES,
        ...marks.map((row) => row.village_name).filter(Boolean),
      ]),
    ]);

    return NextResponse.json({
      data: {
        village,
        villages,
        marks,
        count: marks.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入已送出標記";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
