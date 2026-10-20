import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { gasClient, isGasConfigured } from "@/lib/gas-client";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";

export async function GET(request: NextRequest) {
  const roleKey = request.cookies.get("demo_role")?.value;
  const visitorId = request.cookies.get(VOLUNTEER_CLOCK_COOKIE)?.value ?? "";

  if (roleKey !== "visitor" || !visitorId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "請先以訪員帳號登入。" } },
      { status: 401 },
    );
  }

  if (!isGasConfigured()) {
    return NextResponse.json(
      { error: { code: "GAS_NOT_CONFIGURED", message: "目前沒有可讀取的證件照。" } },
      { status: 404 },
    );
  }

  try {
    const photo = await gasClient.accounts.getHeadshot(visitorId);
    if (!photo?.found || !photo.base64) {
      return NextResponse.json(
        { error: { code: "HEADSHOT_NOT_FOUND", message: "這位訪員尚未有證件照。" } },
        { status: 404 },
      );
    }

    const bytes = Uint8Array.from(Buffer.from(photo.base64, "base64"));
    return new NextResponse(bytes, {
      headers: {
        "content-type": photo.mime || "image/jpeg",
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "HEADSHOT_UNAVAILABLE", message: "證件照暫時無法讀取。" } },
      { status: 502 },
    );
  }
}
