import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { DESK_BATCH_STATUS_RETRY_MS } from "@/lib/domain/desk-care-batch";
import { gasClient } from "@/lib/gas-client";

function collectAssignmentIds(request: NextRequest): string[] {
  const single = String(request.nextUrl.searchParams.get("assignmentId") ?? "").trim();
  const many = String(request.nextUrl.searchParams.get("assignmentIds") ?? "").trim();
  const fromList = many
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const ids = [...(single ? [single] : []), ...fromList];
  return [...new Set(ids)];
}

async function probeOne(assignmentId: string): Promise<boolean> {
  const row = (await gasClient.assignments.get(assignmentId)) as {
    assignment_id?: string;
  } | null;
  return Boolean(row && String(row.assignment_id ?? "").trim() === assignmentId);
}

async function classifyIds(assignmentIds: string[]) {
  const missing: string[] = [];
  const present: string[] = [];
  for (const assignmentId of assignmentIds) {
    if (await probeOne(assignmentId)) present.push(assignmentId);
    else missing.push(assignmentId);
  }
  return { missing, present };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lightweight check: do these assignment rows still exist on Sheets? */
export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const assignmentIds = collectAssignmentIds(request);
  if (!assignmentIds.length) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "缺少派案編號。" } },
      { status: 400 },
    );
  }

  try {
    let { missing, present } = await classifyIds(assignmentIds);

    // Sheets／GAS 剛 append 後偶發讀不到：缺列再查一次，避免誤清品牌新佇列。
    if (missing.length) {
      await sleep(DESK_BATCH_STATUS_RETRY_MS);
      const retry = await classifyIds(missing);
      missing = retry.missing;
      present = [...new Set([...present, ...retry.present])];
    }

    const exists = missing.length === 0;
    return NextResponse.json({
      data: {
        exists,
        assignmentId: assignmentIds[0],
        assignmentIds,
        missing,
        present,
        retried: true,
      },
    });
  } catch {
    // Network / GAS blip: do not treat as missing (avoid wiping a live queue).
    return NextResponse.json({
      data: {
        exists: true,
        assignmentId: assignmentIds[0],
        assignmentIds,
        missing: [] as string[],
        present: assignmentIds,
        uncertain: true,
      },
    });
  }
}
