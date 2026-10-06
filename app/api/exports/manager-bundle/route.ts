import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { GasApiError, gasClient, isGasConfigured, isUnknownGasAction } from "@/lib/gas-client";
import { mapMohwExportCandidate } from "@/lib/domain/mohw-export-candidates";
import { cachedRead, GAS_READ_TAGS } from "@/lib/gas-read-cache";
import { getSystemStatus } from "@/lib/system/env";

export const maxDuration = 60;

function paymentsFromCandidates(items: ReturnType<typeof mapMohwExportCandidate>[]) {
  const rows = items
    .filter((item) => item.auditDecision === "通過" || item.careformStatus === "已稽核")
    .map((item) => ({
      id: item.careformId,
      case_id: item.caseId,
      case_code: item.externalId || item.encodedId || item.caseId,
      elder_name: item.name,
      visit_record_id: item.careformId,
      locked_at: item.auditedAt,
      visit_fee: 180,
      data_processing_fee: 30,
      total_fee: 210,
      status: "locked",
    }));
  return {
    batch_no: undefined as string | undefined,
    item_count: rows.length,
    total_amount: rows.length * 210,
    items: rows,
    warnings: rows.length ? [] : ["目前沒有稽核通過、可列入核銷的訪視。"],
  };
}

function mapHistory(raw?: {
  items?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
}) {
  const items = (raw?.items ?? []).map((row) => ({
    exportId: String(row.export_id ?? ""),
    exportType: String(row.export_type ?? ""),
    caseCount: Number(row.case_count) || 0,
    fileName: String(row.file_name ?? ""),
    fileId: String(row.file_id ?? ""),
    fileUrl: String(row.file_url ?? ""),
    columnCount: Number(row.column_count) || 0,
    skippedCount: Number(row.skipped_count) || 0,
    exportedBy: String(row.exported_by ?? ""),
    exportedAt: String(row.exported_at ?? ""),
  }));
  const summary = raw?.summary;
  return {
    items,
    summary: {
      totalExports: Number(summary?.total_exports ?? items.length) || 0,
      totalCases:
        Number(summary?.total_cases ?? items.reduce((sum, item) => sum + item.caseCount, 0)) || 0,
      mohwExports: Number(summary?.mohw_exports ?? items.length) || 0,
      mohwCases:
        Number(summary?.mohw_cases ?? items.reduce((sum, item) => sum + item.caseCount, 0)) || 0,
      lastExportedAt: String(summary?.last_exported_at ?? items[0]?.exportedAt ?? ""),
    },
  };
}

/**
 * 匯出頁一次取候選＋匯出紀錄（workspaceBundle）；
 * 若新 action 尚未部署則降級 listCandidates。
 */
export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "exports.create");
  if (forbidden) return forbidden;

  const onlyAudited = request.nextUrl.searchParams.get("onlyAudited") === "true";
  const district = request.nextUrl.searchParams.get("district") ?? "";
  const status = getSystemStatus();

  if (status.dataMode !== "gas_ready" || !isGasConfigured()) {
    return NextResponse.json(
      { error: { code: "GAS_REQUIRED", message: "目前非 GAS 模式，請用原候選／核銷 API。" } },
      { status: 400 },
    );
  }

  const params = {
    ...(district ? { district } : {}),
    ...(onlyAudited ? { only_audited: "true" } : {}),
  };

  try {
    const result = await cachedRead(
      ["manager-workspace", onlyAudited ? "1" : "0", district],
      [GAS_READ_TAGS.managerExports],
      async () => {
        try {
          return await gasClient.export.workspaceBundle(params);
        } catch (error) {
          if (!isUnknownGasAction(error) && !(error instanceof GasApiError && error.code === "GAS_NON_JSON")) {
            // 仍嘗試 listCandidates
          }
          const fallback = await gasClient.export.listCandidates(params);
          return {
            candidates: {
              total: fallback.total,
              ready_count: fallback.ready_count,
              items: fallback.items,
            },
            history: undefined,
            payments: null,
            counts: null,
          };
        }
      },
    );

    const items = (result.candidates?.items ?? []).map((item) => mapMohwExportCandidate(item));
    const payments = paymentsFromCandidates(items);
    const history = mapHistory(result.history);
    const counts = result.counts ?? {
      pending_audit: items.filter((item) => item.auditDecision === "待稽核").length,
      approved: items.filter(
        (item) => item.auditDecision === "通過" || item.careformStatus === "已稽核",
      ).length,
      returned: 0,
    };

    return NextResponse.json({
      data: {
        mode: "gas",
        candidates: {
          total: items.length,
          readyCount: items.filter((item) => item.exportReady).length,
          items,
        },
        payments,
        counts,
        history,
      },
    });
  } catch (error) {
    if (error instanceof GasApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message, errorLines: error.errorLines } },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : "讀取匯出／核銷資料失敗";
    return NextResponse.json({ error: { code: "GAS_MANAGER_BUNDLE_FAILED", message } }, { status: 502 });
  }
}
