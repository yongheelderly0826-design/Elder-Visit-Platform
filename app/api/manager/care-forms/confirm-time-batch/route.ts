import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import {
  buildDeskAssignmentNotes,
  deskStaleAssignmentMessage,
  findOverlappingWindow,
  parseAssignmentNotFoundId,
  type DeskVisitWindow,
} from "@/lib/domain/desk-care-batch";
import { collectVisitorWindowsForDate } from "@/lib/domain/desk-visit-time-audit";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

type BatchConfirmItem = {
  assignmentId?: string;
  caseId?: string;
  caseLabel?: string;
  visitDate?: string;
  visitStartTime?: string;
  visitEndTime?: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function toMinutesSafe(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export async function POST(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    primaryVisitorId?: string;
    companionVisitorIds?: string[];
    items?: BatchConfirmItem[];
  };

  const primaryVisitorId = text(body.primaryVisitorId);
  const companionVisitorIds = [
    ...new Set(
      (body.companionVisitorIds ?? [])
        .map((id) => text(id))
        .filter((id) => id && id !== primaryVisitorId),
    ),
  ];
  const teamIds = [primaryVisitorId, ...companionVisitorIds];
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (!primaryVisitorId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "缺少主填表訪查員。" } },
      { status: 400 },
    );
  }
  if (!rawItems.length) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "沒有可套用的派案。" } },
      { status: 400 },
    );
  }

  const planned: DeskVisitWindow[] = [];
  for (const row of rawItems) {
    const assignmentId = text(row.assignmentId);
    const visitDate = text(row.visitDate).slice(0, 10);
    const start = text(row.visitStartTime).slice(0, 5);
    const end = text(row.visitEndTime).slice(0, 5);
    const label = text(row.caseLabel) || text(row.caseId) || assignmentId;
    if (!assignmentId || !visitDate || !start || !end) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: `「${label || "未命名"}」時段不完整。` } },
        { status: 400 },
      );
    }
    const startMin = toMinutesSafe(start);
    const endMin = toMinutesSafe(end);
    if (startMin == null || endMin == null || endMin <= startMin) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION",
            message: `「${label}」結束時間必須晚於開始時間。`,
          },
        },
        { status: 400 },
      );
    }
    planned.push({
      assignmentId,
      caseId: text(row.caseId),
      label,
      visitDate,
      start,
      end,
      visitorIds: teamIds,
    });
  }

  const visitDates = [...new Set(planned.map((item) => item.visitDate))];
  const existing: DeskVisitWindow[] = [];
  for (const visitDate of visitDates) {
    const windows = await collectVisitorWindowsForDate({
      visitorIds: teamIds,
      visitDate,
    });
    existing.push(...windows);
  }

  for (const candidate of planned) {
    const siblings = planned.filter((item) => item.assignmentId !== candidate.assignmentId);
    const external = existing.filter((item) => item.assignmentId !== candidate.assignmentId);
    const hit = findOverlappingWindow(candidate, [...external, ...siblings]);
    if (hit) {
      return NextResponse.json(
        {
          error: {
            code: "TIME_CONFLICT",
            message: `「${candidate.label}」時段與「${hit.label}」（${hit.visitDate} ${hit.start}–${hit.end}）衝突，同一批訪查員不可重疊，以免核銷重複。`,
          },
        },
        { status: 409 },
      );
    }
  }

  try {
    const visitorRows =
      ((await gasClient.visitors.list({ slim: true })) as Record<string, unknown>[]) ?? [];
    const nameById = new Map(
      visitorRows.map((row) => [
        text(row.visitor_id),
        text(row.name ?? row.full_name),
      ]),
    );

    const confirmed: Array<{
      assignmentId: string;
      caseId: string;
      visitDate: string;
      visitStartTime: string;
      visitEndTime: string;
    }> = [];

    for (const item of planned) {
      const notes = buildDeskAssignmentNotes({
        primaryVisitorId,
        primaryVisitorName: nameById.get(primaryVisitorId) || "",
        companionVisitorIds,
        companionNames: Object.fromEntries(
          companionVisitorIds.map((id) => [id, nameById.get(id) || ""]),
        ),
        visitDate: item.visitDate,
        visitStartTime: item.start,
        visitEndTime: item.end,
      });

      await gasClient.assignments.confirm({
        assignment_id: item.assignmentId,
        status: "進行中",
        notes,
        due_date: item.visitDate,
      });

      confirmed.push({
        assignmentId: item.assignmentId!,
        caseId: item.caseId || "",
        visitDate: item.visitDate,
        visitStartTime: item.start,
        visitEndTime: item.end,
      });
    }

    invalidateGasReadCaches();

    return NextResponse.json({
      data: {
        ok: true,
        items: confirmed,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法寫入訪視時段";
    const missingId = parseAssignmentNotFoundId(message);
    if (
      missingId ||
      (error instanceof GasApiError &&
        error.code === "NOT_FOUND" &&
        /Assignment not found/i.test(message))
    ) {
      return NextResponse.json(
        {
          error: {
            code: "ASSIGNMENT_NOT_FOUND",
            message: deskStaleAssignmentMessage(missingId || undefined),
            assignmentId: missingId || undefined,
          },
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: { code: "GAS_CONFIRM_FAILED", message } }, { status: 502 });
  }
}
