import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hashGasPassword, hashGasToken } from "@/lib/auth/gas-password";
import { GasApiError, gasClient } from "@/lib/gas-client";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      mode?: "invite" | "recovery";
      password?: string;
    };
    const token = body.token?.trim() ?? "";
    const password = body.password ?? "";
    const mode = body.mode === "recovery" ? "recovery" : "invite";

    if (!token) {
      return error("MISSING_TOKEN", "設定密碼連結缺少 token。", 400);
    }
    if (password.length < 8) {
      return error("WEAK_PASSWORD", "密碼至少需要 8 個字元。", 400);
    }

    const hashed = await hashGasPassword(password);
    const account = await gasClient.accounts.setPassword({
      mode,
      token_hash: hashGasToken(token),
      password_hash: hashed.passwordHash,
      password_salt: hashed.passwordSalt,
      password_params: hashed.passwordParams,
    });

    return NextResponse.json({
      data: {
        ok: true,
        email: account.email,
        message: mode === "recovery" ? "密碼已重設完成。" : "密碼已設定完成。",
      },
    });
  } catch (cause) {
    const message =
      cause instanceof GasApiError
        ? cause.message
        : "目前無法設定密碼，請稍後再試或請管理者重新產生連結。";
    const status =
      cause instanceof GasApiError &&
      (cause.code === "TOKEN_INVALID" || cause.code === "TOKEN_EXPIRED")
        ? 410
        : 500;
    return error(cause instanceof GasApiError ? cause.code : "GAS_PASSWORD_FAILED", message, status);
  }
}

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
