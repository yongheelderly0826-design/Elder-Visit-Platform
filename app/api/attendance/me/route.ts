import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearVolunteerClockCookie, gasErrorResponse } from "@/lib/attendance/session";
import { mockAttendanceStatus } from "@/lib/domain/volunteer-attendance-mock";
import { mapGasClockStatus } from "@/lib/domain/gas-attendance";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const visitorId = request.cookies.get(VOLUNTEER_CLOCK_COOKIE)?.value;
  if (!visitorId) {
    return NextResponse.json({ data: { mode: "anonymous", visitor: null, open: null } });
  }

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const payload = await gasClient.attendance.status({ visitor_id: visitorId });
      return NextResponse.json({ data: { mode: "gas", ...mapGasClockStatus(payload) } });
    }
    return NextResponse.json({
      data: { mode: "demo", ...mockAttendanceStatus({ visitorId }) },
    });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "讀取出勤狀態失敗");
  }
}

export async function DELETE() {
  const response = NextResponse.json({ data: { ok: true } });
  return clearVolunteerClockCookie(response);
}
