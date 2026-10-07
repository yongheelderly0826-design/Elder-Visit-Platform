import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/api/authorization";
import { GasApiError } from "@/lib/gas-client";
import { getInProgressVisitBoard } from "@/lib/in-progress-visit-board-service";

export async function GET(request: NextRequest) {
  const forbidden = requireAnyCapability(request, [
    "dashboard.read",
    "cases.read",
    "assignment.manage",
    "assignment.confirm",
    "audit.run",
    "audit.approve",
    "audit.reject",
  ]);
  if (forbidden) return forbidden;

  const fresh = request.nextUrl.searchParams.get("fresh") === "1";

  try {
    const data = await getInProgressVisitBoard({ fresh });
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof GasApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "讀取訪視中分層統計失敗";
    return NextResponse.json(
      { error: { code: "IN_PROGRESS_VISITS_FAILED", message } },
      { status: 502 },
    );
  }
}
