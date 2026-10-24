import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import {
  isActiveAssignmentStatus,
  MANAGER_DESK_NOTE,
  toDeskElderCase,
  toDeskSchedule,
  type DeskPrepareInput,
} from "@/lib/domain/manager-care-form-desk";
import { gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

export async function POST(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const body = (await request.json()) as DeskPrepareInput;
  const visitorId = String(body.visitorId ?? "").trim();
  const visitDate = String(body.visitDate ?? "").trim();

  if (!visitorId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請指定訪員。" } },
      { status: 400 },
    );
  }
  if (!visitDate) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請填訪視日期。" } },
      { status: 400 },
    );
  }

  try {
    let caseRow: Record<string, unknown> | null = null;
    if (body.caseId) {
      caseRow = (await gasClient.cases.get(body.caseId)) as Record<string, unknown> | null;
    } else if (body.newCase?.name?.trim()) {
      const created = await gasClient.cases.create({
        name: body.newCase.name.trim(),
        id_number: body.newCase.idNumber?.trim() ?? "",
        gender: body.newCase.gender?.trim() ?? "",
        birth_date: body.newCase.birthDate?.trim() ?? "",
        visit_village: body.newCase.village?.trim() ?? "",
        household_village: body.newCase.village?.trim() ?? "",
        address: body.newCase.address?.trim() ?? "",
        primary_phone: body.newCase.phone?.trim() ?? "",
        secondary_phone: body.newCase.mobile?.trim() ?? "",
        visit_district: "永和區",
        household_district: "永和區",
        case_type: "獨老",
        contact_note: MANAGER_DESK_NOTE,
      });
      caseRow = created;
    }

    if (!caseRow || !caseRow.case_id) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "請選擇個案，或自己填入新個案資料。" } },
        { status: 400 },
      );
    }

    const caseId = String(caseRow.case_id);
    const assignments = (await gasClient.assignments.list()) as Record<string, unknown>[];
    const forCase = assignments.filter((row) => String(row.case_id ?? "") === caseId);
    const active = forCase.filter((row) => isActiveAssignmentStatus(String(row.status ?? "")));

    if (active.length > 0) {
      const sameVisitor = active.find((row) => String(row.visitor_id ?? "") === visitorId);
      if (!sameVisitor) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: `此個案已有進行中的派案（${String(active[0].assignment_id)}），請改選原訪員或先結束該派案。`,
            },
          },
          { status: 409 },
        );
      }
      const elderCase = toDeskElderCase(caseRow);
      return NextResponse.json({
        data: {
          reused: true,
          assignmentId: String(sameVisitor.assignment_id),
          elderCase,
          schedule: toDeskSchedule(sameVisitor, visitDate),
          visitStartTime: body.visitStartTime ?? "",
          visitEndTime: body.visitEndTime ?? "",
        },
      });
    }

    const saved = (await gasClient.assignments.dispatch({
      case_id: caseId,
      visitor_id: visitorId,
      due_date: visitDate,
      notes: MANAGER_DESK_NOTE,
      auto_confirm: true,
    })) as Record<string, unknown>;
    invalidateGasReadCaches();

    const latestCase = ((await gasClient.cases.get(caseId)) as Record<string, unknown> | null) ?? caseRow;
    return NextResponse.json({
      data: {
        reused: false,
        assignmentId: String(saved.assignment_id ?? ""),
        elderCase: toDeskElderCase(latestCase),
        schedule: toDeskSchedule(saved, visitDate),
        visitStartTime: body.visitStartTime ?? "",
        visitEndTime: body.visitEndTime ?? "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法建立代填派案";
    return NextResponse.json({ error: { code: "GAS_PREPARE_FAILED", message } }, { status: 502 });
  }
}
