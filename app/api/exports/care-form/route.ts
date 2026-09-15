import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/api/authorization";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { evaluateHighCare } from "@/lib/domain/high-care-rules";
import { careFormPdfFilename } from "@/lib/domain/ntpc-a3-overlay";
import { gasClient, isGasConfigured } from "@/lib/gas-client";

export async function POST(request: NextRequest) {
  const forbidden = requireAnyCapability(request, ["exports.create", "visits.submit"]);
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    format?: "word" | "pdf" | "a3";
    elderName?: string;
    caseCode?: string;
    answers?: MohwLifeCareAnswers;
  };
  const answers = body.answers ?? {};
  const format = body.format ?? "a3";

  if (format === "pdf" || format === "a3") {
    const visitDate = String(answers.visit_date ?? "");
    const filename = careFormPdfFilename(visitDate, body.elderName ?? String(answers.name ?? ""));

    if (!isGasConfigured()) {
      return NextResponse.json(
        {
          error: {
            code: "GAS_NOT_CONFIGURED",
            message: "未設定 GAS，無法使用 Google 試算表母版產生單頁 A3 PDF。",
          },
        },
        { status: 503 },
      );
    }

    try {
      const generated = await gasClient.careform.generatePdf({
        answers: answers as Record<string, unknown>,
        elder_name: body.elderName,
        case_code: body.caseCode,
        encoded_id: body.caseCode,
        district: String(answers.household_district ?? ""),
        include_base64: true,
      });
      if (!generated.pdf_base64) {
        throw new Error("GAS 未回傳 PDF 內容");
      }
      return new NextResponse(Buffer.from(generated.pdf_base64, "base64"), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="care-form.pdf"; filename*=UTF-8''${encodeURIComponent(generated.file_name || filename)}`,
          "X-Care-Form-Drive-Url": generated.file_url,
          "X-Care-Form-Folder-Url": generated.folder_url,
          "X-Care-Form-Page-Count": String(generated.page_count),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google 試算表套印失敗";
      return NextResponse.json(
        { error: { code: "CAREFORM_PDF_EXPORT_FAILED", message } },
        { status: 502 },
      );
    }
  }

  const highCare = evaluateHighCare(answers);
  const rows = Object.entries(answers).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? value.join("、") : String(value ?? ""),
  }));
  const content = [
    "新北完整 A3 請改用 PDF（含題目、選項與已填答案）。",
    `案號：${body.caseCode ?? ""}`,
    `姓名：${body.elderName ?? ""}`,
    `高關懷：${highCare.triggered ? highCare.colors.join("、") : "未觸發"}`,
    "",
    ...rows.map((row) => `${row.key}：${row.value}`),
  ].join("\n");

  return NextResponse.json({
    data: {
      filename: `${body.caseCode ?? "care-form"}.txt`,
      content,
      status: "template_ready",
      note: "欄位清單僅供核對。正式列印請下載完整 A3 PDF（題目＋答案），以 A3 直式單張 100% 列印。",
      highCare,
    },
  });
}
