import { NextResponse } from "next/server";
import { getGoogleOAuthConfig, isGoogleAuthConfigured } from "@/lib/auth/google-manager";

export async function GET(request: Request) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "GOOGLE_AUTH_NOT_CONFIGURED",
          message: "尚未設定 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET，請見 docs/architecture/google-manager-login.md",
        },
      },
      { status: 503 },
    );
  }

  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/dashboard";

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", Buffer.from(JSON.stringify({ next }), "utf8").toString("base64url"));

  return NextResponse.redirect(authUrl.toString());
}
