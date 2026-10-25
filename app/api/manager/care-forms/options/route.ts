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
import {
  cachedRead,
  GAS_READ_CACHE_SECONDS_DESK,
  GAS_READ_TAGS,
} from "@/lib/gas-read-cache";

const UNASSIGNED_VILLAGES = ["中溪里", "中興里", "光明里", "協和里", "忠義里", "前溪里", "勵行里"];

/**
 * 紙本建檔 options：
 * - 預設：身份／里別／訪查員（不快取全區 6900 個案）
 * - ?village=XX：只回該里個案（可快取）
 */
export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const villageParam = String(request.nextUrl.searchParams.get("village") ?? "").trim();
  const caseIdParam = String(request.nextUrl.searchParams.get("caseId") ?? "").trim();

  try {
    const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
    const roleKey = getRoleKey(request);
    const email = manager?.email || "";
    const name = manager?.name || "";

    let village = villageParam;
    if (!village && caseIdParam) {
      const caseRow = (await gasClient.cases.get(caseIdParam)) as Record<string, unknown> | null;
      village = String(caseRow?.visit_village ?? "").trim();
    }

    if (village) {
      const cases = await loadVillageCases(village, {
        email,
        name,
        roleKey,
      });
      return NextResponse.json({
        data: {
          village,
          cases,
        },
      });
    }

    const payload = await cachedRead(
      ["desk-care-form-options-meta", email || "anon", roleKey],
      [GAS_READ_TAGS.deskCareFormOptions, GAS_READ_TAGS.villageAdmins],
      () => loadDeskOptionsMeta({ email, name, roleKey }),
      GAS_READ_CACHE_SECONDS_DESK,
    );

    return NextResponse.json({ data: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入個案與訪查員";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}

async function loadDeskOptionsMeta(identity: {
  email: string;
  name: string;
  roleKey: string;
}) {
  const [visitorRows, adminRows] = await Promise.all([
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
      email: identity.email,
      name: identity.name,
      roleKey: identity.roleKey,
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
  const identityOptions = buildDeskIdentityOptions({
    scope,
    admins,
    // 不依賴全區 cases.list（過大無法快取）；里名用模板＋里責任表即可。
    allVillages: [
      ...new Set([
        ...YONGHE_VILLAGE_NAMES,
        ...admins.map((row) => row.villageName).filter(Boolean),
      ]),
    ],
  });

  return {
    cases: [] as ReturnType<typeof mapDeskCase>[],
    visitors,
    scope,
    allowedVillages: allowed,
    identityOptions,
  };
}

async function loadVillageCases(
  village: string,
  identity: { email: string; name: string; roleKey: string },
) {
  const [caseRows, adminRows, visitorRows] = await Promise.all([
    gasClient.cases.list({ district: "永和區", visit_village: village }) as Promise<
      Record<string, unknown>[]
    >,
    gasClient.villageAdmins.list().catch(() => [] as Record<string, unknown>[]),
    gasClient.visitors.list() as Promise<Record<string, unknown>[]>,
  ]);

  const admins = adminRows.map(mapVillageAdminRow);
  const scope = resolveDeskScope({
    identity: {
      email: identity.email,
      name: identity.name,
      roleKey: identity.roleKey,
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
  if (allowed && !allowed.includes(village)) {
    return [];
  }

  let cases = caseRows.map(mapDeskCase).filter((item) => item.id && item.name);
  if (scope.mode !== "all") {
    cases = cases.filter((item) => item.visitStatus !== "不訪");
  }
  return cases;
}
