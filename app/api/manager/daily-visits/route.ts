import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { getDailyVisitReport } from "@/lib/daily-visit-report-service";
import { isValidDailyVisitDate } from "@/lib/domain/daily-visit-report";
import { taipeiToday } from "@/lib/domain/volunteer-attendance";
import { GasApiError } from "@/lib/gas-client";

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.read");
  if (forbidden) return forbidden;

  const date = request.nextUrl.searchParams.get("date") || taipeiToday();
  if (!isValidDailyVisitDate(date)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_DATE",
          message: "日期格式錯誤，請使用有效的 YYYY-MM-DD 日期。",
        },
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ data: await getDailyVisitReport(date) });
  } catch (error) {
    const message =
      error instanceof GasApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "讀取每日訪視工作統計失敗";
    return NextResponse.json(
      { error: { code: "DAILY_VISIT_REPORT_FAILED", message } },
      { status: 502 },
    );
  }
}
