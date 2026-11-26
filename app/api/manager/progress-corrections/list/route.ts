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
import { YONGHE_VILLAGE_NAMES, sortYongheVillagesByCode } from "@/lib/domain/village-admins";
import { GasApiError, gasClient } from "@/lib/gas-client";

export type ProgressCorrectionStaffOption = {
  id: string;
  name: string;
  kind: "visitor" | "desk_clerk" | "mark";
  side?: "civil" | "social" | "unknown";
};

export async function GET(request: NextRequest) {
  const forbidden = requireOwnerOrManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const source = String(request.nextUrl.searchParams.get("source") ?? "").trim();
  const village = String(request.nextUrl.searchParams.get("village") ?? "").trim();

  if (source !== "careform" && source !== "index") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "source 需為 careform 或 index" } },
      { status: 400 },
    );
  }

  try {
    const [payload, visitorRows, clerks] = await Promise.all([
      source === "careform"
        ? gasClient.progressCorrections.listCareforms(
            village ? { village_name: village } : undefined,
          )
        : gasClient.progressCorrections.listIndex(
            village ? { village_name: village } : undefined,
          ),
      gasClient.visitors
        .list({ slim: true })
        .then((rows) => rows as Record<string, unknown>[])
        .catch(() => [] as Record<string, unknown>[]),
      listDeskClerks().catch(() => []),
    ]);

    const rows = (payload.rows ?? []).map((row) => ({
      row_id: String(row.row_id ?? ""),
      source: String(row.source ?? source),
      careform_id: row.careform_id ? String(row.careform_id) : undefined,
      case_id: String(row.case_id ?? ""),
      name: String(row.name ?? ""),
      encoded_id: String(row.encoded_id ?? ""),
      village_name: String(row.village_name ?? ""),
      village_seq:
        row.village_seq == null || row.village_seq === ""
          ? null
          : Number(row.village_seq),
      outcome: String(row.outcome ?? ""),
      keyed_by_name: String(row.keyed_by_name ?? ""),
      civil_worker_name: String(row.civil_worker_name ?? ""),
      social_worker_name: String(row.social_worker_name ?? ""),
      reported_at: String(row.reported_at ?? ""),
      channel: row.channel ? String(row.channel) : undefined,
      has_careform: Boolean(row.has_careform),
      has_direct_mark: Boolean(row.has_direct_mark),
      bucket: row.bucket ? String(row.bucket) : undefined,
    }));

    const villages = sortYongheVillagesByCode([
      ...new Set([
        ...YONGHE_VILLAGE_NAMES,
        ...(payload.villages ?? []),
        ...rows.map((row) => row.village_name).filter(Boolean),
      ]),
    ]);

    const keyedByNames = [
      ...new Set(
        (payload.keyed_by_names ?? [])
          .map((name) => String(name).trim())
          .filter((name) => isDeskOperationalStaffName(name)),
      ),
    ].sort((a, b) => a.localeCompare(b, "zh-Hant"));

    const staffById = new Map<string, ProgressCorrectionStaffOption>();
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
      const id = String(clerk.clerkId ?? "").trim();
      const name = String(clerk.displayName ?? "").trim();
      if (!id || !name || !isDeskOperationalStaffName(name)) continue;
      staffById.set(id, { id, name, kind: "desk_clerk", side: "unknown" });
    }
    for (const name of keyedByNames) {
      const id = `name:${name}`;
      if (!staffById.has(id)) {
        staffById.set(id, { id, name, kind: "mark", side: "unknown" });
      }
    }

    return NextResponse.json({
      data: {
        source,
        rows,
        villages,
        keyed_by_names: keyedByNames,
        staff_options: [...staffById.values()],
        truncated: Boolean((payload as { truncated?: boolean }).truncated),
        note: (payload as { note?: string | null }).note ?? null,
      },
    });
  } catch (error) {
    const message =
      error instanceof GasApiError ? error.message : "無法載入進度修正資料";
    return NextResponse.json(
      { error: { code: "LIST_FAILED", message } },
      { status: 502 },
    );
  }
}
