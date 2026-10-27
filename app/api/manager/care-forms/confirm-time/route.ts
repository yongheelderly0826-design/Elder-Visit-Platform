import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import {
  buildDeskAssignmentNotes,
  deskStaleAssignmentMessage,
  parseAssignmentNotFoundId,
  type DeskVisitWindow,
} from "@/lib/domain/desk-care-batch";
import { auditDeskVisitTime } from "@/lib/domain/desk-visit-time-audit";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

export async function POST(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    assignmentId?: string;
    caseId?: string;
    caseLabel?: string;
    primaryVisitorId?: string;
    companionVisitorIds?: string[];
    visitDate?: string;
    visitStartTime?: string;
    visitEndTime?: string;
    siblingWindows?: DeskVisitWindow[];
  };

  const assignmentId = String(body.assignmentId ?? "").trim();
  const primaryVisitorId = String(body.primaryVisitorId ?? "").trim();
  const companionVisitorIds = [
    ...new Set(
      (body.companionVisitorIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter((id) => id && id !== primaryVisitorId),
    ),
  ];
  const visitDate = String(body.visitDate ?? "").trim();
  const visitStartTime = String(body.visitStartTime ?? "").trim().slice(0, 5);
  const visitEndTime = String(body.visitEndTime ?? "").trim().slice(0, 5);

  if (!assignmentId || !primaryVisitorId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "缺少派案或主填表訪查員。" } },
      { status: 400 },
    );
  }

  const teamIds = [primaryVisitorId, ...companionVisitorIds];
  const audit = await auditDeskVisitTime({
    visitorIds: teamIds,
    visitDate,
    visitStartTime,
    visitEndTime,
    label: String(body.caseLabel ?? body.caseId ?? assignmentId),
    assignmentId,
    caseId: body.caseId,
    siblingWindows: body.siblingWindows,
  });

  if (!audit.ok) {
    return NextResponse.json(
      { error: { code: "TIME_CONFLICT", message: audit.message } },
      { status: 409 },
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
      primaryVisitorId,
      primaryVisitorName: nameById.get(primaryVisitorId) || "",
      companionVisitorIds,
      companionNames: Object.fromEntries(
        companionVisitorIds.map((id) => [id, nameById.get(id) || ""]),
      ),
      visitDate,
      visitStartTime,
      visitEndTime,
    });

    await gasClient.assignments.confirm({
      assignment_id: assignmentId,
      status: "進行中",
      notes,
      due_date: visitDate,
    });
    invalidateGasReadCaches();

    return NextResponse.json({
      data: {
        ok: true,
        assignmentId,
        visitDate,
        visitStartTime,
        visitEndTime,
        notes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法寫入訪視時段";
    const missingId =
      parseAssignmentNotFoundId(message) ||
      (error instanceof GasApiError &&
      error.code === "NOT_FOUND" &&
      /Assignment not found/i.test(message)
        ? assignmentId
        : null);
    if (missingId) {
      return NextResponse.json(
        {
          error: {
            code: "ASSIGNMENT_NOT_FOUND",
            message: deskStaleAssignmentMessage(missingId),
            assignmentId: missingId,
          },
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: { code: "GAS_CONFIRM_FAILED", message } }, { status: 502 });
  }
}
