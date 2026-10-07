import {
  buildDailyVisitReport,
  type DailyVisitDetail,
  type DailyVisitReportSources,
} from "@/lib/domain/daily-visit-report";
import {
  buildInProgressVisitBoard,
  createDemoInProgressVisitBoard,
  type InProgressCaseProgress,
  type InProgressVisitBoard,
} from "@/lib/domain/in-progress-visit-board";
import { cachedRead, GAS_READ_TAGS } from "@/lib/gas-read-cache";
import { gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";
import { taipeiToday } from "@/lib/domain/volunteer-attendance";

type RawRow = Record<string, unknown>;

const CARE_FORM_CONCURRENCY = 8;
const CARE_FORM_LIMIT = 80;

function asRows(value: unknown): RawRow[] {
  return Array.isArray(value)
    ? value.filter((row): row is RawRow => Boolean(row) && typeof row === "object")
    : [];
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

async function withSingleRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return operation();
  }
}

async function loadCareForms(assignments: RawRow[]) {
  const careForms = new Map<string, RawRow | null>();
  const selected = assignments.slice(0, CARE_FORM_LIMIT);
  for (let index = 0; index < selected.length; index += CARE_FORM_CONCURRENCY) {
    const chunk = selected.slice(index, CARE_FORM_CONCURRENCY + index);
    const results = await Promise.allSettled(
      chunk.map((row) => gasClient.careform.get(String(row.assignment_id ?? row.id ?? ""))),
    );
    results.forEach((result, resultIndex) => {
      const assignmentId = String(
        chunk[resultIndex].assignment_id ?? chunk[resultIndex].id ?? "",
      );
      careForms.set(
        assignmentId,
        result.status === "fulfilled" && result.value && typeof result.value === "object"
          ? (result.value as RawRow)
          : null,
      );
    });
  }
  return careForms;
}

function detailToProgress(detail: DailyVisitDetail): InProgressCaseProgress {
  return {
    caseId: detail.caseId,
    caseCode: detail.caseCode,
    elderName: detail.elderName,
    assignmentId: detail.assignmentId,
    visitResult: detail.visitResult,
    careFormStatus: detail.careFormStatus,
    careFormCompletion: detail.careFormCompletion,
    careSummary: detail.careSummary,
    checkinAt: detail.checkinAt,
    checkoutAt: detail.checkoutAt,
    serviceMinutes: detail.serviceMinutes,
    serviceHours: detail.serviceHours,
    auditStatus: detail.auditStatus,
    paymentStatus: detail.paymentStatus,
  };
}

