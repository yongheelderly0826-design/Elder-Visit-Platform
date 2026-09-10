import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { utils, write } from "xlsx";
import { requireManagerAnyCapability } from "@/lib/api/authorization";
import { getDailyVisitReport } from "@/lib/daily-visit-report-service";
import {
  DAILY_VISIT_EXPORT_HEADERS,
  dailyVisitExportRow,
  isValidDailyVisitDate,
} from "@/lib/domain/daily-visit-report";
import { taipeiToday } from "@/lib/domain/volunteer-attendance";

const VISITOR_ID_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

function safeFilenamePart(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 60) || "訪員";
}

export async function GET(request: NextRequest) {
  const forbidden = requireManagerAnyCapability(request, [
    "exports.create",
    "attendance.manage",
  ]);
  if (forbidden) return forbidden;

  const date = request.nextUrl.searchParams.get("date") || taipeiToday();
  const visitorId = request.nextUrl.searchParams.get("visitorId")?.trim() ?? "";
  if (!isValidDailyVisitDate(date)) {
    return NextResponse.json(
      { error: { code: "INVALID_DATE", message: "日期格式錯誤，請使用有效的 YYYY-MM-DD 日期。" } },
      { status: 400 },
    );
  }
  if (!VISITOR_ID_PATTERN.test(visitorId)) {
    return NextResponse.json(
      { error: { code: "INVALID_VISITOR_ID", message: "訪員編號格式錯誤。" } },
      { status: 400 },
    );
  }

  try {
    const report = await getDailyVisitReport(date);
    const visitor = report.visitors.find((item) => item.visitorId === visitorId);
    if (!visitor) {
      return NextResponse.json(
        { error: { code: "VISITOR_NOT_FOUND", message: "所選日期找不到此訪員的派案資料。" } },
        { status: 404 },
      );
    }

    const sheet = utils.aoa_to_sheet([
      [...DAILY_VISIT_EXPORT_HEADERS],
      ...visitor.details.map((detail) => dailyVisitExportRow(date, visitor, detail)),
    ]);
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 18 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 10 },
      { wch: 42 },
      { wch: 16 },
      { wch: 14 },
      { wch: 22 },
    ];
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, "每日訪視");
    const buffer = write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `每日訪視_${date}_${safeFilenamePart(visitor.visitorName)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="daily-visits_${date}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "匯出每日訪視 Excel 失敗";
    return NextResponse.json(
      { error: { code: "DAILY_VISIT_EXPORT_FAILED", message } },
      { status: 502 },
    );
  }
}
