import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasErrorResponse } from "@/lib/attendance/session";
import { mapGasAttendanceRecord } from "@/lib/domain/gas-attendance";
import { mockListAttendance } from "@/lib/domain/volunteer-attendance-mock";
import { currentAttendancePeriod } from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "attendance.manage");
  if (forbidden) return forbidden;

  const period = request.nextUrl.searchParams.get("period") || currentAttendancePeriod();

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const rows = await gasClient.attendance.list({ period });
      const items = rows
        .map(mapGasAttendanceRecord)
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      return NextResponse.json({
        data: { mode: "gas", period, total: items.length, items },
      });
    }

    const items = mockListAttendance(period);
    return NextResponse.json({
      data: { mode: "demo", period, total: items.length, items },
    });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "讀取出勤紀錄失敗");
  }
}
