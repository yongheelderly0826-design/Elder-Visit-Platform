import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { isPassbookChannelOpenLocally } from "@/lib/passbook/campaign";
import {
  clearPassbookSessionCookie,
  PASSBOOK_GENERIC_ERROR,
  PASSBOOK_SESSION_COOKIE,
  readPassbookSession,
} from "@/lib/passbook/session";
import { getSystemStatus } from "@/lib/system/env";

const MAX_DATA_URL_CHARS = 900_000;

export async function POST(request: NextRequest) {
  const session = readPassbookSession(
    request.cookies.get(PASSBOOK_SESSION_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: PASSBOOK_GENERIC_ERROR } },
      { status: 401 },
    );
  }

  const envConfigured = Boolean(process.env.PASSBOOK_CAMPAIGN_CODE);
  if (envConfigured && !isPassbookChannelOpenLocally(session.campaignCode)) {
    const response = NextResponse.json(
      { error: { code: "FORBIDDEN", message: PASSBOOK_GENERIC_ERROR } },
      { status: 403 },
    );
    return clearPassbookSessionCookie(response);
  }

  const body = (await request.json()) as {
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    bankCode?: string;
    passbookDataUrl?: string;
  };

  const accountName = String(body.accountName ?? "").trim();
  const accountNumber = String(body.accountNumber ?? "").replace(/\s/g, "").trim();
  const bankName = String(body.bankName ?? "").trim();
  const bankCode = String(body.bankCode ?? "").replace(/\D/g, "").trim();
  const passbookDataUrl = String(body.passbookDataUrl ?? "");

  if (!accountName || !accountNumber || !bankName || !bankCode || !passbookDataUrl) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "請完整填寫帳戶名稱、帳戶號碼、銀行與存摺照片。",
        },
      },
      { status: 400 },
    );
  }

  if (!/^data:image\//.test(passbookDataUrl) || passbookDataUrl.length > MAX_DATA_URL_CHARS) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "存摺照片過大或格式不正確，請重新拍攝較清楚的照片。",
        },
      },
      { status: 400 },
    );
  }

  if (getSystemStatus().dataMode !== "gas_ready") {
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "補件通道暫時無法使用，請稍後再試或聯絡承辦。",
        },
      },
      { status: 503 },
    );
  }

  try {
    const record = await gasClient.passbook.submit({
      campaign_code: session.campaignCode,
      visitor_id: session.visitorId,
      account_name: accountName,
      account_number: accountNumber,
      bank_name: bankName,
      bank_code: bankCode,
      passbook_data_url: passbookDataUrl,
    });

    const response = NextResponse.json({
      data: {
        submissionId: record.submission_id ?? null,
        status: record.status ?? "待審",
      },
      message: "已收到，承辦確認後用於匯款；無需重複傳送。",
    });
    return clearPassbookSessionCookie(response);
  } catch (error) {
    const message =
      error instanceof GasApiError
        ? error.message
        : "送出失敗，請稍後再試或聯絡承辦。";
    const status =
      error instanceof GasApiError && error.code === "FORBIDDEN"
        ? 403
        : error instanceof GasApiError && error.code === "VALIDATION_ERROR"
          ? 400
          : 502;
    return NextResponse.json(
      {
        error: {
          code: error instanceof GasApiError ? error.code : "SUBMIT_FAILED",
          message:
            status === 403 ? PASSBOOK_GENERIC_ERROR : message,
        },
      },
      { status },
    );
  }
}
