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

    // 單次 GAS dispatchBatch：一次鎖 + appendRows + flush，避免 10 案逐筆卡在「準備中」
    const batchResult = (await gasClient.assignments.dispatchBatch({
      visitor_id: visitorId,
      case_ids: caseRefs.map((ref) => ref.caseId),
      due_date: visitDate || undefined,
      notes,
      auto_confirm: true,
      allow_multi_active: true,
    })) as { items?: Record<string, unknown>[]; count?: number };

    const savedRows = Array.isArray(batchResult?.items) ? batchResult.items : [];
    if (!savedRows.length) {
      throw new Error("批次派案未回傳任何編號，請重試準備派案。");
    }

    const refByCaseId = new Map(caseRefs.map((ref) => [ref.caseId, ref]));
    const items = savedRows.map((saved) => {
      const caseId = String(saved.case_id ?? "").trim();
      const ref = refByCaseId.get(caseId);
      const assignmentId = String(saved.assignment_id ?? "").trim();
      if (!assignmentId || !caseId) {
        throw new Error("批次派案回傳缺 assignment_id／case_id，請重試。");
      }
      const caseName =
        ref?.caseName || String(saved.elder_name ?? "") || caseId;
      const caseCode =
        ref?.caseCode || String(saved.encoded_id ?? "") || caseId;
      return {
        caseId,
        caseName,
        caseCode,
        assignmentId,
        visitAttempt: Number(saved.visit_attempt ?? 1) || 1,
        schedule: toDeskSchedule(saved, due),
      };
    });

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
