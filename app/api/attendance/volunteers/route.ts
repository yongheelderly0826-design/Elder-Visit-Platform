import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasErrorResponse } from "@/lib/attendance/session";
import { mapGasVolunteer } from "@/lib/domain/gas-attendance";
import { mockCreateVolunteer, mockListVolunteers } from "@/lib/domain/volunteer-attendance-mock";
import { extractTaiwanId, getVolunteerGroup } from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "attendance.manage");
  if (forbidden) return forbidden;

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const rows = (await gasClient.visitors.list()) as Array<Record<string, unknown>>;
      const items = rows.map(mapGasVolunteer).filter(Boolean);
      return NextResponse.json({ data: { mode: "gas", items } });
    }
    return NextResponse.json({ data: { mode: "demo", items: mockListVolunteers() } });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "讀取志工名冊失敗");
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "attendance.manage");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    name?: string;
    idNumber?: string;
    phone?: string;
    groupId?: string;
  };
  const name = body.name?.trim() ?? "";
  const idNumber = extractTaiwanId(body.idNumber);
  const phone = body.phone?.trim() ?? "";
  const groupId = body.groupId?.trim() ?? "";
  const group = getVolunteerGroup(groupId);

  if (!name || !idNumber || !phone || !group) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "請填姓名、身分證、電話與組別" } },
      { status: 400 },
    );
  }

  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const created = (await gasClient.visitors.create({
        name,
        id_number: idNumber,
        phone,
        volunteer_group: groupId,
        status: "已核准",
      })) as Record<string, unknown>;
      try {
        await gasClient.visitors.approve({ visitor_id: created.visitor_id });
      } catch {
        // 已帶 已核准 也可出勤
      }
      return NextResponse.json({
        data: { mode: "gas", volunteer: mapGasVolunteer(created) },
      });
    }

    return NextResponse.json({
      data: {
        mode: "demo",
        volunteer: mockCreateVolunteer({ name, idNumber, phone, groupId }),
      },
    });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "新增志工失敗");
  }
}
