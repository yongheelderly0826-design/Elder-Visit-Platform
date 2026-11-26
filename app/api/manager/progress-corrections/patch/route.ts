import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireOwnerOrManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { GasApiError, gasClient } from "@/lib/gas-client";

const OUTCOMES = new Set(["已完成", "未遇", "拒訪", "住址不詳"]);

export async function POST(request: NextRequest) {
  const forbidden = requireOwnerOrManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const manager = decodeManagerSession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  const body = (await request.json()) as {
    source?: string;
    patches?: Array<Record<string, unknown>>;
    note?: string;
    dry_run?: boolean;
  };

  const source = String(body.source ?? "").trim();
  if (source !== "careform" && source !== "index") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "source 需為 careform 或 index" } },
      { status: 400 },
    );
  }

  const patches = Array.isArray(body.patches) ? body.patches : [];
  if (!patches.length) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "patches 不可為空" } },
      { status: 400 },
    );
  }

  for (const patch of patches) {
    if (patch.outcome != null && !OUTCOMES.has(String(patch.outcome))) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "狀態無效" } },
        { status: 400 },
      );
    }
  }

  if (body.dry_run) {
    return NextResponse.json({
      data: { would_update: patches.length, source },
    });
  }

  try {
    const result = await gasClient.progressCorrections.patchRows({
      source,
      patches,
      note: String(body.note ?? "").trim(),
      corrected_by:
        manager?.email ||
        String(request.cookies.get("demo_role")?.value ?? "manager"),
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const message =
      error instanceof GasApiError ? error.message : "寫入失敗，請稍後再試。";
    const status =
      error instanceof GasApiError && error.code === "VALIDATION_ERROR"
        ? 400
        : 502;
    return NextResponse.json(
      {
        error: {
          code: error instanceof GasApiError ? error.code : "PATCH_FAILED",
          message,
        },
      },
      { status },
    );
  }
}
