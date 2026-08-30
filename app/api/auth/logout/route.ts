import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/google-manager";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Demo-only sessions do not have a Supabase session to clear.
  }

  const response = NextResponse.redirect(new URL("/login", request.url));

  response.cookies.set("demo_role", "", {
    path: "/",
    sameSite: "lax",
    maxAge: 0,
  });
  response.cookies.set(SESSION_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    maxAge: 0,
  });

  return response;
}
