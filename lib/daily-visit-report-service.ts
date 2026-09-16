import {
  assignmentVisitDate,
  buildDailyVisitReport,
  createDemoDailyVisitReport,
  type DailyVisitReport,
  type DailyVisitReportSources,
} from "@/lib/domain/daily-visit-report";
import { cachedRead, GAS_READ_TAGS } from "@/lib/gas-read-cache";
import { gasClient, isUnknownGasAction } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

type RawRow = Record<string, unknown>;

const CARE_FORM_CONCURRENCY = 8;
const CARE_FORM_LIMIT = 80;

async function withSingleRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return operation();
  }
}

async function loadAuditRows() {
  try {
    return await gasClient.audit.queue({ decision: "pending" });
  } catch {
    return [];
  }
}

async function loadCareForms(assignments: RawRow[]) {
  const careForms = new Map<string, RawRow | null>();
  const selected = assignments.slice(0, CARE_FORM_LIMIT);
  for (let index = 0; index < selected.length; index += CARE_FORM_CONCURRENCY) {
    const chunk = selected.slice(index, index + CARE_FORM_CONCURRENCY);
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

function asRows(value: unknown): RawRow[] {
  return Array.isArray(value) ? value.filter((row): row is RawRow => Boolean(row) && typeof row === "object") : [];
}

function sourcesFromBundle(bundle: {
  assignments?: unknown;
  visitors?: unknown;
  cases?: unknown;
  attendance?: unknown;
  audits?: unknown;
  careForms?: unknown;
}): DailyVisitReportSources {
  const careForms = new Map<string, RawRow | null>();
  for (const row of asRows(bundle.careForms)) {
    const assignmentId = String(row.assignment_id ?? row.id ?? "").trim();
    if (assignmentId) careForms.set(assignmentId, row);
  }
  return {
    assignments: asRows(bundle.assignments),
    visitors: asRows(bundle.visitors),
    cases: asRows(bundle.cases),
    attendance: asRows(bundle.attendance),
    audits: asRows(bundle.audits),
    careForms,
  };
}

async function loadDailyVisitReportLegacy(date: string): Promise<DailyVisitReport> {
  const period = date.slice(0, 7);
  const assignments = await withSingleRetry(
    () => gasClient.assignments.list() as Promise<RawRow[]>,
  );
  const optionalResults = await Promise.allSettled([
    gasClient.visitors.list() as Promise<RawRow[]>,
    gasClient.cases.list() as Promise<RawRow[]>,
    gasClient.attendance.list({ period, session_type: "訪查" }),
    loadAuditRows(),
  ]);
  const unavailable: string[] = [];
  const labels = ["訪員", "個案", "到宅出勤", "稽核"];
  const [visitors, cases, attendance, audits] = optionalResults.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    unavailable.push(labels[index]);
    return [] as RawRow[];
  });
  const dailyAssignments = assignments.filter((row) => assignmentVisitDate(row) === date);
  const careForms = await loadCareForms(dailyAssignments);
  const report = buildDailyVisitReport(
    date,
    { assignments: dailyAssignments, visitors, cases, attendance, audits, careForms },
    "gas",
  );
  if (dailyAssignments.length > CARE_FORM_LIMIT) {
    report.note = `當日派案超過 ${CARE_FORM_LIMIT} 筆；前 ${CARE_FORM_LIMIT} 筆已讀取關懷表內容，其餘仍顯示派案、出勤與稽核資料。`;
  }
  if (unavailable.length) {
    report.note = [
      report.note,
      `${unavailable.join("、")}資料暫時無法讀取；其他即時 GAS 資料仍正常顯示，請稍後重新整理補齊。`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return report;
}

async function loadDailyVisitReport(date: string, fresh = false): Promise<DailyVisitReport> {
  try {
    const bundle = await gasClient.reports.dailyVisitSnapshot(date, { fresh });
    const report = buildDailyVisitReport(date, sourcesFromBundle(bundle), "gas");
    if (bundle.source === "snapshot" && !fresh) {
      report.note = [
        report.note,
        "此頁讀取當日快照；新派案或簽到後約數秒會自動更新，也可按重新整理立即重算。",
      ]
        .filter(Boolean)
        .join(" ");
    }
    return report;
  } catch (error) {
    if (!isUnknownGasAction(error)) {
      console.error("dailyVisitSnapshot failed, falling back to live bundle", error);
    }
    try {
      const bundle = await gasClient.reports.dailyVisitBundle(date, { fresh });
      return buildDailyVisitReport(date, sourcesFromBundle(bundle), "gas");
    } catch (bundleError) {
      if (!isUnknownGasAction(bundleError)) {
        console.error("dailyVisitBundle failed, falling back to legacy reads", bundleError);
      }
      return loadDailyVisitReportLegacy(date);
    }
  }
}

export async function getDailyVisitReport(
  date: string,
  options?: { fresh?: boolean },
): Promise<DailyVisitReport> {
  if (getSystemStatus().dataMode !== "gas_ready") {
    return createDemoDailyVisitReport(date);
  }
  if (options?.fresh) {
    return loadDailyVisitReport(date, true);
  }
  return cachedRead(
    ["daily-visit-report", date],
    [GAS_READ_TAGS.dailyVisits],
    () => loadDailyVisitReport(date),
  );
}
