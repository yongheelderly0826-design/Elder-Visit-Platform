import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { extractTaiwanId } from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import {
  getPassbookCampaignCodeFromEnv,
  getPassbookDeadlineFromEnv,
  isPassbookChannelOpenLocally,
} from "@/lib/passbook/campaign";
import {
  PASSBOOK_GENERIC_ERROR,
  setPassbookSessionCookie,
} from "@/lib/passbook/session";
import { getSystemStatus } from "@/lib/system/env";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    campaignCode?: string;
    campaign_code?: string;
    name?: string;
    idNumber?: string;
    id_number?: string;
    phoneLast4?: string;
    phone_last4?: string;
  };

  const campaignCode = String(body.campaignCode ?? body.campaign_code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const idNumber = extractTaiwanId(body.idNumber ?? body.id_number ?? "");
  const phoneLast4 = String(body.phoneLast4 ?? body.phone_last4 ?? "")
    .replace(/\D/g, "")
    .slice(-4);

  if (!campaignCode || !name || !idNumber || phoneLast4.length !== 4) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: PASSBOOK_GENERIC_ERROR } },
      { status: 403 },
    );
  }

  // Fast local reject when env is configured (GAS remains authoritative when available).
  const envCode = getPassbookCampaignCodeFromEnv();
  if (envCode && !isPassbookChannelOpenLocally(campaignCode)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: PASSBOOK_GENERIC_ERROR } },
      { status: 403 },
    );
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";

  try {
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

    const result = await gasClient.passbook.verify({
      campaign_code: campaignCode,
      name,
      id_number: idNumber,
      phone_last4: phoneLast4,
      client_ip: clientIp,
    });

    if (!result?.visitor_id) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: PASSBOOK_GENERIC_ERROR } },
        { status: 403 },
      );
    }

    const response = NextResponse.json({
      data: {
        visitorId: result.visitor_id,
        name: result.name ?? name,
        deadline: result.deadline ?? getPassbookDeadlineFromEnv(),
      },
    });
    return setPassbookSessionCookie(response, {
      visitorId: String(result.visitor_id),
      campaignCode,
      name: String(result.name ?? name),
    });
  } catch (error) {
    const message =
      error instanceof GasApiError ? error.message : PASSBOOK_GENERIC_ERROR;
    // Always generic for verify failures that look like auth denials.
    const safe =
      /無法確認|通道已關閉|FORBIDDEN|NOT_FOUND/i.test(message) ||
      (error instanceof GasApiError && error.code === "FORBIDDEN")
        ? PASSBOOK_GENERIC_ERROR
        : message;
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: safe } },
      { status: 403 },
    );
  }
}
