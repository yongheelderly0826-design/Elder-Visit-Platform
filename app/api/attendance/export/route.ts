import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { utils, write } from "xlsx";
import { requireCapability } from "@/lib/api/authorization";
import { gasErrorResponse } from "@/lib/attendance/session";
import { mapGasAttendanceRecord } from "@/lib/domain/gas-attendance";
import { mockListAttendance } from "@/lib/domain/volunteer-attendance-mock";
import {
  ATTENDANCE_EXPORT_HEADERS,
  attendanceExportRow,
  currentAttendancePeriod,
  type AttendanceRecord,
} from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "attendance.manage");
  if (forbidden) return forbidden;

  const period = request.nextUrl.searchParams.get("period") || currentAttendancePeriod();

  try {
    let items: AttendanceRecord[] = [];
    let fileUrl = "";

    if (getSystemStatus().dataMode === "gas_ready") {
      const rows = await gasClient.attendance.list({ period });
      items = rows.map(mapGasAttendanceRecord).filter((row): row is AttendanceRecord => Boolean(row));
      try {
        const exported = await gasClient.attendance.monthlyExport({ period });
        fileUrl = String(exported.file_url ?? "");
      } catch {
        fileUrl = "";
      }
    } else {
      items = mockListAttendance(period);
    }

    const sheet = utils.aoa_to_sheet([
      [...ATTENDANCE_EXPORT_HEADERS],
      ...items.map((row) => attendanceExportRow(period, row)),
    ]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, "出勤");
    const buffer = write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `志工出勤_${period}.xlsx`;

    if (request.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json({
        data: {
          period,
          filename,
          fileUrl,
          total: items.length,
        },
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "X-Attendance-Drive-Url": fileUrl,
      },
    });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "匯出出勤失敗");
  }
}
