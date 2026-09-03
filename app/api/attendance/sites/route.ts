import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { ATTENDANCE_SITES, VOLUNTEER_GROUPS } from "@/lib/domain/volunteer-attendance";
import { getRuntimeEnvValue } from "@/lib/runtime/env";

export async function GET() {
  const origin = (
    getRuntimeEnvValue("NEXT_PUBLIC_APP_URL") ?? "https://elder-visit-platform-ruby.vercel.app"
  ).replace(/\/+$/, "");

  const sites = await Promise.all(
    ATTENDANCE_SITES.map(async (site) => {
      const clockUrl = `${origin}/volunteer/clock?site=${encodeURIComponent(site.id)}`;
      return {
        ...site,
        clockUrl,
        qrUrl: await QRCode.toDataURL(clockUrl, { width: 320, margin: 1 }),
      };
    }),
  );

  return NextResponse.json({
    data: {
      groups: VOLUNTEER_GROUPS,
      sites,
    },
  });
}
