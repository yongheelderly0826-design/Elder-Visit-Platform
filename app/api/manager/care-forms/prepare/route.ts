import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { buildDeskAssignmentNotes } from "@/lib/domain/desk-care-batch";
import {
  MANAGER_DESK_NOTE,
  toDeskElderCase,
  toDeskSchedule,
  type DeskPrepareCaseRef,
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

  const caseRefs: DeskPrepareCaseRef[] = [];
  const seen = new Set<string>();
  for (const item of body.cases ?? []) {
    const caseId = String(item?.caseId ?? "").trim();
    if (!caseId || seen.has(caseId)) continue;
    seen.add(caseId);
    caseRefs.push({
      caseId,
      caseName: String(item.caseName ?? "").trim(),
      caseCode: String(item.caseCode ?? "").trim(),
    });
  }
  for (const id of [...(body.caseIds ?? []), body.caseId]) {
    const caseId = String(id ?? "").trim();
    if (!caseId || seen.has(caseId)) continue;
    seen.add(caseId);
    caseRefs.push({ caseId });
  }

  if (!visitorId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請指定主填表訪查員。" } },
      { status: 400 },
    );
  }

  try {
    // 前端已帶訪查員姓名時略過 visitors.list，省一輪 GAS
    let primaryName = String(body.visitorName ?? "").trim();
    let companionNames: Record<string, string> = { ...(body.companionNames ?? {}) };
    if (!primaryName || companionVisitorIds.some((id) => !companionNames[id])) {
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
      primaryName = primaryName || nameById.get(visitorId) || "";
      companionNames = Object.fromEntries(
        companionVisitorIds.map((id) => [id, companionNames[id] || nameById.get(id) || ""]),
      );
    }

    const notes = buildDeskAssignmentNotes({
      primaryVisitorId: visitorId,
      primaryVisitorName: primaryName,
      companionVisitorIds,
      companionNames,
      visitDate: visitDate || undefined,
      visitStartTime: body.visitStartTime,
      visitEndTime: body.visitEndTime,
      source: body.source === "field_self" ? "field_self" : "desk_paper",
    });

    if (!caseRefs.length && body.newCase?.name?.trim()) {
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
      caseRefs.push({
        caseId: createdId,
        caseName: String(created.name ?? body.newCase.name.trim()),
        caseCode: String(created.encoded_id ?? created.external_id ?? createdId),
      });
    }

    if (!caseRefs.length) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "請至少選擇一位個案。" } },
        { status: 400 },
      );
    }

    const due = visitDate || new Date().toISOString().slice(0, 10);
    const items: Array<{
      caseId: string;
      caseName: string;
      caseCode: string;
      assignmentId: string;
      visitAttempt: number;
      elderCase?: ReturnType<typeof toDeskElderCase>;
      schedule: ReturnType<typeof toDeskSchedule>;
    }> = [];

    // 每案只打一次 dispatch（不再前後各 cases.get）；多案平行派案縮短等待
    const settled = await Promise.all(
      caseRefs.map(async (ref) => {
        const saved = (await gasClient.assignments.dispatch({
          case_id: ref.caseId,
          visitor_id: visitorId,
          due_date: visitDate || undefined,
          notes,
          auto_confirm: true,
          allow_multi_active: true,
        })) as Record<string, unknown>;

        const assignmentId = String(saved.assignment_id ?? "").trim();
        if (!assignmentId) {
          throw new Error(`派案未回傳編號（個案 ${ref.caseId}），請重試準備派案。`);
        }
        const caseName =
          ref.caseName ||
          String(saved.elder_name ?? "") ||
          ref.caseId;
        const caseCode =
          ref.caseCode ||
          String(saved.encoded_id ?? "") ||
          ref.caseId;

        return {
          caseId: ref.caseId,
          caseName,
          caseCode,
          assignmentId,
          visitAttempt: Number(saved.visit_attempt ?? 1) || 1,
          schedule: toDeskSchedule(saved, due),
        };
      }),
    );
    items.push(...settled);

    invalidateGasReadCaches();

    const first = items[0];
    return NextResponse.json({
      data: {
        reused: false,
        batch: true,
        count: items.length,
        items,
        assignmentId: first?.assignmentId ?? "",
        visitAttempt: first?.visitAttempt ?? 1,
        elderCase: first
          ? toDeskElderCase({
              case_id: first.caseId,
              name: first.caseName,
              encoded_id: first.caseCode,
            })
          : undefined,
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
