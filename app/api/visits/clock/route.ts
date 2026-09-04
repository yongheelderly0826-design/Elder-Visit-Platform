import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasErrorResponse } from "@/lib/attendance/session";
import { mapGasAttendanceRecord, mapGasClockStatus } from "@/lib/domain/gas-attendance";
import {
  mockClockAttendance,
  mockVisitClockStatus,
} from "@/lib/domain/volunteer-attendance-mock";
import {
  VISIT_SESSION_TYPE,
  VISIT_SITE_ID,
  type AttendanceRecord,
} from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

function taipeiHm(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function payloadFromRecords(open: AttendanceRecord | null, latest: AttendanceRecord | null) {
  const record = open ?? latest;
  return {
    open,
    latest,
    checkedIn: Boolean(open),
    completed: Boolean(latest?.checkoutAt),
    visitDate: record?.sessionDate ?? "",
    visitStartTime: record?.checkinAt ? taipeiHm(record.checkinAt) : "",
    visitEndTime: record?.checkoutAt ? taipeiHm(record.checkoutAt) : "",
  };
}

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "visits.submit");
  if (forbidden) {
    const manage = requireCapability(request, "attendance.manage");
    if (manage) return forbidden;
  }

  const assignmentId = request.nextUrl.searchParams.get("assignmentId")?.trim() ?? "";
  if (!assignmentId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "缺少派案編號" } },
      { status: 400 },
    );
  }

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const status = await gasClient.attendance.status({
        assignment_id: assignmentId,
        session_type: VISIT_SESSION_TYPE,
      });
      const mapped = mapGasClockStatus({
        visitor: (status.visitor as Record<string, unknown>) ?? status,
        today: String(status.today ?? ""),
        open: status.open as Record<string, unknown> | null,
      });
      const latest = mapGasAttendanceRecord(status.latest as Record<string, unknown> | undefined);
      return NextResponse.json({
        data: {
          mode: "gas",
          sessionType: VISIT_SESSION_TYPE,
          visitor: mapped.visitor,
          today: mapped.today,
          ...payloadFromRecords(mapped.open, latest),
        },
      });
    }

    const demo = mockVisitClockStatus(assignmentId);
    return NextResponse.json({
      data: {
        mode: "demo",
        sessionType: VISIT_SESSION_TYPE,
        visitor: demo.visitor,
        today: demo.today,
        ...payloadFromRecords(demo.open, demo.latest),
      },
    });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "讀取訪查簽到狀態失敗");
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "visits.submit");
  if (forbidden) {
    const manage = requireCapability(request, "attendance.manage");
    if (manage) return forbidden;
  }

  const body = (await request.json()) as {
    assignmentId?: string;
    visitorId?: string;
    lat?: string | number | null;
    lng?: string | number | null;
  };

  const assignmentId = String(body.assignmentId ?? "").trim();
  if (!assignmentId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "缺少派案編號" } },
      { status: 400 },
    );
  }

  const lat = body.lat == null || body.lat === "" ? undefined : String(body.lat);
  const lng = body.lng == null || body.lng === "" ? undefined : String(body.lng);

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const result = await gasClient.attendance.clock({
        assignment_id: assignmentId,
        visitor_id: body.visitorId || undefined,
        session_type: VISIT_SESSION_TYPE,
        site_id: VISIT_SITE_ID,
        channel: "gps",
        source: "visit",
        lat,
        lng,
      });
      const visitor = mapGasClockStatus({
        visitor: (result.visitor as Record<string, unknown> | undefined) ?? result,
        today: "",
        open: null,
      }).visitor;
      const record = mapGasAttendanceRecord(result.record as Record<string, unknown>);
      const action = result.action === "checkout" ? "checkout" : "checkin";
      return NextResponse.json({
        data: {
          mode: "gas",
          action,
          record,
          visitor,
          visitDate: record?.sessionDate ?? "",
          visitStartTime: record?.checkinAt ? taipeiHm(record.checkinAt) : "",
          visitEndTime: record?.checkoutAt ? taipeiHm(record.checkoutAt) : "",
        },
      });
    }

    const result = mockClockAttendance({
      visitorId: body.visitorId || "V-YH-MEAL01",
      assignmentId,
      sessionType: VISIT_SESSION_TYPE,
      siteId: VISIT_SITE_ID,
      channel: "gps",
      source: "visit",
      lat,
      lng,
    });
    return NextResponse.json({
      data: {
        mode: "demo",
        ...result,
        visitDate: result.record.sessionDate,
        visitStartTime: result.record.checkinAt ? taipeiHm(result.record.checkinAt) : "",
        visitEndTime: result.record.checkoutAt ? taipeiHm(result.record.checkoutAt) : "",
      },
    });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "訪查簽到退失敗");
  }
}
