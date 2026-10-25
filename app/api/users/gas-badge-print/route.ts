import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { listGasBadgePrintVisitors } from "@/lib/domain/list-gas-badge-print-visitors";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "users.review");
  if (forbidden) return forbidden;

  const visitorIdsParam = request.nextUrl.searchParams.get("visitorIds") ?? "";
  const visitorIds = visitorIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  try {
    const visitors = await listGasBadgePrintVisitors(
      visitorIds.length > 0 ? { visitorIds } : undefined,
    );
    return NextResponse.json({
      data: {
        count: visitors.length,
        withPhoto: visitors.filter((row) => row.hasPhoto).length,
        visitors,
      },
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error: {
          code: "GAS_BADGE_LIST_FAILED",
          message: cause instanceof Error ? cause.message : "無法讀取 GAS 訪員名冊。",
        },
      },
      { status: 500 },
    );
  }
}
