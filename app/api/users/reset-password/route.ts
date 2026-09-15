import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueGasPasswordLink } from "@/lib/domain/user-management";
import { getRuntimeEnvValue, hasRuntimeEnvValue } from "@/lib/runtime/env";

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "users.manage");
  if (forbidden) return forbidden;

  const body = (await request.json()) as { requestId?: string };
  const requestId = body.requestId?.trim();

  if (!requestId) {
    return NextResponse.json(
      { error: { code: "MISSING_REQUEST_ID", message: "缺少訪員註冊申請編號。" } },
      { status: 400 },
    );
  }

  try {
    const useSupabase =
      getRuntimeEnvValue("USER_MANAGEMENT_BACKEND") === "supabase" &&
      hasRuntimeEnvValue("NEXT_PUBLIC_SUPABASE_URL") &&
      hasRuntimeEnvValue("SUPABASE_SERVICE_ROLE_KEY");
    if (!useSupabase) {
      const result = await issueGasPasswordLink(requestId, request.nextUrl.origin, "recovery");
      return NextResponse.json({
        data: {
          requestId,
          email: result.email,
          message: result.message,
          nextStep: result.nextStep,
          setupUrl: result.setupUrl,
          expiresAt: result.expiresAt,
        },
      });
    }

    const supabase = createAdminClient();
    const { data: registration, error } = await (supabase as unknown as PasswordResetLookupClient)
      .from("workspace_registration_requests")
      .select("id, email, full_name, status, auth_invite_status")
      .eq("id", requestId)
      .single();

    if (error || !registration) {
      return NextResponse.json(
        { error: { code: "REGISTRATION_NOT_FOUND", message: "找不到這位訪員的帳號資料。" } },
        { status: 404 },
      );
    }

    if (registration.status !== "approved" || registration.auth_invite_status !== "activated") {
      return NextResponse.json(
        {
          error: {
            code: "ACCOUNT_NOT_ACTIVATED",
            message: "此訪員帳號尚未啟用，請先發送或重寄登入邀請。",
          },
        },
        { status: 409 },
      );
    }

    const redirectTo = new URL("/login?invited=1", request.nextUrl.origin).toString();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(registration.email, {
      redirectTo,
    });

    if (resetError) {
      return NextResponse.json(
        {
          error: {
            code: "RESET_EMAIL_FAILED",
            message: "重設密碼信寄送失敗，請稍後再試。",
          },
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      data: {
        requestId,
        email: registration.email,
        message: `已寄送重設密碼信到 ${registration.email}。`,
        nextStep: "請訪員開啟信件連結並設定至少 8 個字元的新密碼。",
      },
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error: {
          code: "RESET_PASSWORD_FAILED",
          message: cause instanceof Error ? cause.message : "目前無法產生重設密碼連結，請稍後再試。",
        },
      },
      { status: 500 },
    );
  }
}

type PasswordResetLookupClient = {
  from(table: "workspace_registration_requests"): {
    select(query: string): {
      eq(column: "id", value: string): {
        single(): Promise<{
          data: {
            id: string;
            email: string;
            full_name: string;
            status: string;
            auth_invite_status: string;
          } | null;
          error: unknown;
        }>;
      };
    };
  };
};
