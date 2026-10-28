import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { mapDeskVisitor } from "@/lib/domain/manager-care-form-desk";
import { gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

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
  };

  const action = body.action === "update" ? "update" : "create";
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const workerGroup =
    body.workerGroup === "social_affairs" ? "social_affairs" : "civil_affairs";

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
