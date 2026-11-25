import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { gasClient } from "@/lib/gas-client";

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "payments.read");
  if (forbidden) return forbidden;

  try {
    const data = await gasClient.workerFeeStats.listParams();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "list fee params failed";
    return NextResponse.json({ ok: false, error: { message } }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "payments.read");
  if (forbidden) return forbidden;

  try {
    const body = (await request.json()) as {
      patches?: Array<{ key: string; value: string }>;
      updated_by?: string;
    };
    const patches = Array.isArray(body.patches) ? body.patches : [];
    if (!patches.length) {
      return NextResponse.json(
        { ok: false, error: { message: "patches required" } },
        { status: 400 },
      );
    }
    const cleaned = patches
      .map((p) => ({
        key: String(p.key || "").trim(),
        value: String(p.value ?? "").trim(),
      }))
      .filter((p) => p.key);

    const data = await gasClient.workerFeeStats.upsertParams({
      patches: cleaned,
      updated_by: String(body.updated_by || "manager-ui").trim() || "manager-ui",
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upsert fee params failed";
    return NextResponse.json({ ok: false, error: { message } }, { status: 502 });
  }
}
