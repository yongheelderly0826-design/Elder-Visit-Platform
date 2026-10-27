import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireCapability } from "@/lib/api/authorization";
import {
  FIELD_SELF_SOURCE_NOTE,
  buildDeskAssignmentNotes,
  isDeskPaperAssignmentNotes,
  normalizeDeskVisitDateToIso,
} from "@/lib/domain/desk-care-batch";
import { auditDeskVisitTimeAutoResolve } from "@/lib/domain/desk-visit-time-audit";
import { resolveVisitorIdentity } from "@/lib/domain/demo-visitor-link";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";
import { gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

/**
 * 訪查員 KEY：寫入／校正訪視時段。
 * 與場生 confirm-time 相同稽核邏輯，但衝突時自動往後挪（時長＋5 分移動），不擋表。
 */
export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "visits.submit");
  if (forbidden) return forbidden;
  if (getRoleKey(request) !== "visitor") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "此接口僅供訪查員登入使用。" } },
      { status: 403 },
    );
  }

  const { visitorId, name } = resolveVisitorIdentity({
    visitorId: request.cookies.get(VOLUNTEER_CLOCK_COOKIE)?.value ?? "",
    email: request.cookies.get("demo_email")?.value ?? "",
    name: request.cookies.get("demo_name")?.value ?? "",
  });

  if (!visitorId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "找不到訪查員身分，請重新登入。" } },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    assignmentId?: string;
    caseId?: string;
    caseLabel?: string;
    visitDate?: string;
    visitStartTime?: string;
    visitEndTime?: string;
    persist?: boolean;
  };

  const assignmentId = String(body.assignmentId ?? "").trim();
  if (!assignmentId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "缺少派案編號。" } },
      { status: 400 },
    );
  }

  let assignment: Record<string, unknown> | null = null;
  try {
    assignment = (await gasClient.assignments.get(assignmentId)) as Record<
      string,
      unknown
    > | null;
  } catch {
    assignment = null;
  }
  if (!assignment) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "找不到此派案。" } },
      { status: 404 },
    );
  }

  const rowVisitorId = String(assignment.visitor_id ?? "").trim();
  if (rowVisitorId && rowVisitorId !== visitorId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "此派案不屬於目前登入的訪查員。" } },
      { status: 403 },
    );
  }

  const visitDateIso =
    normalizeDeskVisitDateToIso(body.visitDate) ||
    normalizeDeskVisitDateToIso(assignment.due_date) ||
    new Date().toISOString().slice(0, 10);
  const visitStartTime = String(body.visitStartTime ?? "").trim().slice(0, 5);
  const visitEndTime = String(body.visitEndTime ?? "").trim().slice(0, 5);

  if (!visitStartTime || !visitEndTime) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請完整填寫訪視起迄時間。" } },
      { status: 400 },
    );
  }

  const label = String(
    body.caseLabel ?? body.caseId ?? assignment.encoded_id ?? assignment.case_id ?? assignmentId,
  ).trim();

  const resolved = await auditDeskVisitTimeAutoResolve({
    visitorIds: [visitorId],
    visitDate: visitDateIso,
    visitStartTime,
    visitEndTime,
    label,
    assignmentId,
    caseId: String(body.caseId ?? assignment.case_id ?? "").trim() || undefined,
  });

  if (!resolved.ok) {
    return NextResponse.json(
      { error: { code: "TIME_CONFLICT", message: resolved.message } },
      { status: 409 },
    );
  }

  const slot = resolved.slot;
  const shouldPersist = body.persist !== false;
  let notes = String(assignment.notes ?? "");

  if (shouldPersist) {
    const windowText = `時段:${slot.visitDate} ${slot.visitStartTime}-${slot.visitEndTime}`;
    const windowPattern =
      /時段:\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/;
    if (windowPattern.test(notes)) {
      notes = notes.replace(windowPattern, windowText);
    } else if (notes.trim()) {
      notes = `${notes.trim()}｜${windowText}`;
    } else {
      const source = isDeskPaperAssignmentNotes(notes) ? "desk_paper" : "field_self";
      notes = buildDeskAssignmentNotes({
        primaryVisitorId: visitorId,
        primaryVisitorName: name,
        visitDate: slot.visitDate,
        visitStartTime: slot.visitStartTime,
        visitEndTime: slot.visitEndTime,
        source,
      });
    }
    if (!isDeskPaperAssignmentNotes(notes) && !notes.includes(FIELD_SELF_SOURCE_NOTE)) {
      notes = `${FIELD_SELF_SOURCE_NOTE}｜${notes}`;
    }

    try {
      await gasClient.assignments.confirm({
        assignment_id: assignmentId,
        status: "進行中",
        notes,
        due_date: slot.visitDate,
      });
      invalidateGasReadCaches();
    } catch (error) {
      const message = error instanceof Error ? error.message : "無法寫入訪視時段";
      return NextResponse.json(
        { error: { code: "GAS_CONFIRM_FAILED", message } },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    data: {
      ok: true,
      assignmentId,
      visitDate: slot.visitDate,
      visitStartTime: slot.visitStartTime,
      visitEndTime: slot.visitEndTime,
      adjusted: resolved.adjusted,
      message: resolved.message,
      notes: shouldPersist ? notes : undefined,
      persisted: shouldPersist,
    },
  });
}
