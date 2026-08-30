import { NextResponse } from "next/server";
import { isGoogleAuthConfigured } from "@/lib/auth/google-manager";

export async function GET() {
  return NextResponse.json({
    data: {
      enabled: isGoogleAuthConfigured(),
    },
  });
}
