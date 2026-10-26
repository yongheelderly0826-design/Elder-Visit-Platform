import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireCapability } from "@/lib/api/authorization";
import { buildDeskAssignmentNotes } from "@/lib/domain/desk-care-batch";
import { resolveVisitorIdentity } from "@/lib/domain/demo-visitor-link";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";
import { gasClient } from "@/lib/gas-client";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

/** 已登入訪查員：確認一案派給自己並進表 KEY。 */
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
    caseId?: string;
    caseName?: string;
    caseCode?: string;
    assignmentId?: string;
  };

  const existingAssignmentId = String(body.assignmentId ?? "").trim();
  if (existingAssignmentId) {
    return NextResponse.json({
      data: {
        assignmentId: existingAssignmentId,
        caseId: String(body.caseId ?? "").trim(),
        reused: true,
      },
    });
  }

  const caseId = String(body.caseId ?? "").trim();
  if (!caseId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請選擇個案。" } },
      { status: 400 },
    );
  }

  const visitDate = new Date().toISOString().slice(0, 10);
  const notes = buildDeskAssignmentNotes({
    primaryVisitorId: visitorId,
    primaryVisitorName: name,
    visitDate,
    source: "field_self",
  });

  try {
    const saved = (await gasClient.assignments.dispatch({
      case_id: caseId,
      visitor_id: visitorId,
      due_date: visitDate,
      notes,
      auto_confirm: true,
      allow_multi_active: true,
    })) as Record<string, unknown>;

    const assignmentId = String(saved.assignment_id ?? "").trim();
    if (!assignmentId) {
      return NextResponse.json(
        { error: { code: "GAS_DISPATCH_FAILED", message: "派案未回傳編號。" } },
        { status: 502 },
      );
    }

    invalidateGasReadCaches();
    return NextResponse.json({
      data: {
        assignmentId,
        caseId,
        caseName: String(body.caseName ?? saved.elder_name ?? ""),
        caseCode: String(body.caseCode ?? saved.encoded_id ?? ""),
        visitDate,
        reused: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法領案";
    const status = /已有進行中的派案|active assignment/i.test(message) ? 409 : 502;
    return NextResponse.json(
      { error: { code: status === 409 ? "TIME_CONFLICT" : "GAS_DISPATCH_FAILED", message } },
      { status },
    );
  }
}
