import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { buildDeskAssignmentNotes } from "@/lib/domain/desk-care-batch";
import {
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
  const companionVisitorIds = [
    ...new Set(
      (body.companionVisitorIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter((id) => id && id !== visitorId),
    ),
  ];
  const visitDate = String(body.visitDate ?? "").trim();
  const caseIds = [
    ...new Set(
      [
        ...(body.caseIds ?? []).map((id) => String(id ?? "").trim()),
        String(body.caseId ?? "").trim(),
      ].filter(Boolean),
    ),
  ];

  if (!visitorId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請指定主填表訪查員。" } },
      { status: 400 },
    );
  }

  try {
    const visitorRows = ((await gasClient.visitors.list({ slim: true })) as Record<
      string,
      unknown
    >[]) ?? [];
    const nameById = new Map(
      visitorRows.map((row) => [
        String(row.visitor_id ?? ""),
        String(row.name ?? row.full_name ?? ""),
      ]),
    );
    const notes = buildDeskAssignmentNotes({
      primaryVisitorId: visitorId,
      primaryVisitorName: nameById.get(visitorId) || "",
      companionVisitorIds,
      companionNames: Object.fromEntries(
        companionVisitorIds.map((id) => [id, nameById.get(id) || ""]),
      ),
      visitDate: visitDate || undefined,
      visitStartTime: body.visitStartTime,
      visitEndTime: body.visitEndTime,
    });

    const preparedCaseIds: string[] = [...caseIds];
    if (!preparedCaseIds.length && body.newCase?.name?.trim()) {
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
      const createdId = String(created.case_id ?? "");
      if (!createdId) {
        return NextResponse.json(
          { error: { code: "VALIDATION", message: "新增個案失敗。" } },
          { status: 400 },
        );
      }
      preparedCaseIds.push(createdId);
    }

    if (!preparedCaseIds.length) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "請至少選擇一位個案。" } },
        { status: 400 },
      );
    }

    const items: Array<{
      caseId: string;
      caseName: string;
      caseCode: string;
      assignmentId: string;
      visitAttempt: number;
      elderCase: ReturnType<typeof toDeskElderCase>;
      schedule: ReturnType<typeof toDeskSchedule>;
    }> = [];

    for (const caseId of preparedCaseIds) {
      const caseRow = (await gasClient.cases.get(caseId)) as Record<string, unknown> | null;
      if (!caseRow?.case_id) {
        return NextResponse.json(
          { error: { code: "VALIDATION", message: `找不到個案 ${caseId}` } },
          { status: 400 },
        );
      }

      const saved = (await gasClient.assignments.dispatch({
        case_id: caseId,
        visitor_id: visitorId,
        due_date: visitDate || undefined,
        notes,
        auto_confirm: true,
        allow_multi_active: true,
      })) as Record<string, unknown>;

      const latestCase =
        ((await gasClient.cases.get(caseId)) as Record<string, unknown> | null) ?? caseRow;
      items.push({
        caseId,
        caseName: String(latestCase.name ?? ""),
        caseCode: String(latestCase.encoded_id ?? latestCase.external_id ?? caseId),
        assignmentId: String(saved.assignment_id ?? ""),
        visitAttempt: Number(saved.visit_attempt ?? 1) || 1,
        elderCase: toDeskElderCase(latestCase),
        schedule: toDeskSchedule(saved, visitDate || new Date().toISOString().slice(0, 10)),
      });
    }

    invalidateGasReadCaches();

    const first = items[0];
    return NextResponse.json({
      data: {
        reused: false,
        batch: true,
        count: items.length,
        items,
        // 相容舊版單案回應
        assignmentId: first?.assignmentId ?? "",
        visitAttempt: first?.visitAttempt ?? 1,
        elderCase: first?.elderCase,
        schedule: first?.schedule,
        visitStartTime: body.visitStartTime ?? "",
        visitEndTime: body.visitEndTime ?? "",
        primaryVisitorId: visitorId,
        companionVisitorIds,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法建立代填派案";
    return NextResponse.json({ error: { code: "GAS_PREPARE_FAILED", message } }, { status: 502 });
  }
}
