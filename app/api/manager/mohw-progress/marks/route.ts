import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireOwnerOrManagerCapability } from "@/lib/api/authorization";
import { deskVisitorColumnSide } from "@/lib/domain/desk-care-batch";
import { listDeskClerks } from "@/lib/domain/desk-clerks";
import {
  isDeskOperationalStaff,
  isDeskOperationalStaffName,
} from "@/lib/domain/desk-staff-picker";
import { mapDeskVisitor } from "@/lib/domain/manager-care-form-desk";
import { mapMohwProgressMarkRow } from "@/lib/domain/mohw-progress";
import { YONGHE_VILLAGE_NAMES, sortYongheVillagesByCode } from "@/lib/domain/village-admins";
import { gasClient } from "@/lib/gas-client";

export type MohwProgressStaffOption = {
  id: string;
  name: string;
  kind: "visitor" | "desk_clerk" | "mark";
  /** 民政／社政欄用；建檔可為 unknown */
  side?: "civil" | "social" | "unknown";
};

export async function GET(request: NextRequest) {
  const forbidden = requireOwnerOrManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  try {
    const village = String(request.nextUrl.searchParams.get("village") ?? "").trim();
    const [rawMarks, caseRows, visitorRows, clerks] = await Promise.all([
      gasClient.mohwProgress.listMarks(village ? { village_name: village } : undefined),
      gasClient.cases
        .list({
          district: "永和區",
          ...(village ? { visit_village: village } : {}),
        })
        .then((rows) => rows as Record<string, unknown>[])
        .catch(() => [] as Record<string, unknown>[]),
      gasClient.visitors
        .list({ slim: true })
        .then((rows) => rows as Record<string, unknown>[])
        .catch(() => [] as Record<string, unknown>[]),
      listDeskClerks().catch(() => []),
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

    const keyedByNames = [
      ...new Set(
        marks
          .map((row) => row.keyed_by_name.trim())
          .filter((name) => isDeskOperationalStaffName(name)),
      ),
    ].sort((a, b) => a.localeCompare(b, "zh-Hant"));

    const staffById = new Map<string, MohwProgressStaffOption>();
    for (const row of visitorRows) {
      const mapped = mapDeskVisitor(row);
      if (!mapped.id || !isDeskOperationalStaff(mapped)) continue;
      staffById.set(mapped.id, {
        id: mapped.id,
        name: mapped.name,
        kind: "visitor",
        side: deskVisitorColumnSide(mapped),
      });
    }
    for (const clerk of clerks) {
      const id = String(clerk.clerkId || "").trim();
      const name = String(clerk.displayName || clerk.clerkId || "").trim();
      if (!id || !isDeskOperationalStaffName(name || id)) continue;
      if (!staffById.has(id)) {
        staffById.set(id, {
          id,
          name: name || id,
          kind: "desk_clerk",
          side: "unknown",
        });
      }
    }
    // 已出現在標記上的營運人名也列入（不含測試帳）
    for (const row of marks) {
      const pairs: Array<[string, string, "civil" | "social" | "unknown"]> = [
        [row.keyed_by_id, row.keyed_by_name, "unknown"],
        [row.civil_worker_id, row.civil_worker_name, "civil"],
        [row.social_worker_id, row.social_worker_name, "social"],
      ];
      for (const [id, name, side] of pairs) {
        const label = name.trim();
        if (!isDeskOperationalStaffName(label)) continue;
        const key = id.trim() || `name:${label}`;
        if (!staffById.has(key)) {
          staffById.set(key, {
            id: id.trim() || key,
            name: label,
            kind: "mark",
            side,
          });
        }
      }
    }

    const staffOptions = [...staffById.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "zh-Hant"),
    );

    return NextResponse.json({
      data: {
        village,
        villages,
        marks,
        count: marks.length,
        keyed_by_names: keyedByNames,
        staff_options: staffOptions,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入已送出標記";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
