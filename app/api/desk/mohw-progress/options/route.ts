import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getDeskOrgEmailMap } from "@/lib/domain/desk-org-emails";
import {
  emptyMohwProgressCaseMeta,
  mapMohwProgressCaseContext,
  normalizeMohwProgressOutcome,
  type MohwProgressCaseRow,
  type MohwProgressOutcome,
} from "@/lib/domain/mohw-progress";
import { mapDeskVisitor } from "@/lib/domain/manager-care-form-desk";
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
import {
  cachedRead,
  GAS_READ_CACHE_SECONDS_DESK,
  GAS_READ_TAGS,
} from "@/lib/gas-read-cache";

const UNASSIGNED_VILLAGES = ["中溪里", "中興里", "光明里", "協和里", "忠義里", "前溪里", "勵行里"];

/** 與關懷表建檔 KEY 單相同：紙本里編號 village_seq，缺則 external_id，再比姓名。 */
function sortCasesLikeDeskKey(rows: Record<string, unknown>[]) {
  return [...rows].sort((a, b) => {
    const aSeqRaw = Number(a.village_seq);
    const bSeqRaw = Number(b.village_seq);
    const aSeq = Number.isFinite(aSeqRaw)
      ? aSeqRaw
      : Number(a.external_id) || Number.POSITIVE_INFINITY;
    const bSeq = Number.isFinite(bSeqRaw)
      ? bSeqRaw
      : Number(b.external_id) || Number.POSITIVE_INFINITY;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant");
  });
}

