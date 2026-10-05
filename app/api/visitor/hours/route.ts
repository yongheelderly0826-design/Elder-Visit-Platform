import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasErrorResponse } from "@/lib/attendance/session";
import { mapGasAttendanceRecord } from "@/lib/domain/gas-attendance";
import { mockListAttendance } from "@/lib/domain/volunteer-attendance-mock";
import { resolveVisitorIdentity } from "@/lib/domain/demo-visitor-link";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import {
  cachedRead,
  GAS_READ_CACHE_SECONDS_FAST,
  GAS_READ_TAGS,
} from "@/lib/gas-read-cache";
import { getSystemStatus } from "@/lib/system/env";

function periodQuarter(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "2026");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const roc = year - 1911;
  const q = Math.floor((month - 1) / 3) + 1;
  return `${roc}-Q${q}`;
}

function periodMonth(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .slice(0, 7);
}

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const email = request.cookies.get("demo_email")?.value?.toLowerCase() ?? "";
  const { visitorId, name } = resolveVisitorIdentity({
    visitorId: request.cookies.get(VOLUNTEER_CLOCK_COOKIE)?.value,
    email,
    name: request.cookies.get("demo_name")?.value,
  });
  if (!visitorId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "找不到訪員編號" } },
      { status: 400 },
    );
  }

  const period = request.nextUrl.searchParams.get("period")?.trim() || periodMonth();
  const quarter = periodQuarter();

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      // 3s 快取：切分頁加快；簽到退後會 invalidate visitorHours
      const payload = await cachedRead(
        ["visitor-hours", visitorId, period, quarter],
        [GAS_READ_TAGS.visitorHours],
        async () => {
          const [allRows, transport] = await Promise.all([
            gasClient.attendance.list({
              visitor_id: visitorId,
            }),
            gasClient.payments
              .calculate({ visitor_id: visitorId, period: quarter, group: "elder_care" })
              .catch(() => null),
          ]);

          const records = (allRows || [])
            .map((row) => mapGasAttendanceRecord(row))
            .filter((row): row is NonNullable<typeof row> => Boolean(row))
            .sort((a, b) =>
              String(b.checkinAt || b.sessionDate).localeCompare(String(a.checkinAt || a.sessionDate)),
            );

          const monthRecords = records.filter((row) => String(row.sessionDate || "").startsWith(period));
          const visitMinutes = monthRecords
            .filter((row) => row.sessionType === "訪查")
            .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
          const volunteerMinutes = monthRecords
            .filter((row) => row.sessionType !== "訪查")
            .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);

          return {
            mode: "gas" as const,
            visitorId,
            visitorName: name,
            period,
            quarter,
            records,
            summary: {
              visitMinutes,
              volunteerMinutes,
              totalMinutes: visitMinutes + volunteerMinutes,
              visitHours: (visitMinutes / 60).toFixed(1),
              volunteerHours: (volunteerMinutes / 60).toFixed(1),
            },
            transportEstimate: transport,
          };
        },
        GAS_READ_CACHE_SECONDS_FAST,
      );

      return NextResponse.json({ data: payload });
    }

    const records = mockListAttendance(period).filter((row) => row.visitorId === visitorId);
    const visitMinutes = records
      .filter((row) => row.sessionType === "訪查")
      .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
    const volunteerMinutes = records
      .filter((row) => row.sessionType !== "訪查")
      .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);

    return NextResponse.json({
      data: {
        mode: "demo",
        visitorId,
        visitorName: name,
        period,
        quarter,
        records,
        summary: {
          visitMinutes,
          volunteerMinutes,
          totalMinutes: visitMinutes + volunteerMinutes,
          visitHours: (visitMinutes / 60).toFixed(1),
          volunteerHours: (volunteerMinutes / 60).toFixed(1),
        },
        transportEstimate: {
          note: "示範模式：正式環境依志工組別季結／年結規則試算車馬費",
          period: quarter,
          group: "獨居關懷組",
        },
      },
    });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "讀取時數失敗");
  }
}
