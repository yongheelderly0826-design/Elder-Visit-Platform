import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import {
  buildDeskAssignmentNotes,
  buildMissedDeskPaperSupplementPlan,
  DESK_PAPER_SOURCE_NOTE,
  isDeskPaperAssignmentNotes,
  normalizeDeskVisitDateToIso,
} from "@/lib/domain/desk-care-batch";
import { gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

type ExpandBody = {
  assignmentId?: string;
  caseId?: string;
  caseName?: string;
  caseCode?: string;
  visitDate?: string;
  primaryVisitorId?: string;
  companionVisitorIds?: string[];
  visitorName?: string;
  companionNames?: Record<string, string>;
};

type DeskAssignmentRow = Record<string, unknown>;

function deskPaperCountForCase(rows: DeskAssignmentRow[], caseId: string) {
  return rows.filter(
    (row) =>
      String(row.case_id ?? "").trim() === caseId &&
      isDeskPaperAssignmentNotes(row.notes),
  ).length;
}

export async function POST(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const body = (await request.json()) as ExpandBody;
  const assignmentId = String(body.assignmentId ?? "").trim();
  const caseId = String(body.caseId ?? "").trim();
  const primaryVisitorId = String(body.primaryVisitorId ?? "").trim();
  const companionVisitorIds = [
    ...new Set(
      (body.companionVisitorIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter((id) => id && id !== primaryVisitorId),
    ),
  ];
  const visitDateIso = normalizeDeskVisitDateToIso(body.visitDate);

  if (!assignmentId || !caseId || !primaryVisitorId || !visitDateIso) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "缺少派案、個案、主填表人或訪視日期。",
        },
      },
      { status: 400 },
    );
  }

  const plan = buildMissedDeskPaperSupplementPlan(visitDateIso);
  if (!plan.ok) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: plan.message } },
      { status: 400 },
    );
  }

  try {
    const allAssignments = ((await gasClient.assignments.list()) as DeskAssignmentRow[]) ?? [];
    const existingDeskCount = deskPaperCountForCase(allAssignments, caseId);
    if (existingDeskCount >= 3) {
      const existingExtras = allAssignments
        .filter(
          (row) =>
            String(row.case_id ?? "").trim() === caseId &&
            isDeskPaperAssignmentNotes(row.notes) &&
            String(row.assignment_id ?? "") !== assignmentId,
        )
        .map((row) => {
          const due = String(row.due_date ?? "").slice(0, 10);
          const match = plan.items.find(
            (item) => !item.isSubmittedPaper && item.visitDate === due,
          );
          return {
            caseId,
            caseName: String(body.caseName ?? row.elder_name ?? caseId),
            caseCode: String(body.caseCode ?? row.encoded_id ?? caseId),
            assignmentId: String(row.assignment_id ?? ""),
            visitDate: match?.visitDate || due,
            visitStartTime: match?.visitStartTime || "",
            visitEndTime: match?.visitEndTime || "",
            missedSlot: match?.missedSlot || "",
            paperKey: match?.paperKey || "",
            attempt: match?.attempt ?? 0,
            status: String(row.status ?? ""),
          };
        })
        .filter((item) => item.assignmentId)
        .sort((a, b) => a.visitDate.localeCompare(b.visitDate));

      return NextResponse.json({
        data: {
          created: false,
          skipped: true,
          reason: "already_has_three_desk_papers",
          late: {
            assignmentId,
            visitDate: plan.lateDate,
            visitStartTime: plan.items[2].visitStartTime,
            visitEndTime: plan.items[2].visitEndTime,
            missedSlot: plan.items[2].missedSlot,
            paperKey: plan.items[2].paperKey,
            attempt: 3,
          },
          createdItems: existingExtras.filter(
            (item) =>
              String(item.status) === "待接案" ||
              String(item.status) === "進行中" ||
              String(item.status) === "空訪續訪",
          ),
        },
      });
    }

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
      primaryName = primaryName || nameById.get(primaryVisitorId) || "";
      companionNames = Object.fromEntries(
        companionVisitorIds.map((id) => [id, companionNames[id] || nameById.get(id) || ""]),
      );
    }

    const late = plan.items.find((item) => item.isSubmittedPaper)!;
    const lateNotes = buildDeskAssignmentNotes({
      primaryVisitorId,
      primaryVisitorName: primaryName,
      companionVisitorIds,
      companionNames,
      visitDate: late.visitDate,
      visitStartTime: late.visitStartTime,
      visitEndTime: late.visitEndTime,
      source: "desk_paper",
    });

    const currentAssignment = (await gasClient.assignments.get(assignmentId)) as DeskAssignmentRow | null;
    const preserveStatus = String(currentAssignment?.status ?? "").trim();
    await gasClient.assignments.confirm({
      assignment_id: assignmentId,
      // 送出後可能已是空訪／已完成；不可被 confirm 預設「進行中」蓋掉
      status: preserveStatus || "進行中",
      notes: `${lateNotes}｜未遇次:${late.attempt}｜紙本時段:${late.paperKey}`,
      due_date: late.visitDate,
    });

    const toCreate = plan.items.filter((item) => !item.isSubmittedPaper);
    const createdItems: Array<{
      caseId: string;
      caseName: string;
      caseCode: string;
      assignmentId: string;
      visitDate: string;
      visitStartTime: string;
      visitEndTime: string;
      missedSlot: string;
      paperKey: string;
      attempt: number;
    }> = [];

    for (const item of toCreate) {
      const notes = buildDeskAssignmentNotes({
        primaryVisitorId,
        primaryVisitorName: primaryName,
        companionVisitorIds,
        companionNames,
        visitDate: item.visitDate,
        visitStartTime: item.visitStartTime,
        visitEndTime: item.visitEndTime,
        source: "desk_paper",
      });
      const saved = (await gasClient.assignments.dispatch({
        case_id: caseId,
        visitor_id: primaryVisitorId,
        due_date: item.visitDate,
        notes: `${notes}｜未遇次:${item.attempt}｜紙本時段:${item.paperKey}`,
        auto_confirm: true,
        allow_multi_active: true,
      })) as Record<string, unknown>;

      const newAssignmentId = String(saved.assignment_id ?? "");
      if (!newAssignmentId) {
        throw new Error("未遇補件派案未回傳 assignment_id");
      }

      await gasClient.assignments.confirm({
        assignment_id: newAssignmentId,
        status: "進行中",
        notes: `${notes}｜未遇次:${item.attempt}｜紙本時段:${item.paperKey}`,
        due_date: item.visitDate,
      });

      createdItems.push({
        caseId,
        caseName:
          String(body.caseName ?? "").trim() ||
          String(saved.elder_name ?? "") ||
          caseId,
        caseCode:
          String(body.caseCode ?? "").trim() ||
          String(saved.encoded_id ?? "") ||
          caseId,
        assignmentId: newAssignmentId,
        visitDate: item.visitDate,
        visitStartTime: item.visitStartTime,
        visitEndTime: item.visitEndTime,
        missedSlot: item.missedSlot,
        paperKey: item.paperKey,
        attempt: item.attempt,
      });
    }

    invalidateGasReadCaches();

    return NextResponse.json({
      data: {
        created: true,
        skipped: false,
        sourceNote: DESK_PAPER_SOURCE_NOTE,
        late: {
          assignmentId,
          visitDate: late.visitDate,
          visitStartTime: late.visitStartTime,
          visitEndTime: late.visitEndTime,
          missedSlot: late.missedSlot,
          paperKey: late.paperKey,
          attempt: late.attempt,
        },
        createdItems,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法建立未遇紙本補件";
    return NextResponse.json(
      { error: { code: "GAS_EXPAND_MISSED_FAILED", message } },
      { status: 502 },
    );
  }
}
