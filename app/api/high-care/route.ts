import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasClient } from "@/lib/gas-client";
import { highCareDemoRecords, summarizeHighCareRecords } from "@/lib/domain/high-care-demo";
import { HIGH_CARE_STATUSES, type HighCareStatus } from "@/lib/domain/high-care-rules";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "visits.read");
  if (forbidden) return forbidden;

  const color = request.nextUrl.searchParams.get("color") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "";
  const system = getSystemStatus();

  if (system.dataMode === "gas_ready") {
    try {
      const [items, stats] = await Promise.all([
        gasClient.highCare.list({ color: color || undefined, status: status || undefined }),
        gasClient.highCare.stats(),
      ]);
      return NextResponse.json({ data: { items, stats, source: "gas" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "高關懷名冊讀取失敗";
      return NextResponse.json({ error: { code: "GAS_HIGH_CARE_FAILED", message } }, { status: 502 });
    }
  }

  const items = highCareDemoRecords.filter((row) => {
    if (color && !row.colors.includes(color)) return false;
    if (status && row.status !== status) return false;
    return true;
  });

  return NextResponse.json({
    data: {
      items,
      stats: summarizeHighCareRecords(items),
      source: "demo",
    },
  });
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "audit.run");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    high_care_id?: string;
    status?: HighCareStatus;
    owner?: string;
    note?: string;
  };

  if (!body.high_care_id) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "缺少 high_care_id" } }, { status: 400 });
  }
  if (body.status && !HIGH_CARE_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "狀態不正確" } }, { status: 400 });
  }

  const system = getSystemStatus();
  if (system.dataMode === "gas_ready") {
    try {
      const record = await gasClient.highCare.update({
        high_care_id: body.high_care_id,
        status: body.status,
        owner: body.owner,
        note: body.note,
      });
      return NextResponse.json({ data: { record, source: "gas" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "高關懷更新失敗";
      return NextResponse.json({ error: { code: "GAS_HIGH_CARE_FAILED", message } }, { status: 502 });
    }
  }

  const record = highCareDemoRecords.find((item) => item.high_care_id === body.high_care_id);
  if (!record) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "找不到高關懷列" } }, { status: 404 });
  }
  if (body.status) record.status = body.status;
  if (body.owner !== undefined) record.owner = body.owner;
  if (body.note !== undefined) record.note = body.note;
  record.updated_at = new Date().toISOString();

  return NextResponse.json({ data: { record, source: "demo" } });
}
