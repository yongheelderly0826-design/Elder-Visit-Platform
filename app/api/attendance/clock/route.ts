import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { gasErrorResponse } from "@/lib/attendance/session";
import { mapGasClockStatus, mapGasAttendanceRecord } from "@/lib/domain/gas-attendance";
import { mockClockAttendance } from "@/lib/domain/volunteer-attendance-mock";
import {
  OFFICE_KIOSK_SITE_ID,
  VOLUNTEER_CLOCK_COOKIE,
  extractTaiwanId,
  getAttendanceSite,
} from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    idNumber?: string;
    id_number?: string;
    siteId?: string;
    site_id?: string;
    channel?: string;
    source?: string;
    lat?: string;
    lng?: string;
  };

  const kioskIdNumber = extractTaiwanId(body.idNumber ?? body.id_number ?? "");
  const cookieVisitorId = request.cookies.get(VOLUNTEER_CLOCK_COOKIE)?.value ?? "";

  if (kioskIdNumber) {
    const role = request.cookies.get("demo_role")?.value;
    const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!role && !manager) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "請先以承辦帳號登入後再刷證" } },
        { status: 401 },
      );
    }
    const forbidden = requireCapability(request, "attendance.manage");
    if (forbidden) return forbidden;
  } else if (!cookieVisitorId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "請先登入或刷身分證確認身分" } },
      { status: 401 },
    );
  }

  const isKiosk = Boolean(kioskIdNumber);

  const siteId = (body.siteId ?? body.site_id ?? (isKiosk ? OFFICE_KIOSK_SITE_ID : "")).trim();
  if (!isKiosk && !getAttendanceSite(siteId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "請先掃描組別 QR 或確認地點代碼" } },
      { status: 400 },
    );
  }

  const payload = {
    visitor_id: isKiosk ? undefined : cookieVisitorId,
    id_number: isKiosk ? kioskIdNumber : undefined,
    site_id: siteId || (isKiosk ? OFFICE_KIOSK_SITE_ID : undefined),
    channel: body.channel || (isKiosk ? "barcode" : "qr"),
    source: body.source || (isKiosk ? "office_kiosk" : "field_qr"),
    lat: body.lat,
    lng: body.lng,
  };

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const result = await gasClient.attendance.clock(payload);
      const visitor = mapGasClockStatus({
        visitor: (result.visitor as Record<string, unknown> | undefined) ?? result,
        today: "",
        open: null,
      }).visitor;
      return NextResponse.json({
        data: {
          mode: "gas",
          action: result.action === "checkout" ? "checkout" : "checkin",
          record: mapGasAttendanceRecord(result.record as Record<string, unknown>),
          visitor,
        },
      });
    }

    const result = mockClockAttendance({
      visitorId: payload.visitor_id,
      idNumber: payload.id_number,
      siteId: payload.site_id,
      channel: payload.channel,
      source: payload.source,
      lat: payload.lat,
      lng: payload.lng,
    });
    return NextResponse.json({ data: { mode: "demo", ...result } });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "簽到退失敗");
  }
}
