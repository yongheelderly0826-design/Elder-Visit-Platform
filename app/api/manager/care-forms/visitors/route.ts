import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { mapDeskVisitor } from "@/lib/domain/manager-care-form-desk";
import { visitorRegistrationJobTitles } from "@/lib/domain/visitor-registration-options";
import { gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

const ALLOWED_JOB_TITLES = new Set<string>(visitorRegistrationJobTitles);

function normalizeJobTitle(raw: unknown): string {
  const title = String(raw ?? "").trim();
  if (!title) return "";
  return ALLOWED_JOB_TITLES.has(title) ? title : title.slice(0, 20);
}

export async function POST(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    action?: "create" | "update";
    visitorId?: string;
    name?: string;
    phone?: string;
    email?: string;
    idNumber?: string;
    workerGroup?: string;
    jobTitle?: string;
  };

  const action = body.action === "update" ? "update" : "create";
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const workerGroup =
    body.workerGroup === "social_affairs" ? "social_affairs" : "civil_affairs";
  const jobTitle = normalizeJobTitle(body.jobTitle);

  if (!name || !phone) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: action === "update" ? "請填姓名與手機。" : "新增訪查員請填姓名與手機。",
        },
      },
      { status: 400 },
    );
  }

  try {
    if (action === "update") {
      const visitorId = String(body.visitorId ?? "").trim();
      if (!visitorId) {
        return NextResponse.json(
          { error: { code: "VALIDATION", message: "缺少訪查員編號。" } },
          { status: 400 },
        );
      }
      const updated = (await gasClient.visitors.update({
        visitor_id: visitorId,
        name,
        phone,
        email: String(body.email ?? "").trim().toLowerCase(),
        id_number: String(body.idNumber ?? "").trim().toUpperCase(),
        volunteer_group: workerGroup,
        job_title: jobTitle,
      })) as Record<string, unknown>;
      invalidateGasReadCaches();
      return NextResponse.json({ data: mapDeskVisitor(updated) });
    }

    const created = (await gasClient.visitors.create({
      name,
      phone,
      email: String(body.email ?? "").trim().toLowerCase(),
      id_number: String(body.idNumber ?? "").trim().toUpperCase(),
      volunteer_group: workerGroup,
      job_title: jobTitle || (workerGroup === "social_affairs" ? "志工" : "公所人員"),
      desk_minimal: true,
    })) as Record<string, unknown>;

    invalidateGasReadCaches();
    return NextResponse.json({ data: mapDeskVisitor(created) });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : action === "update"
          ? "無法更新訪查員"
          : "無法新增訪查員";
    return NextResponse.json(
      {
        error: {
          code: action === "update" ? "GAS_UPDATE_FAILED" : "GAS_CREATE_FAILED",
          message,
        },
      },
      { status: 502 },
    );
  }
}
