import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import {
  getUserManagementOverview,
  reviewRegistration,
} from "@/lib/domain/user-management";
import type { UserRegistrationDecision } from "@/lib/domain/types";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "users.manage");
  if (forbidden) return forbidden;

  try {
    return NextResponse.json({
      data: await getUserManagementOverview(),
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error: {
          code: "USER_DIRECTORY_UNAVAILABLE",
          message:
            cause instanceof Error
              ? cause.message
              : "目前無法讀取 Google Sheets 使用者名冊。",
        },
      },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "users.review");
  if (forbidden) return forbidden;

  try {
    const decision = (await request.json()) as UserRegistrationDecision;

    return NextResponse.json({
      data: await reviewRegistration(decision),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "REGISTRATION_REVIEW_FAILED",
          message: error instanceof Error ? error.message : "審核資料寫入失敗。",
        },
      },
      { status: 500 },
    );
  }
}
