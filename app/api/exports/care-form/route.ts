import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "exports.create");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    format?: "word" | "pdf";
    elderName?: string;
    caseCode?: string;
    answers?: MohwLifeCareAnswers;
  };
  const format = body.format ?? "word";
  const rows = Object.entries(body.answers ?? {}).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? value.join("、") : value,
  }));
  const content = [
    `衛福部生活關懷表（102 欄 · ${format === "word" ? "Word 套版內容" : "PDF 預覽內容"}）`,
    `案號：${body.caseCode ?? ""}`,
    `姓名：${body.elderName ?? ""}`,
    "",
    ...rows.map((row) => `${row.key}：${row.value}`),
  ].join("\n");

  return NextResponse.json({
    data: {
      filename: `${body.caseCode ?? "care-form"}.${format === "word" ? "docx" : "pdf"}`,
      content,
      status: "template_ready",
      note:
        format === "word"
          ? "目前先輸出 Word 套版資料，下一步會把欄位寫回新北空白 DOCX 的勾選框。"
          : "目前先輸出 PDF 預覽資料，下一步會接 PDF renderer 產生正式 PDF。",
    },
  });
}
