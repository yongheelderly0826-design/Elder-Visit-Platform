import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import {
  emptyCaseProgressSummary,
  type CaseProgressSummaryPayload,
} from "@/lib/domain/case-progress";
import { gasClient } from "@/lib/gas-client";

function asNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapPayload(raw: Record<string, unknown>): CaseProgressSummaryPayload {
  const base = emptyCaseProgressSummary();
  const roster = (raw.roster ?? {}) as Record<string, unknown>;
  const totals = (raw.totals ?? {}) as Record<string, unknown>;
  const channels = (raw.channels ?? {}) as Record<string, unknown>;
  const gaps = (raw.gaps ?? {}) as Record<string, unknown>;
  const buckets = (raw.buckets ?? {}) as Record<string, unknown>;

  return {
    ...base,
    computed_at: String(raw.computed_at ?? ""),
    from_cache: Boolean(raw.from_cache),
    village_filter: (raw.village_filter as string | null | undefined) ?? null,
    roster: {
      loaded: Boolean(roster.loaded),
      snapshot_id: (roster.snapshot_id as string | null | undefined) ?? null,
      total: asNumber(roster.total),
      both_sides: asNumber(roster.both_sides),
      system_only: asNumber(roster.system_only),
      roster_only: asNumber(roster.roster_only),
    },
    totals: {
      system_roster: asNumber(totals.system_roster),
      careform_keyed: asNumber(totals.careform_keyed),
      direct_keyed: asNumber(totals.direct_keyed),
      both_channels: asNumber(totals.both_channels),
      no_trace: asNumber(totals.no_trace),
      any_record: asNumber(totals.any_record),
      incomplete_visit_status: asNumber(totals.incomplete_visit_status),
      completion_rate: asNumber(totals.completion_rate),
    },
    channels: {
      careform: asNumber(channels.careform),
      direct_mark: asNumber(channels.direct_mark),
      both: asNumber(channels.both),
      none: asNumber(channels.none),
      any_record: asNumber(channels.any_record),
    },
    visit_status_counts: (raw.visit_status_counts as Record<string, number>) ?? {},
    gaps: {
      mark_but_unvisited: asNumber(gaps.mark_but_unvisited),
      careform_but_unvisited: asNumber(gaps.careform_but_unvisited),
    },
    buckets: {
      A_roster_result_careform: asNumber(buckets.A_roster_result_careform),
      B_roster_result_direct: asNumber(buckets.B_roster_result_direct),
      C_roster_result_no_trace: asNumber(buckets.C_roster_result_no_trace),
      D_careform_roster_pending: asNumber(buckets.D_careform_roster_pending),
      E_both_pending_with_mark: asNumber(buckets.E_both_pending_with_mark),
      E_both_pending: asNumber(buckets.E_both_pending),
      F_roster_only_pending: asNumber(buckets.F_roster_only_pending),
      F_roster_only_result: asNumber(buckets.F_roster_only_result),
      F_system_only: asNumber(buckets.F_system_only),
    },
    roster_status_cross:
      (raw.roster_status_cross as CaseProgressSummaryPayload["roster_status_cross"]) ?? {},
    samples_by_bucket:
      (raw.samples_by_bucket as CaseProgressSummaryPayload["samples_by_bucket"]) ?? {},
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : base.notes,
  };
}

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.read");
  if (forbidden) return forbidden;

  try {
    const village = String(request.nextUrl.searchParams.get("village") ?? "").trim();
    const force = String(request.nextUrl.searchParams.get("force_refresh") ?? "") === "1";
    const raw = await gasClient.caseProgress.summary({
      ...(village ? { village_name: village } : {}),
      ...(force ? { force_refresh: "true" } : {}),
      include_samples: "true",
      sample_limit: "40",
    });
    return NextResponse.json({ data: mapPayload(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入個案進度儀表板";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
