import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

const publicRoutes = ["/", "/login", "/register", "/offline"];
const supabaseCookiePrefixes = ["sb-", "supabase-auth-token"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = publicRoutes.includes(pathname);
  const isAuthApi = pathname.startsWith("/api/auth/");
  const isPublicBadgeRoute = pathname.startsWith("/verify/visitor/") || pathname.startsWith("/badge/claim/");
  const isPublicBadgeApi = pathname === "/api/badges/claim";
  const isPublicRegistrationApi =
    pathname === "/api/users/visitor-registration" || pathname === "/api/users/headshot-process";
  // 外勤掃 QR 簽到：頁面與 identify/me/clock 需免登入（clock 仍靠身分 Cookie／刷證權限）
  const isPublicVolunteerClock =
    pathname === "/volunteer/clock" ||
    pathname === "/api/attendance/identify" ||
    pathname === "/api/attendance/me" ||
    pathname === "/api/attendance/clock";
  const isAsset = pathname.startsWith("/_next/") || pathname.startsWith("/favicon");

  if (
    isPublicRoute ||
    isAuthApi ||
    isPublicRegistrationApi ||
    isPublicBadgeRoute ||
    isPublicBadgeApi ||
    isPublicVolunteerClock ||
    isAsset
  ) {
    return NextResponse.next();
  }

  const hasDemoSession = Boolean(request.cookies.get("demo_role")?.value);
  const hasManagerSession = Boolean(decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value));
  const hasSupabaseSession = request.cookies
    .getAll()
    .some((cookie) => supabaseCookiePrefixes.some((prefix) => cookie.name.startsWith(prefix)));

  if (!hasDemoSession && !hasManagerSession && !hasSupabaseSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
