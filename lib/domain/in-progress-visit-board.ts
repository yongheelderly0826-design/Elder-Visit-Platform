import { assignmentVisitDate } from "@/lib/domain/daily-visit-report";
import { hoursFromMinutes, taipeiToday } from "@/lib/domain/volunteer-attendance";

export const UNSCHEDULED_DATE_KEY = "__unscheduled__";
export const UNASSIGNED_VISITOR_ID = "__unassigned__";
export const UNASSIGNED_VISITOR_NAME = "未指定訪員";

export type InProgressCaseProgress = {
  caseId: string;
  caseCode: string;
  elderName: string;
  assignmentId: string;
  visitResult: string;
  careFormStatus: string;
  careFormCompletion: number;
  careSummary: string;
  checkinAt: string;
  checkoutAt: string;
  serviceMinutes: number;
  serviceHours: string;
  auditStatus: "待稽核" | "稽核通過" | "退回補件";
  paymentStatus: "待稽核" | "可核銷（稽核通過）" | "退回補件";
};

export type InProgressVisitorGroup = {
  visitorId: string;
  visitorName: string;
  caseCount: number;
  incompleteCount: number;
  checkedInCount: number;
  careFormCompletedCount: number;
  cases: InProgressCaseProgress[];
};

export type InProgressDateBucket = {
  dateKey: string;
  label: string;
  kind: "overdue" | "today" | "future" | "unscheduled";
  caseCount: number;
  visitorCount: number;
  visitors: InProgressVisitorGroup[];
};

export type InProgressVisitBoard = {
  mode: "gas" | "demo";
  generatedAt: string;
  today: string;
  totalCases: number;
  dateBuckets: InProgressDateBucket[];
  note?: string;
};

type RawRow = Record<string, unknown>;

export type InProgressVisitBoardSources = {
  cases: RawRow[];
  assignments: RawRow[];
  visitors: RawRow[];
  /** Optional progress rows keyed by assignment_id */
  progressByAssignment?: Map<string, Partial<InProgressCaseProgress>>;
};

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

function isCareFormComplete(caseItem: InProgressCaseProgress) {
  return (
    caseItem.careFormCompletion >= 100 || /已提交|已稽核|完成/.test(caseItem.careFormStatus)
  );
}

function isIncomplete(caseItem: InProgressCaseProgress) {
  return !caseItem.checkinAt || !isCareFormComplete(caseItem);
}

function caseStuckRank(caseItem: InProgressCaseProgress) {
  if (!caseItem.checkinAt) return 0;
  if (!isCareFormComplete(caseItem)) return 1;
  if (caseItem.auditStatus === "待稽核") return 2;
  return 3;
}

function compareCases(a: InProgressCaseProgress, b: InProgressCaseProgress) {
  const rank = caseStuckRank(a) - caseStuckRank(b);
  if (rank !== 0) return rank;
  return (a.caseCode || a.elderName).localeCompare(b.caseCode || b.elderName, "zh-Hant");
}

function compareVisitors(a: InProgressVisitorGroup, b: InProgressVisitorGroup) {
  const aUnassigned = a.visitorId === UNASSIGNED_VISITOR_ID ? 0 : 1;
  const bUnassigned = b.visitorId === UNASSIGNED_VISITOR_ID ? 0 : 1;
  if (aUnassigned !== bUnassigned) return aUnassigned - bUnassigned;
  if (b.incompleteCount !== a.incompleteCount) return b.incompleteCount - a.incompleteCount;
  return a.visitorName.localeCompare(b.visitorName, "zh-Hant");
}

function dateBucketMeta(dateKey: string, today: string): Pick<InProgressDateBucket, "label" | "kind"> {
  if (dateKey === UNSCHEDULED_DATE_KEY) {
    return { label: "未排程", kind: "unscheduled" };
  }
  if (dateKey < today) return { label: dateKey, kind: "overdue" };
  if (dateKey === today) return { label: `${dateKey}（今天）`, kind: "today" };
  return { label: dateKey, kind: "future" };
}

function dateSortRank(kind: InProgressDateBucket["kind"]) {
  if (kind === "overdue") return 0;
  if (kind === "today") return 1;
  if (kind === "future") return 2;
  return 3;
}

function compareDateBuckets(a: InProgressDateBucket, b: InProgressDateBucket) {
  const rank = dateSortRank(a.kind) - dateSortRank(b.kind);
  if (rank !== 0) return rank;
  if (a.kind === "overdue") return a.dateKey.localeCompare(b.dateKey); // oldest first
  if (a.kind === "future") return a.dateKey.localeCompare(b.dateKey); // soonest first
  return a.dateKey.localeCompare(b.dateKey);
}