async function loadInProgressVisitBoard(fresh = false): Promise<InProgressVisitBoard> {
  const today = taipeiToday();
  const period = today.slice(0, 7);

  const [casesResult, assignmentsResult, optionalResults] = await Promise.all([
    withSingleRetry(() =>
      gasClient.cases.list({
        district: "永和區",
        visit_status: "進行中",
      }) as Promise<RawRow[]>,
    ),
    withSingleRetry(() =>
      gasClient.assignments.list({ active_only: "true" }) as Promise<RawRow[]>,
    ),
    Promise.allSettled([
      gasClient.visitors.list() as Promise<RawRow[]>,
      gasClient.attendance.list({ period, session_type: "訪查" }),
      gasClient.audit.queue({ decision: "pending" }).catch(() => []),
    ]),
  ]);

  const cases = asRows(casesResult).filter((row) => text(row.visit_status) === "進行中");
  const assignments = asRows(assignmentsResult);
  const unavailable: string[] = [];
  const labels = ["訪員", "到宅出勤", "稽核"];
  const [visitors, attendance, audits] = optionalResults.map((result, index) => {
    if (result.status === "fulfilled") return asRows(result.value);
    unavailable.push(labels[index]);
    return [] as RawRow[];
  });

  const caseIds = new Set(cases.map((row) => text(row.case_id || row.id)).filter(Boolean));
  const relevantAssignments = assignments.filter((row) => caseIds.has(text(row.case_id)));
  const careForms = await loadCareForms(relevantAssignments);

  const sources: DailyVisitReportSources = {
    assignments: relevantAssignments,
    visitors,
    cases,
    attendance,
    audits,
    careForms,
  };

  // Reuse daily-visit detail builder without date filter by synthesizing one report per date,
  // then merge into progress map by assignment id.
  const progressByAssignment = new Map<string, InProgressCaseProgress>();
  const dates = new Set(
    relevantAssignments
      .map((row) => {
        const due =
          text(row.due_date).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ||
          text(row.visit_date).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ||
          text(row.scheduled_date).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ||
          text(row.dispatched_at).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ||
          "";
        return due;
      })
      .filter(Boolean),
  );
  if (!dates.size) dates.add(today);

  for (const date of dates) {
    const report = buildDailyVisitReport(date, sources, "gas");
    for (const visitor of report.visitors) {
      for (const detail of visitor.details) {
        if (detail.assignmentId) {
          progressByAssignment.set(detail.assignmentId, detailToProgress(detail));
        }
      }
    }
  }

  // Also attach progress for assignments that have no visit date (unscheduled).
  if (relevantAssignments.some((row) => !text(row.due_date) && !text(row.visit_date))) {
    const unscheduledSources: DailyVisitReportSources = {
      ...sources,
      assignments: relevantAssignments.filter(
        (row) =>
          !text(row.due_date).match(/^\d{4}-\d{2}-\d{2}/) &&
          !text(row.visit_date).match(/^\d{4}-\d{2}-\d{2}/) &&
          !text(row.scheduled_date).match(/^\d{4}-\d{2}-\d{2}/) &&
          !text(row.dispatched_at).match(/^\d{4}-\d{2}-\d{2}/),
      ),
    };
    // buildDailyVisitReport filters by date; inject a synthetic due_date for enrichment only.
    const syntheticDate = today;
    const syntheticAssignments = unscheduledSources.assignments.map((row) => ({
      ...row,
      due_date: syntheticDate,
    }));
    const report = buildDailyVisitReport(
      syntheticDate,
      { ...unscheduledSources, assignments: syntheticAssignments },
      "gas",
    );
    for (const visitor of report.visitors) {
      for (const detail of visitor.details) {
        if (detail.assignmentId && !progressByAssignment.has(detail.assignmentId)) {
          progressByAssignment.set(detail.assignmentId, detailToProgress(detail));
        }
      }
    }
  }

  const board = buildInProgressVisitBoard(
    {
      cases,
      assignments: relevantAssignments,
      visitors,
      progressByAssignment,
    },
    {
      mode: "gas",
      today,
      note: [
        "本頁各日案數加總＝工作流「訪視中」＝進行中個案數。",
        unavailable.length
          ? `${unavailable.join("、")}資料暫時無法讀取；案數仍以進行中個案為準。`
          : "",
        fresh ? "已重新讀取最新資料。" : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
  );

  if (relevantAssignments.length > CARE_FORM_LIMIT) {
    board.note = [
      board.note,
      `進行中派案超過 ${CARE_FORM_LIMIT} 筆；前 ${CARE_FORM_LIMIT} 筆已讀取關懷表，其餘仍顯示派案與出勤。`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return board;
}

export async function getInProgressVisitBoard(options?: {
  fresh?: boolean;
}): Promise<InProgressVisitBoard> {
  if (getSystemStatus().dataMode !== "gas_ready") {
    return createDemoInProgressVisitBoard();
  }
  if (options?.fresh) {
    return loadInProgressVisitBoard(true);
  }
  return cachedRead(
    ["in-progress-visit-board"],
    [GAS_READ_TAGS.dailyVisits, GAS_READ_TAGS.assignmentDashboard],
    () => loadInProgressVisitBoard(false),
  );
}
