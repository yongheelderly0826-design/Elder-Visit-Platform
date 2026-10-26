import {
  findOverlappingWindow,
  parseDeskAssignmentNotes,
  teamIdsIntersect,
  type DeskVisitWindow,
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

function toMinutesSafe(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
