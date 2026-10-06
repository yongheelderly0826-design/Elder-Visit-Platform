import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { GasApiError, gasClient, isGasConfigured } from "@/lib/gas-client";
import { mapMohwExportCandidate } from "@/lib/domain/mohw-export-candidates";
import { cachedRead, GAS_READ_TAGS } from "@/lib/gas-read-cache";
import { getSystemStatus } from "@/lib/system/env";

/** 匯出頁冷啟動可能較慢；候選清單本身通常 <10s。 */
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

/**
 * managerBundle 在 Vercel→GAS 路徑常逾時回 HTML；
 * 改以較輕的 listCandidates 為主，核銷列由候選推算。
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
      ["manager-bundle-lite", onlyAudited ? "1" : "0", district],
      [GAS_READ_TAGS.managerExports],
      async () => gasClient.export.listCandidates(params),
    );

    const items = (result.items ?? []).map((item) => mapMohwExportCandidate(item));
    const payments = paymentsFromCandidates(items);
    const counts = {
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
