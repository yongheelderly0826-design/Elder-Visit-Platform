import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { GasApiError, gasClient, isGasConfigured, isUnknownGasAction } from "@/lib/gas-client";
import { mapMohwExportCandidate } from "@/lib/domain/mohw-export-candidates";
import { getSystemStatus } from "@/lib/system/env";

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
    let candidatesRaw: Array<Record<string, unknown>> = [];
    let payments = paymentsFromCandidates([]);
    let counts = { pending_audit: 0, approved: 0, returned: 0 };

    try {
      const result = await gasClient.export.managerBundle(params);
      candidatesRaw = result.candidates?.items ?? [];
      if (result.payments?.items?.length) {
        payments = {
          batch_no: result.payments.batch_no,
          item_count: Number(result.payments.item_count ?? result.payments.items.length),
          total_amount: Number(result.payments.total_amount ?? 0),
          items: result.payments.items.map((row) => ({
            id: String(row.id ?? ""),
            case_id: String(row.case_id ?? ""),
            case_code: String(row.case_code ?? ""),
            elder_name: String(row.elder_name ?? ""),
            visit_record_id: String(row.visit_record_id ?? ""),
            locked_at: String(row.locked_at ?? ""),
            visit_fee: Number(row.visit_fee ?? 180),
            data_processing_fee: Number(row.data_processing_fee ?? 30),
            total_fee: Number(row.total_fee ?? 210),
            status: String(row.status ?? "locked"),
          })),
          warnings: result.payments.warnings ?? [],
        };
      }
      if (result.counts) counts = result.counts;
    } catch (error) {
      if (!isUnknownGasAction(error)) throw error;
      const result = await gasClient.export.listCandidates(params);
      candidatesRaw = result.items ?? [];
    }

    const items = candidatesRaw.map((item) => mapMohwExportCandidate(item));
    if (!payments.items?.length) {
      payments = paymentsFromCandidates(items);
    }
    if (!counts.approved) {
      counts = {
        pending_audit: items.filter((item) => item.auditDecision === "待稽核").length,
        approved: items.filter((item) => item.auditDecision === "通過" || item.careformStatus === "已稽核").length,
        returned: 0,
      };
    }

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
