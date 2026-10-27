import { NextResponse } from "next/server";
import { clearVolunteerClockCookie } from "@/lib/attendance/session";
import { encodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { authenticateDeskClerk } from "@/lib/domain/desk-clerks";
import { GasApiError } from "@/lib/gas-client";

function getSafeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/desk/care-forms";
  }
  if (nextPath.startsWith("/visitor/")) {
    return "/desk/care-forms";
  }
  return nextPath;
}

/** 臨時登打：帳號 TEMP-xx ＋通行碼 → 僅關懷表建檔。 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clerkId?: string;
      passcode?: string;
      next?: string;
    };
    const clerk = await authenticateDeskClerk(
      String(body.clerkId ?? ""),
      String(body.passcode ?? ""),
    );
    const roleKey = "desk_clerk" as const;
    const email = `${clerk.clerkId.toLowerCase()}@desk.local`;
    const name = clerk.displayName || clerk.clerkId;
    const nextPath = getSafeNextPath(body.next ?? null);

    const response = NextResponse.json({
      data: {
        ok: true,
        mode: "desk-clerk",
        roleKey,
        clerkId: clerk.clerkId,
        displayName: name,
        nextPath,
      },
    });

    response.cookies.set(
      SESSION_COOKIE,
      encodeManagerSession({
        email,
        name,
        roleKey,
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
    response.cookies.set("demo_role", roleKey, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
    });
    response.cookies.set("demo_email", email, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
    });
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
    clearVolunteerClockCookie(response);
    return response;
  } catch (error) {
    const message =
      error instanceof GasApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "登入失敗。";
    const code =
      error instanceof GasApiError
        ? error.code
        : /停用|到期/.test(message)
          ? "DISABLED"
          : "LOGIN_FAILED";
    return NextResponse.json(
      { error: { code, message } },
      { status: code === "DISABLED" || code === "EXPIRED" ? 403 : 401 },
    );
  }
}
