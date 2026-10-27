import { NextResponse } from "next/server";

/**
 * 共用通行碼已停用：改為 /yonghe 臨時登打帳號（TEMP-01～TEMP-20）。
 * 保留此路由避免舊書籤／快取呼叫炸裂。
 */
export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "DESK_SHARED_DISABLED",
        message: "共用通行碼已關閉。請使用臨時登打帳號（TEMP-xx）與通行碼登入。",
      },
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json({
    data: {
      enabled: false,
      mode: "desk-clerk",
      message: "請使用臨時登打帳號登入。",
    },
  });
}
