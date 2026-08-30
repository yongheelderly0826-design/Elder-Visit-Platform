import { NextResponse } from "next/server";
import {
  encodeManagerSession,
  inferManagerRole,
  isAllowedManagerEmail,
  SESSION_COOKIE,
} from "@/lib/auth/google-manager";

function getSafeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/dashboard";
  }
  return nextPath;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; next?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  if (!email || !isAllowedManagerEmail(email)) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_ALLOWED",
          message: "此信箱尚未授權為永和區管理者。",
        },
      },
      { status: 403 },
    );
  }

  const roleKey = inferManagerRole(email);
  const nextPath = getSafeNextPath(body.next ?? null);
  const response = NextResponse.json({
    data: {
      ok: true,
      mode: "google-account",
      roleKey,
      nextPath,
    },
  });

  response.cookies.set(
    SESSION_COOKIE,
    encodeManagerSession({
      email,
      name: email,
      roleKey,
      provider: "google",
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    },
  );
  response.cookies.set("demo_role", roleKey, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
