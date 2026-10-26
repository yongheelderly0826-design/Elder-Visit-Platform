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
  type DeskScope,
} from "@/lib/domain/village-admins";
import { gasClient } from "@/lib/gas-client";
import {
  cachedRead,
  GAS_READ_CACHE_SECONDS_DESK,
  GAS_READ_TAGS,
} from "@/lib/gas-read-cache";

const UNASSIGNED_VILLAGES = ["中溪里", "中興里", "光明里", "協和里", "忠義里", "前溪里", "勵行里"];

/**
 * 紙本建檔 options（拆段加速）：
 * - 預設／part=identities：只載里責任 → 身份／里別（最快）
 * - part=visitors：訪查員精簡清單（背景載）
 * - ?village=XX：該里個案
 */
export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const villageParam = String(request.nextUrl.searchParams.get("village") ?? "").trim();
  const caseIdParam = String(request.nextUrl.searchParams.get("caseId") ?? "").trim();
  const part = String(request.nextUrl.searchParams.get("part") ?? "identities").trim();

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
      const cases = await loadVillageCases(village, { email, name, roleKey });
      return NextResponse.json({ data: { village, cases } });
    }

    if (part === "visitors") {
      const visitors = await cachedRead(
        ["desk-care-form-visitors-slim-v2"],
        [GAS_READ_TAGS.deskCareFormOptions],
        () => loadDeskVisitors(),
        GAS_READ_CACHE_SECONDS_DESK,
      );
      return NextResponse.json({ data: { visitors } });
    }

    // v3：避免舊版「承辦→空身份」結果卡在 unstable_cache。
    const payload = await cachedRead(
      ["desk-care-form-identities-v3", email || "anon", roleKey],
      [GAS_READ_TAGS.deskCareFormOptions, GAS_READ_TAGS.villageAdmins],
      () => loadDeskIdentities({ email, name, roleKey }),
      GAS_READ_CACHE_SECONDS_DESK,
    );

    return NextResponse.json(
      { data: payload },
      {
        headers: {
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入個案與訪查員";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}

async function loadDeskIdentities(identity: {
  email: string;
  name: string;
  roleKey: string;
}) {
  const adminRows = await gasClient.villageAdmins
    .list()
    .catch(() => [] as Record<string, unknown>[]);
  const admins = adminRows.map(mapVillageAdminRow);

  // 身份下拉不阻塞訪查員主檔：先用姓名／組織 email 對里責任表。
  const scope = resolveDeskScope({
    identity: {
      email: identity.email,
      name: identity.name,
      roleKey: identity.roleKey,
      orgEmailMap: getDeskOrgEmailMap(),
    },
    admins,
    visitors: [],
    unassignedVillages: UNASSIGNED_VILLAGES,
  });

  const allowed = villagesAllowedForDesk(scope);
  const identityOptions = buildDeskIdentityOptions({
    scope,
    admins,
    allVillages: [
      ...new Set([
        ...YONGHE_VILLAGE_NAMES,
        ...admins.map((row) => row.villageName).filter(Boolean),
      ]),
    ],
  });

  return {
    cases: [] as ReturnType<typeof mapDeskCase>[],
    visitors: [] as ReturnType<typeof mapDeskVisitor>[],
    scope,
    allowedVillages: allowed,
    identityOptions,
  };
}

async function loadDeskVisitors() {
  const visitorRows = (await gasClient.visitors.list({ slim: true })) as Record<
    string,
    unknown
  >[];
  return visitorRows
    .map(mapDeskVisitor)
    .filter((item) => item.id)
    .sort((a, b) => Number(b.status === "已核准") - Number(a.status === "已核准"));
}

async function resolveScopeOnly(identity: {
  email: string;
  name: string;
  roleKey: string;
}): Promise<DeskScope> {
  const adminRows = await gasClient.villageAdmins
    .list()
    .catch(() => [] as Record<string, unknown>[]);
  return resolveDeskScope({
    identity: {
      email: identity.email,
      name: identity.name,
      roleKey: identity.roleKey,
      orgEmailMap: getDeskOrgEmailMap(),
    },
    admins: adminRows.map(mapVillageAdminRow),
    visitors: [],
    unassignedVillages: UNASSIGNED_VILLAGES,
  });
}

async function loadVillageCases(
  village: string,
  identity: { email: string; name: string; roleKey: string },
) {
  const [caseRows, scope] = await Promise.all([
    gasClient.cases.list({ district: "永和區", visit_village: village }) as Promise<
      Record<string, unknown>[]
    >,
    resolveScopeOnly(identity),
  ]);

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
