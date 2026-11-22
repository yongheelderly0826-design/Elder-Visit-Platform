import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getPassbookDeadlineFromEnv,
  isPassbookChannelOpenLocally,
} from "@/lib/passbook/campaign";
import {
  clearPassbookSessionCookie,
  PASSBOOK_GENERIC_ERROR,
  PASSBOOK_SESSION_COOKIE,
  readPassbookSession,
} from "@/lib/passbook/session";

export async function GET(request: NextRequest) {
  const session = readPassbookSession(
    request.cookies.get(PASSBOOK_SESSION_COOKIE)?.value,
  );

  if (!session) {
    return NextResponse.json({ data: { authenticated: false } });
  }

  if (!isPassbookChannelOpenLocally(session.campaignCode)) {
    // If env not set, still trust session until submit hits GAS.
    const envConfigured = Boolean(process.env.PASSBOOK_CAMPAIGN_CODE);
    if (envConfigured) {
      const response = NextResponse.json({
        data: { authenticated: false, closed: true },
        error: { message: PASSBOOK_GENERIC_ERROR },
      });
      return clearPassbookSessionCookie(response);
    }
  }

  return NextResponse.json({
    data: {
      authenticated: true,
      visitorId: session.visitorId,
      name: session.name,
      campaignCode: session.campaignCode,
      deadline: getPassbookDeadlineFromEnv(),
      expiresAt: session.exp,
    },
  });
}
