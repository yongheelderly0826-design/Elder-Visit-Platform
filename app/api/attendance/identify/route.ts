import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { gasErrorResponse, setVolunteerClockCookie } from "@/lib/attendance/session";
import { mockIdentifyVolunteer } from "@/lib/domain/volunteer-attendance-mock";
import { mapGasClockStatus } from "@/lib/domain/gas-attendance";
import { extractTaiwanId } from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { idNumber?: string; id_number?: string };
  const idNumber = extractTaiwanId(body.idNumber ?? body.id_number ?? "");
  if (!idNumber) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "請刷入或輸入身分證字號" } },
      { status: 400 },
    );
  }

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const payload = await gasClient.attendance.identify({ id_number: idNumber });
      const status = mapGasClockStatus(payload);
      const response = NextResponse.json({ data: { mode: "gas", ...status } });
      return setVolunteerClockCookie(response, status.visitor.visitorId);
    }

    const status = mockIdentifyVolunteer(idNumber);
    const response = NextResponse.json({ data: { mode: "demo", ...status } });
    return setVolunteerClockCookie(response, status.visitor.visitorId);
  } catch (error) {
    return gasErrorResponse(
      error instanceof GasApiError ? error : error,
      "身分確認失敗",
    );
  }
}
