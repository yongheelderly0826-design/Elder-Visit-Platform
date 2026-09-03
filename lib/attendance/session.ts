import { NextResponse } from "next/server";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";

export function volunteerClockCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  };
}

export function setVolunteerClockCookie(response: NextResponse, visitorId: string) {
  response.cookies.set(VOLUNTEER_CLOCK_COOKIE, visitorId, volunteerClockCookieOptions());
  return response;
}

export function clearVolunteerClockCookie(response: NextResponse) {
  response.cookies.set(VOLUNTEER_CLOCK_COOKIE, "", {
    ...volunteerClockCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export function gasErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code ?? "ATTENDANCE_FAILED")
      : "ATTENDANCE_FAILED";
  const status =
    code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" || code === "UNAUTHORIZED" ? 403 : 502;
  return NextResponse.json({ error: { code, message } }, { status });
}
