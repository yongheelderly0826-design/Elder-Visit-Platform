import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import {
  CASE_PROGRESS_BUCKET_LABELS,
  type CaseProgressBucketListPayload,
  type CaseProgressBuckets,
  type CaseProgressSample,
} from "@/lib/domain/case-progress";
import { gasClient } from "@/lib/gas-client";

const BUCKET_KEYS = Object.keys(CASE_PROGRESS_BUCKET_LABELS) as Array<keyof CaseProgressBuckets>;

function asNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapRow(raw: Record<string, unknown>): CaseProgressSample {
  const name = String(raw.name ?? "").trim();
  const nationalId = String(raw.national_id ?? "").trim();
  const nameMasked = String(raw.name_masked ?? "—");
  const idMasked = String(raw.id_masked ?? "—");
  return {
    case_id: String(raw.case_id ?? ""),
    seq: Number(raw.seq) || 0,
    name,
    national_id: nationalId,
    name_masked: nameMasked,
    id_masked: idMasked,
    village: String(raw.village ?? ""),
    visit_status: String(raw.visit_status ?? ""),
    has_careform: Boolean(raw.has_careform),
    has_direct_mark: Boolean(raw.has_direct_mark),
    mark_outcome: String(raw.mark_outcome ?? ""),
    roster_status: String(raw.roster_status ?? ""),
    civil_worker_name: String(raw.civil_worker_name ?? ""),
    social_worker_name: String(raw.social_worker_name ?? ""),
    builder_name: String(raw.builder_name ?? ""),
    channel: String(raw.channel ?? ""),
  };
}

function mapPayload(raw: Record<string, unknown>): CaseProgressBucketListPayload {
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map((row) => mapRow((row ?? {}) as Record<string, unknown>))
    : [];
  return {
    bucket: String(raw.bucket ?? ""),
    page: asNumber(raw.page, 1),
    page_size: asNumber(raw.page_size, 50),
    total: asNumber(raw.total),
    total_pages: asNumber(raw.total_pages),
    village_filter: (raw.village_filter as string | null | undefined) ?? null,
    index_ready: raw.index_ready === undefined ? true : Boolean(raw.index_ready),
    rows,
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
  };
}

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.read");
  if (forbidden) return forbidden;

  const bucket = String(request.nextUrl.searchParams.get("bucket") ?? "").trim();
  if (!BUCKET_KEYS.includes(bucket as keyof CaseProgressBuckets)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: `未知分桶：${bucket || "（空白）"}` } },
      { status: 400 },
    );
  }

  const page = String(request.nextUrl.searchParams.get("page") ?? "1").trim() || "1";
  const pageSizeRaw = String(request.nextUrl.searchParams.get("page_size") ?? "50").trim() || "50";
  const pageSizeNum = Math.min(Math.max(Number(pageSizeRaw) || 50, 1), 100);
  const village = String(request.nextUrl.searchParams.get("village") ?? "").trim();

  try {
    const raw = await gasClient.caseProgress.listBucket({
      bucket,
      page,
      page_size: String(pageSizeNum),
      ...(village ? { village } : {}),
    });
    return NextResponse.json({ data: mapPayload(raw as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入分桶名單";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
