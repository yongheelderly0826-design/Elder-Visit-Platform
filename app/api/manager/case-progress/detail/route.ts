import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import type {
  CaseProgressCareformDetail,
  CaseProgressCaseDetail,
  CaseProgressDeskLogDetail,
  CaseProgressMarkDetail,
} from "@/lib/domain/case-progress";
import { gasClient } from "@/lib/gas-client";

function asStringOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function mapCareform(raw: Record<string, unknown>): CaseProgressCareformDetail {
  return {
    careform_id: String(raw.careform_id ?? ""),
    status: String(raw.status ?? ""),
    submitted_at: asStringOrNull(raw.submitted_at),
    audited_at: asStringOrNull(raw.audited_at),
    visit_result: asStringOrNull(raw.visit_result),
    visit_date: asStringOrNull(raw.visit_date),
    visit_start_time: asStringOrNull(raw.visit_start_time),
    visit_end_time: asStringOrNull(raw.visit_end_time),
    keyed_by_name: asStringOrNull(raw.keyed_by_name),
    keyed_source: asStringOrNull(raw.keyed_source),
    keyed_clerk_id: asStringOrNull(raw.keyed_clerk_id),
    visitor_side: asStringOrNull(raw.visitor_side),
    visitor_side_label: asStringOrNull(raw.visitor_side_label),
    civil_worker_name: asStringOrNull(raw.civil_worker_name),
    social_worker_name: asStringOrNull(raw.social_worker_name),
    civil_worker_date: asStringOrNull(raw.civil_worker_date),
    social_worker_date: asStringOrNull(raw.social_worker_date),
  };
}

function mapMark(raw: Record<string, unknown>): CaseProgressMarkDetail {
  return {
    mark_id: String(raw.mark_id ?? ""),
    outcome: String(raw.outcome ?? ""),
    source: asStringOrNull(raw.source),
    civil_worker_id: asStringOrNull(raw.civil_worker_id),
    civil_worker_name: asStringOrNull(raw.civil_worker_name),
    social_worker_id: asStringOrNull(raw.social_worker_id),
    social_worker_name: asStringOrNull(raw.social_worker_name),
    keyed_by_id: asStringOrNull(raw.keyed_by_id),
    keyed_by_name: asStringOrNull(raw.keyed_by_name),
    reported_at: asStringOrNull(raw.reported_at),
    reported_by: asStringOrNull(raw.reported_by),
    village_name: asStringOrNull(raw.village_name),
  };
}

function mapDeskLog(raw: Record<string, unknown>): CaseProgressDeskLogDetail {
  return {
    log_id: String(raw.log_id ?? ""),
    clerk_id: asStringOrNull(raw.clerk_id),
    display_name: asStringOrNull(raw.display_name),
    careform_id: asStringOrNull(raw.careform_id),
    visit_result: asStringOrNull(raw.visit_result),
    visit_date: asStringOrNull(raw.visit_date),
    keyed_at: asStringOrNull(raw.keyed_at),
  };
}

function mapPayload(raw: Record<string, unknown>): CaseProgressCaseDetail {
  const careforms = Array.isArray(raw.careforms)
    ? raw.careforms.map((row) => mapCareform((row ?? {}) as Record<string, unknown>))
    : [];
  const marks = Array.isArray(raw.marks)
    ? raw.marks.map((row) => mapMark((row ?? {}) as Record<string, unknown>))
    : [];
  const deskLogs = Array.isArray(raw.desk_logs)
    ? raw.desk_logs.map((row) => mapDeskLog((row ?? {}) as Record<string, unknown>))
    : [];

  return {
    case_id: String(raw.case_id ?? ""),
    name_masked: String(raw.name_masked ?? "—"),
    id_masked: String(raw.id_masked ?? "—"),
    village: String(raw.village ?? ""),
    visit_status: String(raw.visit_status ?? ""),
    roster_status: String(raw.roster_status ?? ""),
    channel: String(raw.channel ?? ""),
    has_careform: Boolean(raw.has_careform),
    has_direct_mark: Boolean(raw.has_direct_mark),
    roster_only: Boolean(raw.roster_only),
    system_only: Boolean(raw.system_only),
    civil_worker_name: asStringOrNull(raw.civil_worker_name),
    social_worker_name: asStringOrNull(raw.social_worker_name),
    careforms,
    marks,
    desk_logs: deskLogs,
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
  };
}

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.read");
  if (forbidden) return forbidden;

  const caseId = String(request.nextUrl.searchParams.get("case_id") ?? "").trim();
  const bucket = String(request.nextUrl.searchParams.get("bucket") ?? "").trim();
  const seq = String(request.nextUrl.searchParams.get("seq") ?? "").trim();

  if (!caseId && !(bucket && seq)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "請提供 case_id，或 bucket+seq",
        },
      },
      { status: 400 },
    );
  }

  try {
    const t0 = Date.now();
    const raw = await gasClient.caseProgress.getCaseDetail({
      ...(caseId ? { case_id: caseId } : {}),
      ...(!caseId && bucket ? { bucket } : {}),
      ...(!caseId && seq ? { seq } : {}),
    });
    const elapsed = Date.now() - t0;
    console.info(
      `[case-progress/detail] ${elapsed}ms case_id=${caseId || "-"} bucket=${bucket || "-"} seq=${seq || "-"}`,
    );
    return NextResponse.json({
      data: mapPayload(raw),
      meta: { elapsed_ms: elapsed },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入個案詳情";
    const notFound = /找不到|NOT_FOUND/i.test(message);
    return NextResponse.json(
      { error: { code: notFound ? "NOT_FOUND" : "GAS_READ_FAILED", message } },
      { status: notFound ? 404 : 502 },
    );
  }
}
