import { NextResponse } from "next/server";
import {
  encodeManagerSession,
  getGoogleOAuthConfig,
  inferManagerRole,
  isAllowedManagerEmail,
  SESSION_COOKIE,
} from "@/lib/auth/google-manager";

type GoogleTokenResponse = {
  access_token: string;
  id_token?: string;
  token_type: string;
};

type GoogleUserInfo = {
  email: string;
  name: string;
  picture?: string;
  verified_email?: boolean;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const stateRaw = url.searchParams.get("state");

  if (error || !code) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error ?? "google_denied")}`, request.url));
  }

  let nextPath = "/dashboard";
  if (stateRaw) {
    try {
      const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as { next?: string };
      if (state.next?.startsWith("/") && !state.next.startsWith("//")) {
        nextPath = state.next;
      }
    } catch {
      // ignore invalid state
    }
  }

  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/login?error=google_token", request.url));
  }

  const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });

  if (!userRes.ok) {
    return NextResponse.redirect(new URL("/login?error=google_profile", request.url));
  }

  const profile = (await userRes.json()) as GoogleUserInfo;
  const email = profile.email?.toLowerCase();

  if (!email || !isAllowedManagerEmail(email)) {
    return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
  }

  const session = encodeManagerSession({
    email,
    name: profile.name ?? email,
    picture: profile.picture,
    roleKey: inferManagerRole(email),
    provider: "google",
  });

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  response.cookies.set("demo_role", inferManagerRole(email), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
