import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireCapability } from "@/lib/api/authorization";
import { gasErrorResponse } from "@/lib/attendance/session";
import { mapGasClockStatus } from "@/lib/domain/gas-attendance";
import {
  buildVolunteerBadgePayload,
  buildVolunteerBadgeUrl,
} from "@/lib/domain/volunteer-badge-qr";
import { mockAttendanceStatus } from "@/lib/domain/volunteer-attendance-mock";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const visitorIdParam = request.nextUrl.searchParams.get("visitorId")?.trim() ?? "";
  const cookieVisitorId = request.cookies.get(VOLUNTEER_CLOCK_COOKIE)?.value ?? "";
  let visitorId = visitorIdParam;

  if (visitorIdParam) {
    if (!(cookieVisitorId && cookieVisitorId === visitorIdParam)) {
      const forbidden = requireCapability(request, "attendance.manage");
      if (forbidden) return forbidden;
    }
  } else {
    visitorId = cookieVisitorId;
    if (!visitorId) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "請先以身分證登入出勤，或由承辦指定志工" } },
        { status: 401 },
      );
    }
  }

  try {
    let name = "";
    let groupName = "";
    let badgeNo = "";

    if (getSystemStatus().dataMode === "gas_ready") {
      const status = await gasClient.attendance.status({ visitor_id: visitorId });
      const mapped = mapGasClockStatus({
        visitor: (status.visitor as Record<string, unknown>) ?? status,
        today: String(status.today ?? ""),
        open: null,
      });
      name = mapped.visitor.name;
      groupName = mapped.visitor.groupName;
      badgeNo = mapped.visitor.badgeNo;
      visitorId = mapped.visitor.visitorId || visitorId;
    } else {
      const demo = mockAttendanceStatus({ visitorId });
      name = demo.visitor.name;
      groupName = demo.visitor.groupName;
      badgeNo = demo.visitor.badgeNo;
      visitorId = demo.visitor.visitorId;
    }

    const origin = request.nextUrl.origin;
    const payload = buildVolunteerBadgePayload(visitorId);
    const badgeUrl = buildVolunteerBadgeUrl(origin, visitorId);
    const qrUrl = await QRCode.toDataURL(payload, { width: 480, margin: 1 });

    return NextResponse.json({
      data: {
        visitorId,
        name,
        groupName,
        badgeNo,
        payload,
        badgeUrl,
        qrUrl,
      },
    });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "產生個人 QR 失敗");
  }
}
