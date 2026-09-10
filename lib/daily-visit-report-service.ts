import {
  assignmentVisitDate,
  buildDailyVisitReport,
  createDemoDailyVisitReport,
  type DailyVisitReport,
} from "@/lib/domain/daily-visit-report";
import { gasClient } from "@/lib/gas-client";
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
    // 僅取待稽核佇列；通過／退回會同步寫回 careform.status，
    // 避免 audit.queue(all) 對每筆歷史資料逐一 enrich 造成日報延遲。
    return await gasClient.audit.queue({ decision: "pending" });
  } catch {
    // 關懷表狀態仍可呈現稽核進度；避免稽核服務暫時失敗拖垮整張日報。
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

export async function getDailyVisitReport(date: string): Promise<DailyVisitReport> {
  if (getSystemStatus().dataMode !== "gas_ready") {
    return createDemoDailyVisitReport(date);
  }

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
