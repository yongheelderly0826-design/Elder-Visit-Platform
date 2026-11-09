import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import {
  mapMohwProgressVillageSummary,
  type MohwProgressSummaryPayload,
  type MohwProgressSummaryTotals,
} from "@/lib/domain/mohw-progress";
import { gasClient } from "@/lib/gas-client";

function emptyTotals(): MohwProgressSummaryTotals {
  return {
    roster_total: 0,
    platform_keyed: 0,
    direct_done: 0,
    direct_missed: 0,
    direct_not_found: 0,
    direct_unset: 0,
    done: 0,
    missed: 0,
    not_found: 0,
    reported: 0,
    remaining: 0,
    completion_rate: 0,
  };
}

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.read");
  if (forbidden) return forbidden;

  try {
    const village = String(request.nextUrl.searchParams.get("village") ?? "").trim();
    const payload = await gasClient.mohwProgress.summary(
      village ? { village_name: village } : undefined,
    );
    const villages = (payload.villages ?? []).map((row) =>
      mapMohwProgressVillageSummary(row as Record<string, unknown>),
    );
    const rawTotals = (payload.totals ?? {}) as Record<string, number>;
    const totals: MohwProgressSummaryTotals = {
      ...emptyTotals(),
      ...mapMohwProgressVillageSummary({
        village_name: "",
        ...rawTotals,
      }),
    };
    // map helper sets village_name; strip for totals shape
    const data: MohwProgressSummaryPayload = {
      villages,
      totals: {
        roster_total: totals.roster_total,
        platform_keyed: totals.platform_keyed,
        direct_done: totals.direct_done,
        direct_missed: totals.direct_missed,
        direct_not_found: totals.direct_not_found,
        direct_unset: totals.direct_unset,
        done: totals.done,
        missed: totals.missed,
        not_found: totals.not_found,
        reported: totals.reported,
        remaining: totals.remaining,
        completion_rate: totals.completion_rate,
      },
    };
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入衛福部進度儀表板";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
