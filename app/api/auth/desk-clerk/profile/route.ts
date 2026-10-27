import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { encodeManagerSession, SESSION_COOKIE, decodeManagerSession } from "@/lib/auth/google-manager";
import { setDeskClerkStatus } from "@/lib/domain/desk-clerks";
import { GasApiError } from "@/lib/gas-client";

function normalizeChineseName(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function isLikelyChineseName(value: string) {
  // 2～20 字，允許中文、間隔點、少數英數（複姓／原住民姓名）
  return /^[\u4e00-\u9fff·‧．A-Za-z0-9]{2,20}$/.test(value);
}

/** 臨時登打首次自填中文姓名。 */
export async function POST(request: NextRequest) {
  const role = request.cookies.get("demo_role")?.value;
  const clerkId = String(request.cookies.get("desk_clerk_id")?.value || "").trim().toUpperCase();
  if (role !== "desk_clerk" || !clerkId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "請先以臨時帳號登入。" } },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as { displayName?: string; next?: string };
    const displayName = normalizeChineseName(String(body.displayName ?? ""));
    if (!displayName) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "請輸入您的中文姓名。" } },
        { status: 400 },
      );
    }
    if (!isLikelyChineseName(displayName)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "請輸入 2～20 字的中文姓名。" } },
        { status: 400 },
      );
    }

    const clerk = await setDeskClerkStatus({
      clerkId,
      status: "active",
      displayName,
    });

    const email = `${clerk.clerkId.toLowerCase()}@desk.local`;
    const name = clerk.displayName || displayName;
    const nextPath =
      body.next && body.next.startsWith("/") && !body.next.startsWith("//")
        ? body.next
        : "/desk/care-forms";

    const existing = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({
      data: {
        ok: true,
        clerkId: clerk.clerkId,
        displayName: name,
        nextPath,
      },
    });

    response.cookies.set(
      SESSION_COOKIE,
      encodeManagerSession({
        email: existing?.email || email,
        name,
        roleKey: "desk_clerk",
        provider: "google",
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 12,
      },
    );
    response.cookies.set("demo_name", name, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
    });
    response.cookies.set("desk_clerk_id", clerk.clerkId, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error) {
    if (error instanceof GasApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "PROFILE_SAVE_FAILED",
          message: error instanceof Error ? error.message : "姓名儲存失敗。",
        },
      },
      { status: 500 },
    );
  }
}
