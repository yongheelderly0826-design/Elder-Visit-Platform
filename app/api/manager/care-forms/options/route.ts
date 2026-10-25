import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getDeskOrgEmailMap } from "@/lib/domain/desk-org-emails";
import { mapDeskCase, mapDeskVisitor } from "@/lib/domain/manager-care-form-desk";
import {
  buildDeskIdentityOptions,
  mapVillageAdminRow,
  resolveDeskScope,
  villagesAllowedForDesk,
  YONGHE_VILLAGE_NAMES,
} from "@/lib/domain/village-admins";
import { gasClient } from "@/lib/gas-client";

const UNASSIGNED_VILLAGES = ["中溪里", "中興里", "光明里", "協和里", "忠義里", "前溪里", "勵行里"];

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  try {
    const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
    const roleKey = getRoleKey(request);

    const [caseRows, visitorRows, adminRows] = await Promise.all([
      gasClient.cases.list({ district: "永和區" }) as Promise<Record<string, unknown>[]>,
      gasClient.visitors.list() as Promise<Record<string, unknown>[]>,
      gasClient.villageAdmins.list().catch(() => [] as Record<string, unknown>[]),
    ]);

    const visitors = visitorRows
      .map(mapDeskVisitor)
      .filter((item) => item.id)
      .sort((a, b) => Number(b.status === "已核准") - Number(a.status === "已核准"));

    const admins = adminRows.map(mapVillageAdminRow);
    const scope = resolveDeskScope({
      identity: {
        email: manager?.email || "",
        name: manager?.name || "",
        roleKey,
        orgEmailMap: getDeskOrgEmailMap(),
      },
      admins,
      visitors: visitorRows.map((row) => ({
        visitorId: String(row.visitor_id || ""),
        name: String(row.name || row.full_name || ""),
        email: String(row.email || "").toLowerCase(),
      })),
      unassignedVillages: UNASSIGNED_VILLAGES,
    });

    const allowed = villagesAllowedForDesk(scope);
    let cases = caseRows.map(mapDeskCase).filter((item) => item.id && item.name);
    if (allowed) {
      const set = new Set(allowed);
      cases = cases.filter((item) => set.has(item.village));
    }
    // 一般佇列排除「不訪」
    if (scope.mode !== "all") {
      cases = cases.filter((item) => item.visitStatus !== "不訪");
    }

    const caseVillages = [...new Set(cases.map((item) => item.village).filter(Boolean))];
    const identityOptions = buildDeskIdentityOptions({
      scope,
      admins,
      allVillages: caseVillages.length ? caseVillages : YONGHE_VILLAGE_NAMES,
    });

    return NextResponse.json({
      data: {
        cases,
        visitors,
        scope,
        allowedVillages: allowed,
        identityOptions,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入個案與訪查員";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
