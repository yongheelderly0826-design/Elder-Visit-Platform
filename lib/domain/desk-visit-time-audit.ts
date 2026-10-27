import {
  DESK_BATCH_TRAVEL_GAP_MINUTES,
  DESK_NEXT_DAY_MORNING_START,
  addCalendarDaysIso,
  findOverlappingWindow,
  parseDeskAssignmentNotes,
  resolveNonOverlappingVisitSlot,
  teamIdsIntersect,
  type DeskVisitWindow,
  type ResolvedVisitSlot,
} from "@/lib/domain/desk-care-batch";
import { gasClient } from "@/lib/gas-client";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function datePart(value: unknown) {
  const match = text(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? "";
}

export async function collectVisitorWindowsForDate(input: {
  visitorIds: string[];
  visitDate: string;
  excludeAssignmentId?: string;
}): Promise<DeskVisitWindow[]> {
  const team = [...new Set(input.visitorIds.map((id) => text(id)).filter(Boolean))];
  const visitDate = datePart(input.visitDate);
  if (!team.length || !visitDate) return [];

  const assignments = ((await gasClient.assignments.list()) as Record<string, unknown>[]) ?? [];
  const windows: DeskVisitWindow[] = [];

  for (const row of assignments) {
    const assignmentId = text(row.assignment_id);
    if (!assignmentId) continue;
    if (input.excludeAssignmentId && assignmentId === input.excludeAssignmentId) continue;

    const notes = parseDeskAssignmentNotes(row.notes);
    if (!notes.visitDate || !notes.visitStartTime || !notes.visitEndTime) continue;
    if (notes.visitDate !== visitDate) continue;

    const rowTeam = [
      ...new Set(
        [
          text(row.visitor_id),
          notes.primaryVisitorId,
          ...notes.companionVisitorIds,
        ].filter(Boolean) as string[],
      ),
    ];
    if (!teamIdsIntersect(team, rowTeam)) continue;

    const label = `${text(row.encoded_id) || text(row.case_id) || assignmentId}`;
    windows.push({
      assignmentId,
      caseId: text(row.case_id),
      label: `派案 ${label}`,
      visitDate: notes.visitDate,
      start: notes.visitStartTime,
      end: notes.visitEndTime,
      visitorIds: rowTeam,
    });
  }

  return windows;
}

export async function auditDeskVisitTime(input: {
  visitorIds: string[];
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
  label: string;
  assignmentId?: string;
  caseId?: string;
  siblingWindows?: DeskVisitWindow[];
}) {
  const candidate: DeskVisitWindow = {
    visitorIds: [...new Set(input.visitorIds.filter(Boolean))],
    visitDate: datePart(input.visitDate),
    start: text(input.visitStartTime).slice(0, 5),
    end: text(input.visitEndTime).slice(0, 5),
    label: input.label,
    assignmentId: input.assignmentId,
    caseId: input.caseId,
  };

  if (!candidate.visitDate || !candidate.start || !candidate.end) {
    return { ok: false as const, message: "請完整填寫訪視日期與起迄時間。" };
  }
  if ((toMinutesSafe(candidate.start) ?? 0) >= (toMinutesSafe(candidate.end) ?? 0)) {
    return { ok: false as const, message: "結束時間必須晚於開始時間。" };
  }
  if (!candidate.visitorIds.length) {
    return { ok: false as const, message: "缺少訪查員，無法稽核時段。" };
  }

  const existing = await collectVisitorWindowsForDate({
    visitorIds: candidate.visitorIds,
    visitDate: candidate.visitDate,
    excludeAssignmentId: candidate.assignmentId,
  });
  const siblings = (input.siblingWindows ?? []).filter(
    (item) => !candidate.assignmentId || item.assignmentId !== candidate.assignmentId,
  );
  const hit = findOverlappingWindow(candidate, [...existing, ...siblings]);
  if (hit) {
    return {
      ok: false as const,
      message: `時段與「${hit.label}」（${hit.visitDate} ${hit.start}–${hit.end}）衝突，同一批訪查員不可重疊，以免核銷重複。`,
      conflict: hit,
    };
  }
  return { ok: true as const, candidate, checked: existing.length + siblings.length };
}

/**
 * 訪查員 KEY：與 audit 相同偵測；若重疊則把本案往後挪（時長＋移動間隔），
 * 當日溢出則隔日 09:00。供 visitor confirm-time 使用；場生紙本仍走嚴格 audit。
 */
export async function auditDeskVisitTimeAutoResolve(input: {
  visitorIds: string[];
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
  label: string;
  assignmentId?: string;
  caseId?: string;
  siblingWindows?: DeskVisitWindow[];
  travelGapMinutes?: number;
  morningStart?: string;
  maxDayHops?: number;
}): Promise<
  | {
      ok: true;
      candidate: DeskVisitWindow;
      slot: ResolvedVisitSlot;
      adjusted: boolean;
      message: string | null;
      checked: number;
    }
  | { ok: false; message: string }
> {
  const visitDate = datePart(input.visitDate);
  const visitStartTime = text(input.visitStartTime).slice(0, 5);
  const visitEndTime = text(input.visitEndTime).slice(0, 5);
  const visitorIds = [...new Set(input.visitorIds.map((id) => text(id)).filter(Boolean))];
  const maxDayHops = Math.max(1, Math.floor(input.maxDayHops ?? 14));
  const travelGap =
    input.travelGapMinutes == null
      ? DESK_BATCH_TRAVEL_GAP_MINUTES
      : Number(input.travelGapMinutes);
  const morningStart = text(input.morningStart) || DESK_NEXT_DAY_MORNING_START;

  const baseAudit = await auditDeskVisitTime({
    ...input,
    visitorIds,
    visitDate,
    visitStartTime,
    visitEndTime,
  });
  if (baseAudit.ok) {
    return {
      ok: true,
      candidate: baseAudit.candidate,
      slot: {
        visitDate: baseAudit.candidate.visitDate,
        visitStartTime: baseAudit.candidate.start,
        visitEndTime: baseAudit.candidate.end,
        shifted: false,
      },
      adjusted: false,
      message: null,
      checked: baseAudit.checked,
    };
  }
  if (!baseAudit.conflict) {
    return { ok: false, message: baseAudit.message };
  }

  const dates: string[] = [];
  let cursor = visitDate;
  for (let i = 0; i < maxDayHops; i += 1) {
    if (!cursor) break;
    dates.push(cursor);
    cursor = addCalendarDaysIso(cursor, 1) ?? "";
  }

  const windowLists = await Promise.all(
    dates.map((day) =>
      collectVisitorWindowsForDate({
        visitorIds,
        visitDate: day,
        excludeAssignmentId: input.assignmentId,
      }),
    ),
  );
  const siblings = (input.siblingWindows ?? []).filter(
    (item) => !input.assignmentId || item.assignmentId !== input.assignmentId,
  );
  const existing = [...windowLists.flat(), ...siblings];

  const resolved = resolveNonOverlappingVisitSlot({
    candidate: {
      visitorIds,
      visitDate,
      start: visitStartTime,
      end: visitEndTime,
      label: input.label,
      assignmentId: input.assignmentId,
      caseId: input.caseId,
    },
    existing,
    travelGapMinutes: travelGap,
    morningStart,
    maxDayHops,
  });

  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  const slot = resolved.slot;
  const candidate: DeskVisitWindow = {
    visitorIds,
    visitDate: slot.visitDate,
    start: slot.visitStartTime,
    end: slot.visitEndTime,
    label: input.label,
    assignmentId: input.assignmentId,
    caseId: input.caseId,
  };

  return {
    ok: true,
    candidate,
    slot,
    adjusted: slot.shifted,
    message: slot.shifted
      ? `時段與其他案衝突，已自動調整為 ${slot.visitStartTime}–${slot.visitEndTime}`
      : null,
    checked: existing.length,
  };
}

function toMinutesSafe(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
