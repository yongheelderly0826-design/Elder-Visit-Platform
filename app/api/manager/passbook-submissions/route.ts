import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireOwnerOrManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const forbidden = requireOwnerOrManagerCapability(request, "users.manage");
  if (forbidden) return forbidden;

  if (getSystemStatus().dataMode !== "gas_ready") {
    return NextResponse.json({ data: { items: [] } });
  }

  const status = request.nextUrl.searchParams.get("status") ?? "待審";

  try {
    const items = await gasClient.passbook.list(
      status === "all" ? undefined : { status },
    );
    return NextResponse.json({ data: { items } });
  } catch (error) {
    const message = error instanceof GasApiError ? error.message : "讀取補件清單失敗";
    return NextResponse.json(
      { error: { code: "LIST_FAILED", message } },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireOwnerOrManagerCapability(request, "users.manage");
  if (forbidden) return forbidden;

  if (getSystemStatus().dataMode !== "gas_ready") {
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "GAS 未設定" } },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    submissionId?: string;
    decision?: "已確認" | "退回";
    reviewNote?: string;
  };

  if (!body.submissionId || (body.decision !== "已確認" && body.decision !== "退回")) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "請指定補件編號與審核結果" } },
      { status: 400 },
    );
  }

  const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
  const reviewedBy = manager?.email ?? request.cookies.get("demo_role")?.value ?? "manager";

  try {
    const updated = await gasClient.passbook.review({
      submission_id: body.submissionId,
      decision: body.decision,
      review_note: body.reviewNote ?? "",
      reviewed_by: reviewedBy,
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    const message = error instanceof GasApiError ? error.message : "審核失敗";
    const status =
      error instanceof GasApiError && error.code === "NOT_FOUND"
        ? 404
        : error instanceof GasApiError && error.code === "VALIDATION_ERROR"
          ? 400
          : 502;
    return NextResponse.json(
      {
        error: {
          code: error instanceof GasApiError ? error.code : "REVIEW_FAILED",
          message,
        },
      },
      { status },
    );
  }
}
