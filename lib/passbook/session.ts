import { NextResponse } from "next/server";

export const PASSBOOK_SESSION_COOKIE = "passbook_submit_session";
export const PASSBOOK_SESSION_MAX_AGE_SEC = 20 * 60;

export type PassbookSessionPayload = {
  visitorId: string;
  campaignCode: string;
  name: string;
  exp: number;
};

function encodePayload(payload: PassbookSessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(raw: string | undefined): PassbookSessionPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as PassbookSessionPayload;
    if (!parsed?.visitorId || !parsed?.campaignCode || !parsed?.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function passbookCookieOptions(maxAge = PASSBOOK_SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

export function setPassbookSessionCookie(
  response: NextResponse,
  input: { visitorId: string; campaignCode: string; name: string },
) {
  const payload: PassbookSessionPayload = {
    visitorId: input.visitorId,
    campaignCode: input.campaignCode,
    name: input.name,
    exp: Date.now() + PASSBOOK_SESSION_MAX_AGE_SEC * 1000,
  };
  response.cookies.set(PASSBOOK_SESSION_COOKIE, encodePayload(payload), passbookCookieOptions());
  return response;
}

export function clearPassbookSessionCookie(response: NextResponse) {
  response.cookies.set(PASSBOOK_SESSION_COOKIE, "", {
    ...passbookCookieOptions(0),
    maxAge: 0,
  });
  return response;
}

export function readPassbookSession(raw: string | undefined) {
  return decodePayload(raw);
}

export const PASSBOOK_GENERIC_ERROR = "無法確認身分或通道已關閉，請聯絡承辦";
