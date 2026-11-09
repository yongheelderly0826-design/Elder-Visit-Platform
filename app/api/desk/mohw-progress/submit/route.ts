import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getDeskOrgEmailMap } from "@/lib/domain/desk-org-emails";
import {
  countTotal,
  normalizeNonNegInt,
  overRosterWarning,
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
    const mode = String(body.mode || "count").trim() as "count" | "case_codes" | "range";
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

    const payload: Record<string, unknown> = {
      village_name: villageName,
      village_code: villageCode,
      mode,
      reported_by: name,
      reported_by_email: email,
      notes: String(body.notes || "").trim(),
      source: "MOHW直KEY",
    };

    if (mode === "count") {
      const countDone = normalizeNonNegInt(body.countDone ?? body.count_done);
      const countMissed = normalizeNonNegInt(body.countMissed ?? body.count_missed);
      const countNotFound = normalizeNonNegInt(body.countNotFound ?? body.count_not_found);
      if (countTotal({ countDone, countMissed, countNotFound }) <= 0) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "請至少填一項人數。" } },
          { status: 400 },
        );
      }
      payload.count_done = countDone;
      payload.count_missed = countMissed;
      payload.count_not_found = countNotFound;
    } else if (mode === "case_codes") {
      payload.outcome = String(body.outcome || "").trim();
      payload.case_codes_text = String(body.caseCodesText || body.case_codes_text || "").trim();
    } else if (mode === "range") {
      payload.outcome = String(body.outcome || "").trim();
      payload.range_text = String(body.rangeText || body.range_text || "").trim();
    } else {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "不支援的輸入模式。" } },
        { status: 400 },
      );
    }

    const result = await gasClient.mohwProgress.submit(payload);
    const clientWarning =
      mode === "count"
        ? overRosterWarning(
            countTotal({
              countDone: normalizeNonNegInt(payload.count_done),
              countMissed: normalizeNonNegInt(payload.count_missed),
              countNotFound: normalizeNonNegInt(payload.count_not_found),
            }),
            Number(result.roster_total || 0),
          )
        : null;

    return NextResponse.json({
      data: {
        ...result,
        warnings: [
          ...(result.warnings || []),
          ...(clientWarning && !(result.warnings || []).includes(clientWarning)
            ? [clientWarning]
            : []),
        ],
      },
    });
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
