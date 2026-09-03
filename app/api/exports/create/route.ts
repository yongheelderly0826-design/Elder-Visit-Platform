import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { createCsvExport } from "@/lib/domain/exports";
import { evaluatePlanLimit } from "@/lib/domain/limits";
import { getCurrentWorkspace } from "@/lib/domain/mock-data";
import type { ConsentScope } from "@/lib/domain/types";
import { GasApiError, gasClient, isGasConfigured } from "@/lib/gas-client";
import { buildMohwLifeCareExportRow } from "@/lib/domain/mohw-life-care-export";
import { mohwLifeCareSampleAnswers } from "@/lib/domain/mohw-life-care-ui";
import { getSystemStatus } from "@/lib/system/env";

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "exports.create");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    templateId?: string;
    purpose?: ConsentScope;
    caseIds?: string[];
    onlyAudited?: boolean;
    strict?: boolean;
  };
  const workspace = getCurrentWorkspace();
  const planLimit = evaluatePlanLimit(workspace.planLimits, "max_exports");

  if (planLimit.state === "blocked") {
    return NextResponse.json(
      {
        error: {
          code: "PLAN_LIMIT_REACHED",
          message: planLimit.message,
          limit: planLimit.limit,
        },
      },
      { status: 402 },
    );
  }

  const templateId = body.templateId ?? "export_visit_result_v1";
  const status = getSystemStatus();

  if (templateId === "export_central_system_excel_v1") {
    if (!body.caseIds?.length) {
      return NextResponse.json(
        {
          error: {
            code: "CASE_IDS_REQUIRED",
            message: "請先勾選要匯出的個案",
          },
        },
        { status: 400 },
      );
    }

    if (status.dataMode === "gas_ready" && isGasConfigured()) {
      try {
        const gasResult = (await gasClient.export.lifeCareXlsx({
          case_ids: body.caseIds,
          only_audited: body.onlyAudited === true,
          strict: body.strict !== false,
        })) as {
          export_id?: string;
          file_url?: string;
          file_name?: string;
          message?: string;
          validation?: {
            ok?: boolean;
            successCount?: number;
            failCount?: number;
            errorLines?: string[];
          };
          skipped?: Array<{ case_id: string; reason: string }>;
        };

        return NextResponse.json({
          data: {
            mode: "gas",
            filename: gasResult.file_name ?? "生活關懷表.xlsx",
            fileUrl: gasResult.file_url ?? "",
            content: gasResult.file_url ?? "",
            status: "ready",
            gasExport: gasResult,
            validation: gasResult.validation,
            skipped: gasResult.skipped ?? [],
            exportLog: { entityType: "export_job", action: "create" },
            planLimit,
            message: gasResult.message,
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
                errors: error.errors,
              },
            },
            { status: 400 },
          );
        }
        const message = error instanceof Error ? error.message : "GAS 匯出失敗";
        return NextResponse.json({ error: { code: "GAS_EXPORT_FAILED", message } }, { status: 502 });
      }
    }

    // Demo / mock fallback: produce TSV preview of 102 columns
    const row = buildMohwLifeCareExportRow({ mohwAnswers: mohwLifeCareSampleAnswers });
    const tsv = [row.headers.join("\t"), row.values.join("\t")].join("\n");
    return NextResponse.json({
      data: {
        mode: "demo",
        filename: "生活關懷表_demo.tsv",
        fileUrl: "",
        content: tsv,
        status: "preview",
        validation: {
          ok: row.gapCounts.requiredMissing === 0,
          filled: row.gapCounts.filled,
          empty: row.gapCounts.empty,
          requiredMissing: row.gapCounts.requiredMissing,
        },
        message:
          "目前非 GAS 模式，已產生 102 欄示範預覽（TSV）。接上 GAS 後會產出 Drive xlsx。",
        exportLog: { entityType: "export_job", action: "create" },
        planLimit,
      },
    });
  }

  const result = createCsvExport(templateId, body.purpose ?? "government_report");

  return NextResponse.json({
    data: {
      ...result,
      status: "ready",
      exportLog: {
        entityType: "export_job",
        action: "create",
      },
      planLimit,
    },
  });
}
