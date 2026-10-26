import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasErrorResponse } from "@/lib/attendance/session";
import {
  DESK_BATCH_SLOT_MINUTES,
  addMinutesToTime,
} from "@/lib/domain/desk-care-batch";
import { mapGasAttendanceRecord, mapGasClockStatus } from "@/lib/domain/gas-attendance";
import { formatRocDate } from "@/lib/domain/mohw-life-care-export";
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
import { invalidateVisitorAttendanceCaches } from "@/lib/gas-read-cache";
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

/** 到宅簽到後：關懷表用民國日＋簽到；尚未簽退時簽退預設＝簽到＋10 分（與建檔時段一致）。 */
function visitTimesFromRecord(record: AttendanceRecord | null | undefined) {
  if (!record?.checkinAt) {
    return { visitDate: "", visitStartTime: "", visitEndTime: "" };
  }
  const visitStartTime = taipeiHm(record.checkinAt);
  const visitEndTime = record.checkoutAt
    ? taipeiHm(record.checkoutAt)
    : addMinutesToTime(visitStartTime, DESK_BATCH_SLOT_MINUTES) || visitStartTime;
  const roc = formatRocDate(record.sessionDate || record.checkinAt);
  const visitDate =
    roc && roc !== "INVALID_DATE" && /^\d{3}\/\d{2}\/\d{2}$/.test(roc)
      ? roc
      : record.sessionDate || "";
  return { visitDate, visitStartTime, visitEndTime };
}

function payloadFromRecords(open: AttendanceRecord | null, latest: AttendanceRecord | null) {
  const record = open ?? latest;
  const times = visitTimesFromRecord(record);
  return {
    open,
    latest,
    checkedIn: Boolean(open),
    completed: Boolean(latest?.checkoutAt),
    visitDate: times.visitDate,
    visitStartTime: times.visitStartTime,
    visitEndTime: times.visitEndTime,
    checkinPhotoUrl: record?.checkinPhotoUrl ?? "",
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
    doorplatePhoto?: string | null;
    checkinPhotoBase64?: string | null;
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
  const doorplatePhoto = String(body.doorplatePhoto || body.checkinPhotoBase64 || "").trim();

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      // Probe open session so checkout skips photo; check-in photo is optional helper.
      const status = await gasClient.attendance.status({
        assignment_id: assignmentId,
        session_type: VISIT_SESSION_TYPE,
      });
      const open = status.open as Record<string, unknown> | null | undefined;

      const result = await gasClient.attendance.clock({
        assignment_id: assignmentId,
        visitor_id: body.visitorId || undefined,
        session_type: VISIT_SESSION_TYPE,
        site_id: VISIT_SITE_ID,
        channel: "gps",
        source: "visit",
        lat,
        lng,
        checkin_photo_base64: open ? undefined : doorplatePhoto || undefined,
      });
      const visitor = mapGasClockStatus({
        visitor: (result.visitor as Record<string, unknown> | undefined) ?? result,
        today: "",
        open: null,
      }).visitor;
      const record = mapGasAttendanceRecord(result.record as Record<string, unknown>);
      const action = result.action === "checkout" ? "checkout" : "checkin";
      const times = visitTimesFromRecord(record);
      invalidateVisitorAttendanceCaches();
      return NextResponse.json({
        data: {
          mode: "gas",
          action,
          record,
          visitor,
          visitDate: times.visitDate,
          visitStartTime: times.visitStartTime,
          visitEndTime: times.visitEndTime,
          checkinPhotoUrl: record?.checkinPhotoUrl ?? "",
        },
      });
    }

    const result = mockClockAttendance({
      visitorId: body.visitorId || "V-YH-834059",
      assignmentId,
      sessionType: VISIT_SESSION_TYPE,
      siteId: VISIT_SITE_ID,
      channel: "gps",
      source: "visit",
      lat,
      lng,
      checkinPhotoBase64: doorplatePhoto || undefined,
    });
    const times = visitTimesFromRecord(result.record);
    return NextResponse.json({
      data: {
        mode: "demo",
        ...result,
        visitDate: times.visitDate,
        visitStartTime: times.visitStartTime,
        visitEndTime: times.visitEndTime,
        checkinPhotoUrl: result.record.checkinPhotoUrl ?? "",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "訪查簽到退失敗";
    return gasErrorResponse(error instanceof GasApiError ? error : error, "訪查簽到退失敗");
  }
}
