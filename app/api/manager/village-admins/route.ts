import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import {
  mapVillageAdminRow,
  resolveAdminAccountFields,
  YONGHE_VILLAGE_NAMES,
} from "@/lib/domain/village-admins";
import { gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "assignment.manage");
  if (forbidden) return forbidden;

  try {
    const [adminRows, visitorRows] = await Promise.all([
      gasClient.villageAdmins.list() as Promise<Record<string, unknown>[]>,
      gasClient.visitors.list() as Promise<Record<string, unknown>[]>,
    ]);

    const visitors = visitorRows
      .map((row) => ({
        visitorId: String(row.visitor_id || ""),
        name: String(row.name || row.full_name || ""),
        email: String(row.email || "").toLowerCase(),
        status: String(row.status || ""),
      }))
      .filter((row) => row.visitorId && row.name)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

    const rows = adminRows.map(mapVillageAdminRow).sort((a, b) => {
      const village = a.villageName.localeCompare(b.villageName, "zh-Hant");
      if (village !== 0) return village;
      return a.adminDisplayName.localeCompare(b.adminDisplayName, "zh-Hant");
    });

    const covered = new Set(rows.filter((row) => row.status === "active").map((row) => row.villageName));
    const uncoveredVillages = YONGHE_VILLAGE_NAMES.filter((name) => !covered.has(name));

    return NextResponse.json({
      data: {
        rows,
        visitors,
        villages: YONGHE_VILLAGE_NAMES,
        uncoveredVillages,
        summary: {
          total: rows.length,
          active: rows.filter((row) => row.status === "active").length,
          person: rows.filter((row) => row.adminKind === "person").length,
          org: rows.filter((row) => row.adminKind === "org").length,
          skip: rows.filter((row) => row.adminKind === "skip").length,
          matched: rows.filter((row) => row.matchedVisitorId).length,
          uncovered: uncoveredVillages.length,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入里責任分配";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "assignment.manage");
  if (forbidden) return forbidden;

  const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
  const body = (await request.json()) as {
    assignmentRowId?: string;
    villageCode?: string;
    villageName?: string;
    adminDisplayName?: string;
    adminKind?: "person" | "org" | "skip";
    adminAccountKey?: string;
    matchedVisitorId?: string;
    status?: string;
    notes?: string;
  };

  const villageName = String(body.villageName ?? "").trim();
  const adminDisplayName = String(body.adminDisplayName ?? "").trim();
  if (!villageName || !adminDisplayName) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請填里別與管理員顯示名。" } },
      { status: 400 },
    );
  }

  const fields = resolveAdminAccountFields({
    adminKind: body.adminKind || "person",
    adminDisplayName,
    adminAccountKey: body.adminAccountKey,
  });

  try {
    const result = await gasClient.villageAdmins.upsert({
      assignment_row_id: String(body.assignmentRowId ?? "").trim(),
      village_code: String(body.villageCode ?? "").trim(),
      village_name: villageName,
      admin_display_name: fields.adminDisplayName,
      admin_kind: fields.adminKind,
      admin_account_key: fields.adminAccountKey,
      matched_visitor_id: String(body.matchedVisitorId ?? "").trim(),
      status: String(body.status ?? "active").trim() || "active",
      notes: String(body.notes ?? "").trim(),
      updated_by: manager?.email || "manager-ui",
    });
    invalidateGasReadCaches();
    return NextResponse.json({
      data: {
        action: result.action,
        row: mapVillageAdminRow(result.row),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法儲存里責任分配";
    return NextResponse.json({ error: { code: "GAS_WRITE_FAILED", message } }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "assignment.manage");
  if (forbidden) return forbidden;

  const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
  const body = (await request.json()) as {
    assignmentRowId?: string;
    status?: "active" | "inactive";
  };

  const id = String(body.assignmentRowId ?? "").trim();
  const status = body.status;
  if (!id || (status !== "active" && status !== "inactive")) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請指定列與狀態（active／inactive）。" } },
      { status: 400 },
    );
  }

  try {
    const row = await gasClient.villageAdmins.setStatus({
      assignment_row_id: id,
      status,
      updated_by: manager?.email || "manager-ui",
    });
    invalidateGasReadCaches();
    return NextResponse.json({ data: mapVillageAdminRow(row) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法更新狀態";
    return NextResponse.json({ error: { code: "GAS_WRITE_FAILED", message } }, { status: 502 });
  }
}
