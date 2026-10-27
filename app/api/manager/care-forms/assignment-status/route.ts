import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
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
    const missing: string[] = [];
    const present: string[] = [];
    for (const assignmentId of assignmentIds) {
      const row = (await gasClient.assignments.get(assignmentId)) as {
        assignment_id?: string;
      } | null;
      const exists = Boolean(row && String(row.assignment_id ?? "").trim() === assignmentId);
      if (exists) present.push(assignmentId);
      else missing.push(assignmentId);
    }
    const exists = missing.length === 0;
    return NextResponse.json({
      data: {
        exists,
        assignmentId: assignmentIds[0],
        assignmentIds,
        missing,
        present,
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