function mapCaseRows(
  caseRows: Record<string, unknown>[],
  contextByCaseId: Map<string, ReturnType<typeof mapMohwProgressCaseContext>>,
  outcomeByCaseId: Map<string, MohwProgressOutcome>,
  markStaffByCaseId: Map<string, { civil_worker_name: string; social_worker_name: string }>,
): MohwProgressCaseRow[] {
  return caseRows
    .filter((row) => contextByCaseId.has(String(row.case_id || "")))
    .map((row) => {
      const caseId = String(row.case_id || "");
      const seqRaw = Number(row.village_seq);
      const meta = contextByCaseId.get(caseId) ?? emptyMohwProgressCaseMeta();
      const markStaff = markStaffByCaseId.get(caseId);
      return {
        case_id: caseId,
        encoded_id: String(row.encoded_id || ""),
        village_seq: Number.isFinite(seqRaw) ? seqRaw : null,
        name: String(row.name || row.elder_name || ""),
        outcome: outcomeByCaseId.get(caseId) || "",
        ...meta,
        civil_worker_name: markStaff?.civil_worker_name || meta.civil_worker_name,
        social_worker_name: markStaff?.social_worker_name || meta.social_worker_name,
      };
    });
}

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const roleKey = getRoleKey(request);

  try {
    const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
    const clerkId = String(request.cookies.get("desk_clerk_id")?.value || "").trim();
    const email =
      manager?.email ||
      String(request.cookies.get("demo_email")?.value || "").trim() ||
      (roleKey === "desk_clerk" ? clerkId : "");
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
    let keyedCount: number | null = null;
    let directCount: number | null = null;
    let casesKeyed: MohwProgressCaseRow[] = [];
    let casesDirectMohw: MohwProgressCaseRow[] = [];
    let contextWarning: string | null = null;

    const visitors = await cachedRead(
      ["desk-mohw-progress-visitors-slim-v1"],
      [GAS_READ_TAGS.deskCareFormOptions],
      async () => {
        const visitorRows = (await gasClient.visitors.list({ slim: true })) as Record<
          string,
          unknown
        >[];
        return visitorRows
          .map(mapDeskVisitor)
          .filter((item) => item.id)
          .sort((a, b) => Number(b.status === "已核准") - Number(a.status === "已核准"));
      },
      GAS_READ_CACHE_SECONDS_DESK,
    ).catch(() => []);

    if (villageParam) {
      if (allowed && !allowed.includes(villageParam)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "此里不在您的責任範圍。" } },
          { status: 403 },
        );
      }
      const [rawCaseRows, marks, contextResult] = await Promise.all([
        gasClient.cases.list({
          district: "永和區",
          visit_village: villageParam,
        }) as Promise<Record<string, unknown>[]>,
        gasClient.mohwProgress
          .listMarks({ village_name: villageParam })
          .catch(() => [] as Record<string, unknown>[]),
        gasClient.mohwProgress
          .listCaseContext({ village_name: villageParam })
          .then((payload) => ({ ok: true as const, payload }))
          .catch((error: unknown) => ({
            ok: false as const,
            message: error instanceof Error ? error.message : "讀取個案分組失敗",
          })),
      ]);
      const caseRows = sortCasesLikeDeskKey(rawCaseRows);
      rosterTotal = caseRows.length;

      if (!contextResult.ok) {
        contextWarning = `無法分組個案（${contextResult.message}）。請稍後再試或通知系統管理員部署 GAS。`;
        keyedCount = null;
        directCount = null;
        casesKeyed = [];
        casesDirectMohw = [];
      } else {
        const contextPayload = contextResult.payload;
        if (typeof contextPayload.roster_total === "number") {
          rosterTotal = contextPayload.roster_total;
        }

        const keyedItems =
          contextPayload.items_keyed ??
          (typeof contextPayload.keyed_count === "number" ? [] : []);
        const directItems =
          contextPayload.items_direct ??
          contextPayload.items ??
          [];

        const keyedByCaseId = new Map<string, ReturnType<typeof mapMohwProgressCaseContext>>();
        for (const item of keyedItems) {
          const caseId = String(item.case_id || "").trim();
          if (!caseId) continue;
          keyedByCaseId.set(caseId, mapMohwProgressCaseContext(item));
        }

        const directByCaseId = new Map<string, ReturnType<typeof mapMohwProgressCaseContext>>();
        for (const item of directItems) {
          const caseId = String(item.case_id || "").trim();
          if (!caseId) continue;
          directByCaseId.set(caseId, mapMohwProgressCaseContext(item));
        }

        // 舊 GAS 只回 items（未建檔）時：其餘名冊視為已 KEY
        if (
          !contextPayload.items_keyed &&
          !contextPayload.items_direct &&
          Array.isArray(contextPayload.items)
        ) {
          for (const row of caseRows) {
            const caseId = String(row.case_id || "").trim();
            if (!caseId || directByCaseId.has(caseId)) continue;
            keyedByCaseId.set(caseId, emptyMohwProgressCaseMeta());
          }
        }

        keyedCount =
          typeof contextPayload.keyed_count === "number"
            ? contextPayload.keyed_count
            : typeof contextPayload.excluded_with_careform === "number"
              ? contextPayload.excluded_with_careform
              : keyedByCaseId.size;
        directCount =
          typeof contextPayload.direct_count === "number"
            ? contextPayload.direct_count
            : directByCaseId.size;

        const outcomeByCaseId = new Map<string, MohwProgressOutcome>();
        const markStaffByCaseId = new Map<
          string,
          { civil_worker_name: string; social_worker_name: string }
        >();
        for (const mark of marks) {
          const outcome = normalizeMohwProgressOutcome(String(mark.outcome || ""));
          if (!outcome) continue;
          const caseId = String(mark.case_id || "");
          if (!caseId) continue;
          // 直 KEY 標記只套在直 KEY 分組
          if (!directByCaseId.has(caseId)) continue;
          outcomeByCaseId.set(caseId, outcome);
          const civil = String(mark.civil_worker_name || "").trim();
          const social = String(mark.social_worker_name || "").trim();
          if (civil || social) {
            markStaffByCaseId.set(caseId, {
              civil_worker_name: civil,
              social_worker_name: social,
            });
          }
        }

        casesKeyed = mapCaseRows(caseRows, keyedByCaseId, new Map(), new Map());
        casesDirectMohw = mapCaseRows(
          caseRows,
          directByCaseId,
          outcomeByCaseId,
          markStaffByCaseId,
        );
      }
    }

    return NextResponse.json({
      data: {
        scope,
        villages,
        villageCodeByName,
        visitors,
        rosterTotal,
        keyedCount,
        directCount,
        /** @deprecated 同 keyedCount */
        excludedWithCareform: keyedCount,
        contextWarning,
        casesKeyed,
        casesDirectMohw,
        /** @deprecated 同 casesDirectMohw */
        cases: casesDirectMohw,
        reporter: { name, email },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入進度回報選項";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