function pickActiveAssignment(caseId: string, assignments: RawRow[]) {
  const forCase = assignments.filter((row) => first(row, ["case_id"]) === caseId);
  if (!forCase.length) return undefined;
  const active = forCase.find((row) => {
    const status = first(row, ["status", "assignment_status"]);
    return status === "待接案" || status === "進行中" || status === "空訪續訪" || !status;
  });
  return active ?? forCase[0];
}

function emptyProgress(
  caseRow: RawRow,
  assignment: RawRow | undefined,
): InProgressCaseProgress {
  const caseId = first(caseRow, ["case_id", "id"]);
  const assignmentId = first(assignment, ["assignment_id", "id"]);
  return {
    caseId,
    caseCode:
      first(caseRow, ["external_id", "encoded_id", "case_code"]) ||
      first(assignment, ["encoded_id", "external_id"]) ||
      caseId,
    elderName: first(caseRow, ["name", "elder_name"]) || first(assignment, ["name"]) || "未知名",
    assignmentId,
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
  };
}

export function buildInProgressVisitBoard(
  sources: InProgressVisitBoardSources,
  options?: { mode?: "gas" | "demo"; today?: string; note?: string },
): InProgressVisitBoard {
  const today = options?.today ?? taipeiToday();
  const mode = options?.mode ?? "gas";
  const visitorNames = new Map(
    sources.visitors.map((row) => [
      first(row, ["visitor_id", "id"]),
      first(row, ["name", "full_name", "worker_name"]),
    ]),
  );

  const inProgressCases = sources.cases.filter(
    (row) => first(row, ["visit_status"]) === "進行中",
  );

  type MutableVisitor = {
    visitorId: string;
    visitorName: string;
    cases: InProgressCaseProgress[];
  };
  const byDate = new Map<string, Map<string, MutableVisitor>>();

  for (const caseRow of inProgressCases) {
    const caseId = first(caseRow, ["case_id", "id"]);
    if (!caseId) continue;
    const assignment = pickActiveAssignment(caseId, sources.assignments);
    const dateFromAssignment = assignment ? assignmentVisitDate(assignment) : "";
    const dateFromCase =
      assignmentVisitDate(caseRow) ||
      text(caseRow.due_date).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ||
      "";
    const dateKey = dateFromAssignment || dateFromCase || UNSCHEDULED_DATE_KEY;

    const visitorIdRaw = first(assignment, ["visitor_id"]) || first(caseRow, ["visitor_id"]);
    const visitorId = visitorIdRaw || UNASSIGNED_VISITOR_ID;
    const visitorName =
      visitorId === UNASSIGNED_VISITOR_ID
        ? UNASSIGNED_VISITOR_NAME
        : visitorNames.get(visitorId) || visitorIdRaw || UNASSIGNED_VISITOR_NAME;

    const assignmentId = first(assignment, ["assignment_id", "id"]);
    const progress = assignmentId
      ? sources.progressByAssignment?.get(assignmentId)
      : undefined;
    const caseProgress: InProgressCaseProgress = {
      ...emptyProgress(caseRow, assignment),
      ...progress,
      caseId,
      assignmentId: progress?.assignmentId || assignmentId,
    };

    if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
    const visitors = byDate.get(dateKey)!;
    if (!visitors.has(visitorId)) {
      visitors.set(visitorId, { visitorId, visitorName, cases: [] });
    }
    visitors.get(visitorId)!.cases.push(caseProgress);
  }

  const dateBuckets: InProgressDateBucket[] = [...byDate.entries()]
    .map(([dateKey, visitorsMap]) => {
      const visitors = [...visitorsMap.values()]
        .map((visitor) => {
          const cases = [...visitor.cases].sort(compareCases);
          const group: InProgressVisitorGroup = {
            visitorId: visitor.visitorId,
            visitorName: visitor.visitorName,
            caseCount: cases.length,
            incompleteCount: cases.filter(isIncomplete).length,
            checkedInCount: cases.filter((item) => Boolean(item.checkinAt)).length,
            careFormCompletedCount: cases.filter(isCareFormComplete).length,
            cases,
          };
          return group;
        })
        .sort(compareVisitors);
      const meta = dateBucketMeta(dateKey, today);
      return {
        dateKey,
        label: meta.label,
        kind: meta.kind,
        caseCount: visitors.reduce((sum, visitor) => sum + visitor.caseCount, 0),
        visitorCount: visitors.length,
        visitors,
      };
    })
    .sort(compareDateBuckets);

  return {
    mode,
    generatedAt: new Date().toISOString(),
    today,
    totalCases: inProgressCases.length,
    dateBuckets,
    note: options?.note,
  };
}

