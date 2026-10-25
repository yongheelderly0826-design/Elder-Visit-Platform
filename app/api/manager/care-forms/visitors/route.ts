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
    name?: string;
    phone?: string;
    email?: string;
    idNumber?: string;
  };

  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!name || !phone) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "新增訪查員請填姓名與手機。" } },
      { status: 400 },
    );
  }

  try {
    const created = (await gasClient.visitors.create({
      name,
      phone,
      email: String(body.email ?? "").trim().toLowerCase(),
      id_number: String(body.idNumber ?? "").trim().toUpperCase(),
      desk_minimal: true,
    })) as Record<string, unknown>;

    invalidateGasReadCaches();
    return NextResponse.json({ data: mapDeskVisitor(created) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法新增訪查員";
    return NextResponse.json({ error: { code: "GAS_CREATE_FAILED", message } }, { status: 502 });
  }
}
