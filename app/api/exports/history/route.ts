import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { GasApiError, gasClient, isGasConfigured } from "@/lib/gas-client";
import { cachedRead, GAS_READ_TAGS } from "@/lib/gas-read-cache";
import { getSystemStatus } from "@/lib/system/env";

export const maxDuration = 60;

export type ExportHistoryItem = {
  exportId: string;
  exportType: string;
  caseCount: number;
  fileName: string;
  fileId: string;
  fileUrl: string;
  columnCount: number;
  skippedCount: number;
  exportedBy: string;
  exportedAt: string;
};

function mapItem(raw: Record<string, unknown>): ExportHistoryItem {
  return {
    exportId: String(raw.export_id ?? ""),
    exportType: String(raw.export_type ?? ""),
    caseCount: Number(raw.case_count) || 0,
    fileName: String(raw.file_name ?? ""),
    fileId: String(raw.file_id ?? ""),
    fileUrl: String(raw.file_url ?? ""),
    columnCount: Number(raw.column_count) || 0,
    skippedCount: Number(raw.skipped_count) || 0,
    exportedBy: String(raw.exported_by ?? ""),
    exportedAt: String(raw.exported_at ?? ""),
  };
}

function demoHistory() {
  const now = new Date().toISOString();
  const items: ExportHistoryItem[] = [
    {
      exportId: "EXP-20261006-221500",
      exportType: "mohw_life_care",
      caseCount: 6,
      fileName: "生活關懷表_EXP_20261006-221500.xlsx",
      fileId: "",
      fileUrl: "",
      columnCount: 103,
      skippedCount: 0,
      exportedBy: "demo@eldervisit.org",
      exportedAt: now,
    },
  ];
  return {
    mode: "demo" as const,
    items,
    summary: {
      totalExports: 1,
      totalCases: 6,
      mohwExports: 1,
      mohwCases: 6,
      lastExportedAt: now,
    },
    note: "目前非 GAS 模式，顯示示範匯出紀錄。",
  };
}

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "exports.create");
  if (forbidden) return forbidden;

  const limit = request.nextUrl.searchParams.get("limit") ?? "50";
  const status = getSystemStatus();

  if (status.dataMode === "gas_ready" && isGasConfigured()) {
    try {
      const result = await cachedRead(
        ["export-history", limit],
        [GAS_READ_TAGS.managerExports],
        async () => gasClient.export.history({ limit }),
        20,
      );
      const items = (result.items ?? []).map((row) => mapItem(row as Record<string, unknown>));
      return NextResponse.json({
        data: {
          mode: "gas",
          items,
          summary: {
            totalExports: result.summary?.total_exports ?? items.length,
            totalCases: result.summary?.total_cases ?? items.reduce((s, i) => s + i.caseCount, 0),
            mohwExports: result.summary?.mohw_exports ?? items.length,
            mohwCases: result.summary?.mohw_cases ?? items.reduce((s, i) => s + i.caseCount, 0),
            lastExportedAt: result.summary?.last_exported_at ?? items[0]?.exportedAt ?? "",
          },
        },
      });
    } catch (error) {
      if (error instanceof GasApiError) {
        return NextResponse.json(
          { error: { code: error.code, message: error.message, errorLines: error.errorLines } },
          { status: 502 },
        );
      }
      const message = error instanceof Error ? error.message : "讀取匯出紀錄失敗";
      return NextResponse.json({ error: { code: "GAS_EXPORT_HISTORY_FAILED", message } }, { status: 502 });
    }
  }

  return NextResponse.json({ data: demoHistory() });
}
