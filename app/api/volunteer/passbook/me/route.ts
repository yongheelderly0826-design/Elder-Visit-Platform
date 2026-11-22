import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getPassbookDeadlineFromEnv,
  isPassbookChannelOpenLocally,
  isPassbookDeadlineOpenLocally,
} from "@/lib/passbook/campaign";
import {
  clearPassbookSessionCookie,
  PASSBOOK_GENERIC_ERROR,
  PASSBOOK_SESSION_COOKIE,
  readPassbookSession,
} from "@/lib/passbook/session";

export async function GET(request: NextRequest) {
  const deadline = getPassbookDeadlineFromEnv();
  const deadlineOpen = isPassbookDeadlineOpenLocally();

  const session = readPassbookSession(
    request.cookies.get(PASSBOOK_SESSION_COOKIE)?.value,
  );

  if (!session) {
    return NextResponse.json({
      data: {
        authenticated: false,
        deadline,
        closed: !deadlineOpen,
      },
    });
  }

  if (!deadlineOpen || !isPassbookChannelOpenLocally(session.campaignCode)) {
    const response = NextResponse.json({
      data: { authenticated: false, closed: true, deadline },
      error: { message: PASSBOOK_GENERIC_ERROR },
    });
    return clearPassbookSessionCookie(response);
  }

  return NextResponse.json({
    data: {
      authenticated: true,
      visitorId: session.visitorId,
      name: session.name,
      campaignCode: session.campaignCode,
      deadline,
      expiresAt: session.exp,
      closed: false,
    },
  });
}
