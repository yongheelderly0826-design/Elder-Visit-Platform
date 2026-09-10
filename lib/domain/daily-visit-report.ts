import { hoursFromMinutes, taipeiToday, taipeiTime } from "@/lib/domain/volunteer-attendance";

export type DailyVisitAuditStatus = "待稽核" | "稽核通過" | "退回補件";
export type DailyVisitPaymentStatus = "待稽核" | "可核銷（稽核通過）" | "退回補件";

export type DailyVisitDetail = {
  assignmentId: string;
  caseId: string;
  caseCode: string;
  elderName: string;
  visitResult: string;
  careFormStatus: string;
  careFormCompletion: number;
  careSummary: string;
  checkinAt: string;
  checkoutAt: string;
  serviceMinutes: number;
  serviceHours: string;
  auditStatus: DailyVisitAuditStatus;
  paymentStatus: DailyVisitPaymentStatus;
};

export type DailyVisitorReport = {
  visitorId: string;
  visitorName: string;
  assignedCount: number;
  careFormCompletedCount: number;
  checkedInCount: number;
  checkedOutCount: number;
  serviceMinutes: number;
  serviceHours: string;
  auditApprovedCount: number;
  details: DailyVisitDetail[];
};

export type DailyVisitReport = {
  date: string;
  mode: "gas" | "demo";
  generatedAt: string;
  summary: {
    visitorCount: number;
    assignmentCount: number;
    careFormCompletedCount: number;
    checkedOutCount: number;
    serviceMinutes: number;
    serviceHours: string;
    auditApprovedCount: number;
  };
  visitors: DailyVisitorReport[];
  note?: string;
};

type RawRow = Record<string, unknown>;

export type DailyVisitReportSources = {
  assignments: RawRow[];
  visitors: RawRow[];
  cases: RawRow[];
  attendance: RawRow[];
  audits: RawRow[];
  careForms: Map<string, RawRow | null>;
};

