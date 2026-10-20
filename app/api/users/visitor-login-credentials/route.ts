import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import {
  issueVisitorLoginCredentials,
  listVisitorCredentialCandidates,
} from "@/lib/domain/visitor-login-credentials";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "users.manage");
  if (forbidden) return forbidden;

  try {
    const candidates = await listVisitorCredentialCandidates();
    return NextResponse.json({
      data: {
        count: candidates.length,
        candidates,
      },
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error: {
          code: "CREDENTIAL_LIST_FAILED",
          message: cause instanceof Error ? cause.message : "無法讀取訪員帳號清單。",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "users.manage");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    emails?: string[];
    sendEmail?: boolean;
  };

  const emails = Array.isArray(body.emails) ? body.emails : [];
  if (emails.length === 0) {
    return NextResponse.json(
      { error: { code: "MISSING_EMAILS", message: "請至少選擇一位訪員。" } },
      { status: 400 },
    );
  }

  try {
    const result = await issueVisitorLoginCredentials({
      emails,
      origin: request.nextUrl.origin,
      sendEmail: Boolean(body.sendEmail),
    });
    return NextResponse.json({ data: result });
  } catch (cause) {
    return NextResponse.json(
      {
        error: {
          code: "CREDENTIAL_ISSUE_FAILED",
          message: cause instanceof Error ? cause.message : "無法產生或寄送登入帳密。",
        },
      },
      { status: 500 },
    );
  }
}
