import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasClient, isGasConfigured } from "@/lib/gas-client";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ visitorId: string }> },
) {
  const forbidden = requireCapability(request, "users.review");
  if (forbidden) return forbidden;

  const { visitorId: rawId } = await context.params;
  const visitorId = decodeURIComponent(rawId || "").trim();
  if (!visitorId) {
    return NextResponse.json(
      { error: { code: "MISSING_VISITOR_ID", message: "缺少訪員編碼。" } },
      { status: 400 },
    );
  }

  if (!isGasConfigured()) {
    return NextResponse.json(
      { error: { code: "GAS_NOT_CONFIGURED", message: "GAS 尚未設定。" } },
      { status: 503 },
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
        "cache-control": "private, max-age=120",
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "HEADSHOT_UNAVAILABLE", message: "證件照暫時無法讀取。" } },
      { status: 502 },
    );
  }
}
