import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getDeskOrgEmailMap } from "@/lib/domain/desk-org-emails";
import {
  normalizeMohwProgressOutcome,
  type MohwProgressOutcome,
} from "@/lib/domain/mohw-progress";
import {
  formatYongheVillageCode,
  mapVillageAdminRow,
  mergeYongheVillageCodeByName,
  resolveDeskScope,
  villagesAllowedForDesk,
} from "@/lib/domain/village-admins";
import { GasApiError, gasClient } from "@/lib/gas-client";

const UNASSIGNED_VILLAGES = ["中溪里", "中興里", "光明里", "協和里", "忠義里", "前溪里", "勵行里"];

export async function POST(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const roleKey = getRoleKey(request);
  if (roleKey === "desk_clerk") {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "臨時登打帳號暫不開放衛福部進度回報。",
        },
      },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const villageName = String(body.villageName || body.village_name || "").trim();
    if (!villageName) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "請選擇里別。" } },
        { status: 400 },
      );
    }

    const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
    const email = manager?.email || String(request.cookies.get("demo_email")?.value || "");
    const name =
      manager?.name ||
      String(request.cookies.get("demo_name")?.value || "").trim() ||
      email;

    const adminRows = await gasClient.villageAdmins
      .list()
      .catch(() => [] as Record<string, unknown>[]);
    const admins = adminRows.map(mapVillageAdminRow);
    const scope = resolveDeskScope({
      identity: {
        email,
        name,
        roleKey,
        orgEmailMap: getDeskOrgEmailMap(),
      },
      admins,
      visitors: [],
      unassignedVillages: UNASSIGNED_VILLAGES,
    });
    const allowed = villagesAllowedForDesk(scope);
    if (allowed && !allowed.includes(villageName)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "此里不在您的責任範圍。" } },
        { status: 403 },
      );
    }

    const fromAdmins: Record<string, string> = {};
    for (const row of admins) {
      const code = formatYongheVillageCode(row.villageCode);
      if (row.villageName && code) fromAdmins[row.villageName] = code;
    }
    const villageCodeByName = mergeYongheVillageCodeByName(fromAdmins);
    const villageCode =
      String(body.villageCode || body.village_code || "").trim() ||
      villageCodeByName[villageName] ||
      "";

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items: Array<{ case_id: string; encoded_id?: string; outcome: MohwProgressOutcome }> =
      [];
    for (const raw of rawItems) {
      const item = (raw || {}) as Record<string, unknown>;
      const outcome = normalizeMohwProgressOutcome(String(item.outcome || ""));
      if (!outcome) continue;
      const caseId = String(item.case_id || item.caseId || "").trim();
      const encodedId = String(item.encoded_id || item.encodedId || "").trim();
      if (!caseId && !encodedId) continue;
      items.push({
        case_id: caseId,
        encoded_id: encodedId || undefined,
        outcome,
      });
    }
    if (!items.length) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "請至少勾選一筆個案狀態。" } },
        { status: 400 },
      );
    }

    const civilWorkerId = String(body.civilWorkerId || body.civil_worker_id || "").trim();
    const civilWorkerName = String(body.civilWorkerName || body.civil_worker_name || "").trim();
    const socialWorkerId = String(body.socialWorkerId || body.social_worker_id || "").trim();
    const socialWorkerName = String(
      body.socialWorkerName || body.social_worker_name || "",
    ).trim();
    const keyedById = String(body.keyedById || body.keyed_by_id || "").trim();
    const keyedByName = String(body.keyedByName || body.keyed_by_name || "").trim();
    if (!civilWorkerName && !socialWorkerName) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "請至少選擇民政或社政訪查員。",
          },
        },
        { status: 400 },
      );
    }
    if (!keyedByName) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "請選擇建檔人員。" } },
        { status: 400 },
      );
    }

    const result = await gasClient.mohwProgress.submit({
      village_name: villageName,
      village_code: villageCode,
      mode: "case_list",
      items,
      civil_worker_id: civilWorkerId,
      civil_worker_name: civilWorkerName,
      social_worker_id: socialWorkerId,
      social_worker_name: socialWorkerName,
      keyed_by_id: keyedById,
      keyed_by_name: keyedByName,
      audit_supervisors: [],
      reported_by: name,
      reported_by_email: email,
      notes: String(body.notes || "").trim(),
      source: "MOHW直KEY",
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof GasApiError) {
      const status = error.code === "VALIDATION_ERROR" ? 400 : 502;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }
    const message = error instanceof Error ? error.message : "送出失敗";
    return NextResponse.json({ error: { code: "GAS_WRITE_FAILED", message } }, { status: 502 });
  }
}
