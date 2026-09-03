import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { GasApiError, gasClient, isGasConfigured } from "@/lib/gas-client";
import { mohwLifeCareSampleAnswers } from "@/lib/domain/mohw-life-care-ui";
import { validateMohwLifeCareRow } from "@/lib/domain/mohw-life-care-validation";
import type { MohwExportCandidate } from "@/lib/domain/mohw-export-candidates";
import { getSystemStatus } from "@/lib/system/env";

export type { MohwExportCandidate };

function demoCandidates(): MohwExportCandidate[] {
  const ok = validateMohwLifeCareRow(mohwLifeCareSampleAnswers, { row: 2 });
  return [
    {
      caseId: "CASE-DEMO-001",
      encodedId: "YH-115-A001",
      externalId: "NTPC-115-TEST-001",
      name: String(mohwLifeCareSampleAnswers.name ?? "吳秀枝"),
      district: "板橋區",
      village: "文化里",
      careformId: "CF-DEMO-001",
      careformStatus: "已稽核",
      visitResult: "已完成",
      submittedAt: "2026-05-22T10:30:00.000Z",
      auditedAt: "2026-05-23T09:00:00.000Z",
      auditDecision: "通過",
      exportReady: ok.ok,
      validationOk: ok.ok,
      errorCount: ok.errors.length,
      errorLines: ok.errorLines.slice(0, 5),
    },
    {
      caseId: "CASE-DEMO-002",
      encodedId: "YH-115-A002",
      externalId: "NTPC-115-TEST-002",
      name: "陳水木",
      district: "永和區",
      village: "保平里",
      careformId: "CF-DEMO-002",
      careformStatus: "已提交",
      visitResult: "已完成",
      submittedAt: "2026-05-23T14:00:00.000Z",
      auditedAt: "",
      auditDecision: "待稽核",
      exportReady: false,
      validationOk: false,
      errorCount: 1,
      errorLines: ["CJ2 社政訪查人與民政訪查人擇一必填"],
    },
  ];
}

function mapGasItem(raw: Record<string, unknown>): MohwExportCandidate {
  return {
    caseId: String(raw.case_id ?? ""),
    encodedId: String(raw.encoded_id ?? ""),
    externalId: String(raw.external_id ?? ""),
    name: String(raw.name ?? ""),
    district: String(raw.visit_district ?? ""),
    village: String(raw.visit_village ?? ""),
    careformId: String(raw.careform_id ?? ""),
    careformStatus: String(raw.careform_status ?? ""),
    visitResult: String(raw.visit_result ?? ""),
    submittedAt: String(raw.submitted_at ?? ""),
    auditedAt: String(raw.audited_at ?? ""),
    auditDecision: String(raw.audit_decision ?? ""),
    exportReady: Boolean(raw.export_ready),
    validationOk: Boolean(raw.validation_ok),
    errorCount: Number(raw.error_count ?? 0),
    errorLines: Array.isArray(raw.error_lines)
      ? raw.error_lines.map(String)
      : [],
  };
}

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "exports.create");
  if (forbidden) return forbidden;

  const onlyAudited = request.nextUrl.searchParams.get("onlyAudited") === "true";
  const district = request.nextUrl.searchParams.get("district") ?? "";
  const status = getSystemStatus();

  if (status.dataMode === "gas_ready" && isGasConfigured()) {
    try {
      const result = await gasClient.export.listCandidates({
        ...(district ? { district } : {}),
        ...(onlyAudited ? { only_audited: "true" } : {}),
      });
      const items = (result.items ?? []).map((item) =>
        mapGasItem(item as Record<string, unknown>),
      );
      return NextResponse.json({
        data: {
          mode: "gas",
          total: result.total ?? items.length,
          readyCount: result.ready_count ?? items.filter((i) => i.exportReady).length,
          items,
        },
      });
    } catch (error) {
      if (error instanceof GasApiError) {
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.message,
              errorLines: error.errorLines,
            },
          },
          { status: 502 },
        );
      }
      const message = error instanceof Error ? error.message : "讀取候選清單失敗";
      return NextResponse.json({ error: { code: "GAS_CANDIDATES_FAILED", message } }, { status: 502 });
    }
  }

  const demo = demoCandidates().filter((item) => (onlyAudited ? item.auditDecision === "通過" : true));
  return NextResponse.json({
    data: {
      mode: "demo",
      total: demo.length,
      readyCount: demo.filter((item) => item.exportReady).length,
      items: demo,
      note: "目前非 GAS 模式，顯示示範候選資料。",
    },
  });
}
