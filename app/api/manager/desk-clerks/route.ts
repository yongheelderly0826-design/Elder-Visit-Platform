import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import {
  createDeskClerkBatch,
  disableAllDeskClerks,
  listDeskClerkStats,
  listDeskClerks,
  setDeskClerkStatus,
} from "@/lib/domain/desk-clerks";
import { GasApiError } from "@/lib/gas-client";

function gasErrorResponse(error: unknown) {
  if (error instanceof GasApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 502 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: "DESK_CLERK_FAILED",
        message: error instanceof Error ? error.message : "臨時登打操作失敗。",
      },
    },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "users.manage");
  if (forbidden) return forbidden;
  try {
    const from = request.nextUrl.searchParams.get("from") ?? undefined;
    const to = request.nextUrl.searchParams.get("to") ?? undefined;
    const [clerks, stats] = await Promise.all([
      listDeskClerks(),
      listDeskClerkStats({ from, to }),
    ]);
    return NextResponse.json({
      data: {
        clerks,
        stats,
      },
    });
  } catch (error) {
    return gasErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "users.manage");
  if (forbidden) return forbidden;
  try {
    const body = (await request.json()) as {
      action?: "create_batch" | "set_status" | "disable_all";
      count?: number;
      validUntil?: string | null;
      clerkId?: string;
      status?: "active" | "disabled";
      displayName?: string;
    };
    const action = body.action ?? "create_batch";

    if (action === "disable_all") {
      const result = await disableAllDeskClerks();
      return NextResponse.json({ data: result });
    }

    if (action === "set_status") {
      if (!body.clerkId || (body.status !== "active" && body.status !== "disabled")) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "請指定 clerkId 與 status。" } },
          { status: 400 },
        );
      }
      const clerk = await setDeskClerkStatus({
        clerkId: body.clerkId,
        status: body.status,
        validUntil: body.validUntil,
        displayName: body.displayName,
      });
      return NextResponse.json({ data: { clerk } });
    }

    const credentials = await createDeskClerkBatch({
      count: body.count,
      validUntil: body.validUntil,
    });
    return NextResponse.json({
      data: {
        credentials,
        warning: "通行碼僅顯示一次，請立即列印或下載後交臨時人員。",
      },
    });
  } catch (error) {
    return gasErrorResponse(error);
  }
}
