import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { correctApprovedVisitor } from "@/lib/domain/user-management";
import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "users.manage");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    requestId?: string;
    fullName?: string;
    phone?: string;
    headshotDataUrl?: string;
    workerGroup?: VisitorRegistrationWorkerGroup;
    departmentName?: string;
    departmentOther?: string | null;
  };

  try {
    const data = await correctApprovedVisitor({
      requestId: body.requestId ?? "",
      fullName: body.fullName,
      phone: body.phone,
      headshotDataUrl: body.headshotDataUrl,
      workerGroup: body.workerGroup,
      departmentName: body.departmentName,
      departmentOther: body.departmentOther,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "訪員資料補正失敗。";
    const status = /找不到|僅能補正|缺少|至少|格式|請選|不在可選|請填/.test(message)
      ? 400
      : 500;
    return NextResponse.json(
      { error: { code: "VISITOR_CORRECTION_FAILED", message } },
      { status },
    );
  }
}
