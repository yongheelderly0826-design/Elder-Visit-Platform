import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getDeskOrgEmailMap } from "@/lib/domain/desk-org-emails";
import {
  emptyMohwProgressCaseMeta,
  isMohwProgressOutcome,
  mapMohwProgressCaseContext,
  type MohwProgressCaseRow,
  type MohwProgressOutcome,
} from "@/lib/domain/mohw-progress";
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

function sortCases(rows: Record<string, unknown>[]) {
  return [...rows].sort((a, b) => {
    const sa = Number(a.village_seq);
    const sb = Number(b.village_seq);
    if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
    return String(a.encoded_id || "").localeCompare(String(b.encoded_id || ""));
  });
}

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
    let excludedWithCareform: number | null = null;
    let cases: MohwProgressCaseRow[] = [];
    let contextWarning: string | null = null;

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
            message: error instanceof Error ? error.message : "讀取未建檔個案失敗",
          })),
      ]);
      const caseRows = sortCases(rawCaseRows);
      rosterTotal = caseRows.length;

      if (!contextResult.ok) {
        contextWarning = `無法篩選未建檔個案（${contextResult.message}）。請稍後再試或通知系統管理員部署 GAS。`;
        excludedWithCareform = null;
        cases = [];
      } else {
        const contextPayload = contextResult.payload;
        if (typeof contextPayload.roster_total === "number") {
          rosterTotal = contextPayload.roster_total;
        }
        if (typeof contextPayload.excluded_with_careform === "number") {
          excludedWithCareform = contextPayload.excluded_with_careform;
        }

        const contextByCaseId = new Map<
          string,
          ReturnType<typeof mapMohwProgressCaseContext>
        >();
        for (const item of contextPayload.items ?? []) {
          const caseId = String(item.case_id || "").trim();
          if (!caseId) continue;
          contextByCaseId.set(caseId, mapMohwProgressCaseContext(item));
        }

        // 只列 GAS 回傳的未建檔個案（無 已提交／已稽核 eligible 關懷表）
        if (excludedWithCareform == null) {
          excludedWithCareform = Math.max(caseRows.length - contextByCaseId.size, 0);
        }

        const outcomeByCaseId = new Map<string, MohwProgressOutcome>();
        for (const mark of marks) {
          const outcome = String(mark.outcome || "");
          if (!isMohwProgressOutcome(outcome)) continue;
          const caseId = String(mark.case_id || "");
          if (caseId) outcomeByCaseId.set(caseId, outcome);
        }

        cases = caseRows
          .filter((row) => contextByCaseId.has(String(row.case_id || "")))
          .map((row) => {
            const caseId = String(row.case_id || "");
            const seqRaw = Number(row.village_seq);
            const meta = contextByCaseId.get(caseId) ?? emptyMohwProgressCaseMeta();
            return {
              case_id: caseId,
              encoded_id: String(row.encoded_id || ""),
              village_seq: Number.isFinite(seqRaw) ? seqRaw : null,
              name: String(row.name || row.elder_name || ""),
              outcome: outcomeByCaseId.get(caseId) || "",
              ...meta,
            };
          });
      }
    }

    return NextResponse.json({
      data: {
        scope,
        villages,
        villageCodeByName,
        rosterTotal,
        excludedWithCareform,
        contextWarning,
        cases,
        reporter: { name, email },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入進度回報選項";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
