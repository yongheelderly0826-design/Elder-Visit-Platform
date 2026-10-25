import { NextResponse } from "next/server";
import { clearVolunteerClockCookie } from "@/lib/attendance/session";
import { encodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

const DESK_SHARED_EMAIL = "desk-shared@yonghe.local";
const DESK_SHARED_NAME = "紙本建檔共用";

function getConfiguredPasscode() {
  return String(process.env.DESK_SHARED_PASSCODE ?? "").trim();
}

function getSafeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/desk/care-forms";
  }
  if (nextPath.startsWith("/visitor/")) {
    return "/desk/care-forms";
  }
  return nextPath;
}

/** 紙本 KEY 共用入口：輸入通行碼即可，不必個人 Gmail。 */
export async function POST(request: Request) {
  const configured = getConfiguredPasscode();
  if (!configured) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "尚未設定紙本建檔共用通行碼（DESK_SHARED_PASSCODE）。",
        },
      },
      { status: 503 },
    );
  }

  const body = (await request.json()) as { passcode?: string; next?: string };
  const passcode = String(body.passcode ?? "").trim();
  if (!passcode || passcode !== configured) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PASSCODE",
          message: "通行碼不正確。",
        },
      },
      { status: 401 },
    );
  }

  const roleKey = "workspace_manager" as const;
  const nextPath = getSafeNextPath(body.next ?? null);
  const response = NextResponse.json({
    data: {
      ok: true,
      mode: "desk-shared",
      roleKey,
      nextPath,
    },
  });

  response.cookies.set(
    SESSION_COOKIE,
    encodeManagerSession({
      email: DESK_SHARED_EMAIL,
      name: DESK_SHARED_NAME,
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
  response.cookies.set("demo_email", DESK_SHARED_EMAIL, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });
  response.cookies.set("demo_name", DESK_SHARED_NAME, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });
  clearVolunteerClockCookie(response);

  return response;
}

export async function GET() {
  return NextResponse.json({
    data: {
      enabled: Boolean(getConfiguredPasscode()),
    },
  });
}