export function createDemoInProgressVisitBoard(today = taipeiToday()): InProgressVisitBoard {
  const yesterday = shiftDate(today, -1);
  const tomorrow = shiftDate(today, 1);
  const at = (date: string, time: string) => `${date}T${time}:00+08:00`;

  const cases: RawRow[] = [
    { case_id: "CASE-IP-001", visit_status: "進行中", name: "林阿梅", external_id: "YH-115-0018" },
    { case_id: "CASE-IP-002", visit_status: "進行中", name: "陳水木", external_id: "YH-115-0031" },
    { case_id: "CASE-IP-003", visit_status: "進行中", name: "張進福", external_id: "YH-115-0046" },
    { case_id: "CASE-IP-004", visit_status: "進行中", name: "許秀蘭", external_id: "YH-115-0052" },
    { case_id: "CASE-IP-005", visit_status: "進行中", name: "黃春花", external_id: "YH-115-0064" },
    { case_id: "CASE-IP-006", visit_status: "進行中", name: "測試案件甲", external_id: "YH-115-0099" },
  ];
  const assignments: RawRow[] = [
    {
      assignment_id: "ASG-IP-001",
      case_id: "CASE-IP-001",
      visitor_id: "visitor_demo_01",
      status: "進行中",
      due_date: yesterday,
    },
    {
      assignment_id: "ASG-IP-002",
      case_id: "CASE-IP-002",
      visitor_id: "visitor_demo_01",
      status: "進行中",
      due_date: today,
    },
    {
      assignment_id: "ASG-IP-003",
      case_id: "CASE-IP-003",
      visitor_id: "visitor_demo_02",
      status: "進行中",
      due_date: today,
    },
    {
      assignment_id: "ASG-IP-004",
      case_id: "CASE-IP-004",
      visitor_id: "visitor_demo_02",
      status: "進行中",
      due_date: tomorrow,
    },
    {
      assignment_id: "ASG-IP-005",
      case_id: "CASE-IP-005",
      visitor_id: "visitor_demo_03",
      status: "進行中",
      due_date: tomorrow,
    },
    {
      assignment_id: "ASG-IP-006",
      case_id: "CASE-IP-006",
      visitor_id: "",
      status: "進行中",
    },
  ];
  const visitors: RawRow[] = [
    { visitor_id: "visitor_demo_01", name: "王美華" },
    { visitor_id: "visitor_demo_02", name: "李志明" },
    { visitor_id: "visitor_demo_03", name: "陳雅婷" },
  ];
  const progressByAssignment = new Map<string, Partial<InProgressCaseProgress>>([
    [
      "ASG-IP-001",
      {
        checkinAt: "",
        careFormStatus: "尚未填寫",
        careFormCompletion: 0,
        careSummary: "逾期尚未簽到",
        visitResult: "尚未填報",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ],
    [
      "ASG-IP-002",
      {
        checkinAt: at(today, "09:05"),
        checkoutAt: at(today, "09:52"),
        serviceMinutes: 47,
        serviceHours: hoursFromMinutes(47) || "0",
        careFormStatus: "已提交",
        careFormCompletion: 100,
        careSummary: "精神狀況良好，已確認用藥與送餐服務。",
        visitResult: "訪視成功",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ],
    [
      "ASG-IP-003",
      {
        checkinAt: at(today, "13:25"),
        checkoutAt: "",
        careFormStatus: "尚未填寫",
        careFormCompletion: 20,
        careSummary: "已到宅，關懷表填寫中",
        visitResult: "尚未填報",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ],
    [
      "ASG-IP-004",
      {
        checkinAt: "",
        careFormStatus: "尚未填寫",
        careFormCompletion: 0,
        careSummary: "尚無關懷表內容",
        visitResult: "尚未填報",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ],
    [
      "ASG-IP-005",
      {
        checkinAt: "",
        careFormStatus: "尚未填寫",
        careFormCompletion: 0,
        careSummary: "尚無關懷表內容",
        visitResult: "尚未填報",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ],
    [
      "ASG-IP-006",
      {
        checkinAt: "",
        careFormStatus: "尚未填寫",
        careFormCompletion: 0,
        careSummary: "測試案件，尚未指定訪員",
        visitResult: "尚未填報",
        auditStatus: "待稽核",
        paymentStatus: "待稽核",
      },
    ],
  ]);

  return buildInProgressVisitBoard(
    { cases, assignments, visitors, progressByAssignment },
    {
      mode: "demo",
      today,
      note: "示範模式：各日案數加總＝進行中個案數，對應工作流「訪視中」。",
    },
  );
}

function shiftDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
