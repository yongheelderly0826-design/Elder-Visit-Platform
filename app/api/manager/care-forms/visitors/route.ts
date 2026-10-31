import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import {
  validateDeskVisitorCreate,
  validateDeskVisitorUpdate,
} from "@/lib/domain/desk-visitor-create";
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
    gender?: string;
    workerGroup?: string;
    departmentName?: string;
    departmentOther?: string;
    jobTitle?: string;
    photoUrl?: string;
  };

  const action = body.action === "update" ? "update" : "create";

  try {
    if (action === "update") {
      const visitorId = String(body.visitorId ?? "").trim();
      if (!visitorId) {
        return NextResponse.json(
          { error: { code: "VALIDATION", message: "缺少訪查員編號。" } },
          { status: 400 },
        );
      }
      const validated = validateDeskVisitorUpdate(body);
      if ("error" in validated) {
        return NextResponse.json(
          { error: { code: "VALIDATION", message: validated.error } },
          { status: 400 },
        );
      }
      const { data } = validated;
      const updated = (await gasClient.visitors.update({
        visitor_id: visitorId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        id_number: data.idNumber,
        gender: data.gender,
        department: data.department,
        volunteer_group: data.workerGroup,
        job_title: data.jobTitle,
      })) as Record<string, unknown>;
      invalidateGasReadCaches();
      return NextResponse.json({ data: mapDeskVisitor(updated) });
    }

    const validated = validateDeskVisitorCreate(body);
    if ("error" in validated) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: validated.error } },
        { status: 400 },
      );
    }
    const { data } = validated;

    const created = (await gasClient.visitors.create({
      name: data.name,
      phone: data.phone,
      email: data.email,
      id_number: data.idNumber,
      gender: data.gender,
      department: data.department,
      volunteer_group: data.workerGroup,
      job_title: data.jobTitle,
      photo_url: data.photoUrl,
      // Keep auto-approve for KEY ops; still require full registration fields (no empty id).
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