export const DAILY_VISIT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDailyVisitDate(value: string) {
  if (!DAILY_VISIT_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function first(row: RawRow | undefined, keys: string[]) {
  if (!row) return "";
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

function datePart(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : taipeiToday(parsed);
}

export function assignmentVisitDate(row: RawRow) {
  return (
    datePart(row.due_date) ||
    datePart(row.visit_date) ||
    datePart(row.scheduled_date) ||
    datePart(row.dispatched_at)
  );
}

function completionValue(row: RawRow | undefined) {
  const value = Number(first(row, ["completion_pct", "completion_percent", "completion"]));
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function careSummary(row: RawRow | undefined) {
  if (!row) return "尚無關懷表內容";
  const explicit = first(row, ["summary", "content_summary", "visit_summary", "notes", "note"]);
  if (explicit) return explicit.slice(0, 180);

  let answers: RawRow | undefined;
  if (row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)) {
    answers = row.answers as RawRow;
  } else if (typeof row.answers_json === "string") {
    try {
      const parsed = JSON.parse(row.answers_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        answers = parsed as RawRow;
      }
    } catch {
      answers = undefined;
    }
  }
  const parts = [
    first(row, ["health_status", "living_status"]),
    first(answers, ["health_self_rating", "living_status"]),
    first(answers, ["life_difficulties", "worries"]),
    first(answers, ["home_safety_issues", "home_hygiene_issues"]),
    first(answers, ["care_note", "other_note"]),
  ].filter(Boolean);
  return parts.length ? parts.join("；").slice(0, 180) : "已填寫，無文字摘要";
}

function auditState(
  row: RawRow | undefined,
  careForm: RawRow | undefined,
): DailyVisitAuditStatus {
  const decision =
    first(row, ["decision", "audit_state", "status"]) ||
    first(careForm, ["status", "careform_status"]);
  if (decision === "通過" || decision === "approved" || decision === "稽核通過") {
    return "稽核通過";
  }
  if (
    decision === "退回補件" ||
    decision === "駁回" ||
    decision === "rejected" ||
    decision === "blocked"
  ) {
    return "退回補件";
  }
  return "待稽核";
}

function paymentState(audit: DailyVisitAuditStatus): DailyVisitPaymentStatus {
  if (audit === "稽核通過") return "可核銷（稽核通過）";
  if (audit === "退回補件") return "退回補件";
  return "待稽核";
}

function makeVisitorReport(
  visitorId: string,
  visitorName: string,
  details: DailyVisitDetail[],
): DailyVisitorReport {
  const serviceMinutes = details.reduce((sum, item) => sum + item.serviceMinutes, 0);
  return {
    visitorId,
    visitorName: visitorName || visitorId || "未指定訪員",
    assignedCount: details.length,
    careFormCompletedCount: details.filter(
      (item) => item.careFormCompletion >= 100 || /已提交|已稽核|完成/.test(item.careFormStatus),
    ).length,
    checkedInCount: details.filter((item) => Boolean(item.checkinAt)).length,
    checkedOutCount: details.filter((item) => Boolean(item.checkoutAt)).length,
    serviceMinutes,
    serviceHours: hoursFromMinutes(serviceMinutes) || "0",
    auditApprovedCount: details.filter((item) => item.auditStatus === "稽核通過").length,
    details,
  };
}

export function buildDailyVisitReport(
  date: string,
  sources: DailyVisitReportSources,
  mode: DailyVisitReport["mode"],
): DailyVisitReport {
  const visitors = new Map(
    sources.visitors.map((row) => [
      first(row, ["visitor_id", "id"]),
      first(row, ["name", "full_name", "worker_name"]),
    ]),
  );
  const cases = new Map(
    sources.cases.map((row) => [first(row, ["case_id", "id"]), row]),
  );
  const attendanceByAssignment = new Map<string, RawRow[]>();
  for (const row of sources.attendance) {
    if (datePart(row.session_date) !== date) continue;
    const assignmentId = first(row, ["assignment_id"]);
    if (!assignmentId) continue;
    attendanceByAssignment.set(assignmentId, [
      ...(attendanceByAssignment.get(assignmentId) ?? []),
      row,
    ]);
  }
  const auditByAssignment = new Map<string, RawRow>();
  for (const row of sources.audits) {
    const assignmentId = first(row, ["assignment_id", "schedule_id"]);
    if (assignmentId) auditByAssignment.set(assignmentId, row);
  }

  const detailsByVisitor = new Map<string, DailyVisitDetail[]>();
  for (const assignment of sources.assignments) {
    if (assignmentVisitDate(assignment) !== date) continue;
    const assignmentId = first(assignment, ["assignment_id", "id"]);
    const visitorId = first(assignment, ["visitor_id"]);
    const caseId = first(assignment, ["case_id"]);
    const caseRow = cases.get(caseId);
    const careForm = sources.careForms.get(assignmentId) ?? undefined;
    const attendanceRows = attendanceByAssignment.get(assignmentId) ?? [];
    const checkinAt = attendanceRows
      .map((row) => first(row, ["checkin_at"]))
      .filter(Boolean)
      .sort()[0] ?? "";
    const checkoutAt = attendanceRows
      .map((row) => first(row, ["checkout_at"]))
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";
    const durationMinutes = attendanceRows.reduce((sum, row) => {
      const minutes = Number(row.duration_minutes);
      return sum + (Number.isFinite(minutes) ? Math.max(0, minutes) : 0);
    }, 0);
    const audit = auditState(auditByAssignment.get(assignmentId), careForm);
    const completion = Math.max(
      completionValue(careForm),
      completionValue(auditByAssignment.get(assignmentId)),
    );
    const detail: DailyVisitDetail = {
      assignmentId,
      caseId,
      caseCode:
        first(caseRow, ["external_id", "encoded_id", "case_code"]) ||
        first(assignment, ["encoded_id", "external_id"]) ||
        caseId,
      elderName: first(caseRow, ["name", "elder_name"]) || first(assignment, ["name"]) || "未知名",
      visitResult:
        first(careForm, ["visit_result"]) ||
        first(auditByAssignment.get(assignmentId), ["visit_result"]) ||
        "尚未填報",
      careFormStatus:
        first(careForm, ["status", "careform_status"]) ||
        first(auditByAssignment.get(assignmentId), ["careform_status"]) ||
        "尚未填寫",
      careFormCompletion: completion,
      careSummary: careSummary(careForm),
      checkinAt,
      checkoutAt,
      serviceMinutes: durationMinutes,
      serviceHours: hoursFromMinutes(durationMinutes) || "0",
      auditStatus: audit,
      paymentStatus: paymentState(audit),
    };
    detailsByVisitor.set(visitorId, [...(detailsByVisitor.get(visitorId) ?? []), detail]);
  }

  const visitorReports = [...detailsByVisitor.entries()]
    .map(([visitorId, details]) =>
      makeVisitorReport(
        visitorId,
        visitors.get(visitorId) ||
          first(
            sources.attendance.find((row) => first(row, ["visitor_id"]) === visitorId),
            ["worker_name", "name"],
          ),
        details,
      ),
    )
    .sort((a, b) => a.visitorName.localeCompare(b.visitorName, "zh-Hant"));
  const allDetails = visitorReports.flatMap((visitor) => visitor.details);
  const serviceMinutes = visitorReports.reduce((sum, visitor) => sum + visitor.serviceMinutes, 0);

  return {
    date,
    mode,
    generatedAt: new Date().toISOString(),
    summary: {
      visitorCount: visitorReports.length,
      assignmentCount: allDetails.length,
      careFormCompletedCount: visitorReports.reduce(
        (sum, visitor) => sum + visitor.careFormCompletedCount,
        0,
      ),
      checkedOutCount: visitorReports.reduce((sum, visitor) => sum + visitor.checkedOutCount, 0),
      serviceMinutes,
      serviceHours: hoursFromMinutes(serviceMinutes) || "0",
      auditApprovedCount: visitorReports.reduce(
        (sum, visitor) => sum + visitor.auditApprovedCount,
        0,
      ),
    },
    visitors: visitorReports,
  };
}

export function createDemoDailyVisitReport(date: string): DailyVisitReport {
  const at = (time: string) => `${date}T${time}:00+08:00`;
  const reports = [
    makeVisitorReport("visitor_demo_01", "王美華", [
      {
        assignmentId: "ASG-DEMO-001",
        caseId: "CASE-DEMO-001",
        caseCode: "YH-115-0018",
        elderName: "林阿梅",
        visitResult: "訪視成功",
        careFormStatus: "已稽核",
        careFormCompletion: 100,
        careSummary: "精神狀況良好，已確認用藥與送餐服務。",
        checkinAt: at("09:05"),
        checkoutAt: at("09:52"),
        serviceMinutes: 47,
        serviceHours: "0.8",
        auditStatus: "稽核通過",
        paymentStatus: "可核銷（稽核通過）",
      },
      {
        assignmentId: "ASG-DEMO-002",
        caseId: "CASE-DEMO-002",
        caseCode: "YH-115-0031",
        elderName: "陳水木",
        visitResult: "訪視成功",
        careFormStatus: "已提交",
        careFormCompletion: 100,
        careSummary: "生活自理，反映浴室扶手需協助評估。",
        checkinAt: at("10:18"),
        checkoutAt: at("11:03"),
        serviceMinutes: 45,
        serviceHours: "0.8",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ]),
    makeVisitorReport("visitor_demo_02", "李志明", [
      {
        assignmentId: "ASG-DEMO-003",
        caseId: "CASE-DEMO-003",
        caseCode: "YH-115-0046",
        elderName: "張進福",
        visitResult: "無人在家",
        careFormStatus: "待補件",
        careFormCompletion: 72,
        careSummary: "電話聯繫未果，已留訪視通知。",
        checkinAt: at("13:25"),
        checkoutAt: at("13:43"),
        serviceMinutes: 18,
        serviceHours: "0.3",
        auditStatus: "退回補件",
        paymentStatus: "退回補件",
      },
      {
        assignmentId: "ASG-DEMO-004",
        caseId: "CASE-DEMO-004",
        caseCode: "YH-115-0052",
        elderName: "許秀蘭",
        visitResult: "尚未填報",
        careFormStatus: "尚未填寫",
        careFormCompletion: 0,
        careSummary: "尚無關懷表內容",
        checkinAt: "",
        checkoutAt: "",
        serviceMinutes: 0,
        serviceHours: "0",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ]),
    makeVisitorReport("visitor_demo_03", "陳雅婷", [
      {
        assignmentId: "ASG-DEMO-005",
        caseId: "CASE-DEMO-005",
        caseCode: "YH-115-0064",
        elderName: "黃春花",
        visitResult: "訪視成功",
        careFormStatus: "已提交",
        careFormCompletion: 100,
        careSummary: "健康穩定，提醒下週回診並完成緊急聯絡人確認。",
        checkinAt: at("15:06"),
        checkoutAt: "",
        serviceMinutes: 0,
        serviceHours: "0",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ]),
  ];
  const all = reports.flatMap((visitor) => visitor.details);
  const serviceMinutes = reports.reduce((sum, visitor) => sum + visitor.serviceMinutes, 0);
  return {
    date,
    mode: "demo",
    generatedAt: new Date().toISOString(),
    summary: {
      visitorCount: reports.length,
      assignmentCount: all.length,
      careFormCompletedCount: reports.reduce(
        (sum, visitor) => sum + visitor.careFormCompletedCount,
        0,
      ),
      checkedOutCount: reports.reduce((sum, visitor) => sum + visitor.checkedOutCount, 0),
      serviceMinutes,
      serviceHours: hoursFromMinutes(serviceMinutes) || "0",
      auditApprovedCount: reports.reduce((sum, visitor) => sum + visitor.auditApprovedCount, 0),
    },
    visitors: reports,
    note: "目前為示範模式；資料會依所選日期產生，方便檢視完整操作。",
  };
}

export const DAILY_VISIT_EXPORT_HEADERS = [
  "日期",
  "訪員",
  "訪員編號",
  "派案編號",
  "個案代碼",
  "長者",
  "簽到",
  "簽退",
  "服務分鐘",
  "服務時數",
  "關懷表狀態",
  "完成率",
  "內容摘要",
  "訪視結果",
  "稽核狀態",
  "核銷資格",
] as const;

export function dailyVisitExportRow(
  date: string,
  visitor: DailyVisitorReport,
  detail: DailyVisitDetail,
) {
  return [
    date,
    visitor.visitorName,
    visitor.visitorId,
    detail.assignmentId,
    detail.caseCode,
    detail.elderName,
    detail.checkinAt ? taipeiTime(detail.checkinAt) : "",
    detail.checkoutAt ? taipeiTime(detail.checkoutAt) : "",
    detail.serviceMinutes,
    Number(detail.serviceHours),
    detail.careFormStatus,
    `${detail.careFormCompletion}%`,
    detail.careSummary,
    detail.visitResult,
    detail.auditStatus,
    detail.paymentStatus,
  ];
}
