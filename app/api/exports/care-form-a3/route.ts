import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { GasApiError, gasClient, isGasConfigured } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

/** 管理端：已稽核個案整版 A3 套印（從 GAS 讀答案＋母版產 PDF） */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "exports.create");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    caseId?: string;
    careformId?: string;
  };

  if (!body.caseId && !body.careformId) {
    return NextResponse.json(
      { error: { code: "CASE_ID_REQUIRED", message: "請指定個案或關懷表。" } },
      { status: 400 },
    );
  }

  const status = getSystemStatus();
  if (status.dataMode !== "gas_ready" || !isGasConfigured()) {
    return NextResponse.json(
      { error: { code: "GAS_REQUIRED", message: "目前非 GAS 模式，無法套印 A3。" } },
      { status: 503 },
    );
  }

  try {
    const generated = await gasClient.export.careFormPdf({
      case_id: body.caseId,
      careform_id: body.careformId,
      include_base64: true,
    });
    if (!generated.pdf_base64) {
      return NextResponse.json(
        { error: { code: "PDF_EMPTY", message: "GAS 未回傳 PDF 內容。" } },
        { status: 502 },
      );
    }

    return new NextResponse(Buffer.from(generated.pdf_base64, "base64"), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="care-form.pdf"; filename*=UTF-8''${encodeURIComponent(generated.file_name || "care-form.pdf")}`,
        "X-Care-Form-Drive-Url": generated.file_url,
        "X-Care-Form-Folder-Url": generated.folder_url,
        "X-Care-Form-File-Name": encodeURIComponent(generated.file_name || ""),
        "X-Care-Form-Page-Count": String(generated.page_count ?? 1),
      },
    });
  } catch (error) {
    if (error instanceof GasApiError) {
      const statusCode =
        error.code === "NOT_AUDITED" || error.code === "CAREFORM_NOT_FOUND" ? 400 : 502;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: statusCode },
      );
    }
    const message = error instanceof Error ? error.message : "A3 套印失敗";
    return NextResponse.json({ error: { code: "CAREFORM_A3_FAILED", message } }, { status: 502 });
  }
}
