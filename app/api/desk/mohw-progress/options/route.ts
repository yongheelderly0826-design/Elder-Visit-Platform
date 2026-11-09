import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getDeskOrgEmailMap } from "@/lib/domain/desk-org-emails";
import {
  formatYongheVillageCode,
  mapVillageAdminRow,
  mergeYongheVillageCodeByName,
  resolveDeskScope,
  villagesAllowedForDesk,
  YONGHE_VILLAGE_NAMES,
  sortYongheVillagesByCode,
} from "@/lib/domain/village-admins";
import { gasClient } from "@/lib/gas-client";

const UNASSIGNED_VILLAGES = ["中溪里", "中興里", "光明里", "協和里", "忠義里", "前溪里", "勵行里"];

export async function GET(request: NextRequest) {
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
    const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
    const email = manager?.email || String(request.cookies.get("demo_email")?.value || "");
    const name =
      manager?.name ||
      String(request.cookies.get("demo_name")?.value || "").trim() ||
      email;

    const villageParam = String(request.nextUrl.searchParams.get("village") ?? "").trim();

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

    const fromAdmins: Record<string, string> = {};
    for (const row of admins) {
      const code = formatYongheVillageCode(row.villageCode);
      if (row.villageName && code) fromAdmins[row.villageName] = code;
    }
    const villageCodeByName = mergeYongheVillageCodeByName(fromAdmins);

    const allVillages = sortYongheVillagesByCode([
      ...new Set([
        ...YONGHE_VILLAGE_NAMES,
        ...admins.map((row) => row.villageName).filter(Boolean),
      ]),
    ]);
    const villages =
      allowed == null
        ? allVillages
        : sortYongheVillagesByCode(allVillages.filter((name) => allowed.includes(name)));

    let rosterTotal: number | null = null;
    if (villageParam) {
      if (allowed && !allowed.includes(villageParam)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "此里不在您的責任範圍。" } },
          { status: 403 },
        );
      }
      const cases = (await gasClient.cases.list({
        district: "永和區",
        visit_village: villageParam,
      })) as Record<string, unknown>[];
      rosterTotal = cases.length;
    }

    return NextResponse.json({
      data: {
        scope,
        villages,
        villageCodeByName,
        rosterTotal,
        reporter: { name, email },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入進度回報選項";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
