import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireOwnerOrManagerCapability } from "@/lib/api/authorization";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import {
  isMohwProgressOutcome,
  type MohwProgressMarkPatch,
} from "@/lib/domain/mohw-progress";
import { gasClient } from "@/lib/gas-client";

type PatchBody = {
  patches?: MohwProgressMarkPatch[];
  note?: string;
  correction_note?: string;
  dry_run?: boolean;
};

function sanitizePatch(raw: MohwProgressMarkPatch): Record<string, unknown> | null {
  const markId = String(raw?.mark_id || "").trim();
  if (!markId) return null;
  const patch: Record<string, unknown> = { mark_id: markId };

  if (Object.prototype.hasOwnProperty.call(raw, "outcome")) {
    const outcome = String(raw.outcome || "").trim();
    if (!isMohwProgressOutcome(outcome)) return null;
    patch.outcome = outcome;
  }
  if (Object.prototype.hasOwnProperty.call(raw, "civil_worker_id")) {
    patch.civil_worker_id = String(raw.civil_worker_id || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(raw, "civil_worker_name")) {
    patch.civil_worker_name = String(raw.civil_worker_name || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(raw, "social_worker_id")) {
    patch.social_worker_id = String(raw.social_worker_id || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(raw, "social_worker_name")) {
    patch.social_worker_name = String(raw.social_worker_name || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(raw, "keyed_by_id")) {
    patch.keyed_by_id = String(raw.keyed_by_id || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(raw, "keyed_by_name")) {
    patch.keyed_by_name = String(raw.keyed_by_name || "").trim();
  }

  const keys = Object.keys(patch).filter((key) => key !== "mark_id");
  if (!keys.length) return null;
  return patch;
}

export async function POST(request: NextRequest) {
  const forbidden = requireOwnerOrManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  try {
    const body = (await request.json()) as PatchBody;
    const rawPatches = Array.isArray(body.patches) ? body.patches : [];
    if (!rawPatches.length) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "patches 不可為空" } },
        { status: 400 },
      );
    }

    const patches: Record<string, unknown>[] = [];
    const invalid: string[] = [];
    for (const raw of rawPatches) {
      const patch = sanitizePatch(raw);
      if (!patch) {
        invalid.push(String(raw?.mark_id || "").trim() || "(缺 mark_id)");
        continue;
      }
      patches.push(patch);
    }

    if (!patches.length) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "沒有有效的修正內容",
            invalid,
          },
        },
        { status: 400 },
      );
    }

    if (body.dry_run) {
      return NextResponse.json({
        data: {
          dry_run: true,
          would_update: patches.length,
          invalid_count: invalid.length,
          invalid,
          patches,
        },
      });
    }

    const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
    const roleKey = getRoleKey(request);
    const correctedBy =
      manager?.name ||
      manager?.email ||
      String(request.cookies.get("demo_name")?.value || "").trim() ||
      String(request.cookies.get("demo_email")?.value || "").trim() ||
      roleKey;

    const note = String(body.note || body.correction_note || "").trim();
    const result = await gasClient.mohwProgress.patchMarks({
      patches,
      corrected_by: correctedBy,
      note,
    });

    return NextResponse.json({
      data: {
        ...result,
        invalid_count: invalid.length,
        invalid,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "修正寫入失敗";
    return NextResponse.json({ error: { code: "GAS_WRITE_FAILED", message } }, { status: 502 });
  }
}
