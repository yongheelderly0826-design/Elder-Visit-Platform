import { gasClient } from "@/lib/gas-client";
import { blueprints } from "@/lib/domain/mock-data";
import { createPaymentBatchPreview, paymentFeeRules } from "@/lib/domain/payments";
import type {
  ActivityItem,
  AssignmentDecisionResult,
  DashboardMetric,
  ElderCase,
  VisitSchedule,
  Workspace,
} from "@/lib/domain/types";
import type {
  AppRepository,
  AssignmentDashboardData,
  CaseRegistryItem,
  CaseRegistrySummary,
  PaymentBatchData,
  VisitorTask,
  WorkspaceWithUnit,
} from "@/lib/repositories/types";

type GasCaseRow = Record<string, string | number>;
type GasAssignmentRow = Record<string, string | number>;

function mapPriorityToRisk(priority: string): ElderCase["riskLevel"] {
  if (priority === "高" || priority === "urgent") return "high";
  if (priority === "低" || priority === "low") return "low";
  return "medium";
}

function mapVisitStatus(status: string): ElderCase["status"] {
  if (status === "待訪" || status === "待派案") return "pending";
  if (status === "進行中" || status.includes("已派")) return "assigned";
  if (status === "已完成") return "visited";
  if (status === "已稽核") return "auditing";
  if (status === "結案") return "closed";
  return "pending";
}

function mapAssignmentStatus(status: string): VisitSchedule["status"] {
  if (status === "進行中") return "in_progress";
  if (status === "已完成" || status === "已送出") return "submitted";
  if (status === "空訪續訪") return "needs_follow_up";
  return "pending";
}

function toElderCase(row: GasCaseRow): ElderCase {
  const externalId = String(row.external_id ?? "");
  const caseId = String(row.case_id ?? externalId);
  return {
    id: caseId,
    caseCode: externalId || caseId,
    name: String(row.name ?? ""),
    age: Number(row.age) || 0,
    gender: row.gender ? String(row.gender) : null,
    phone: String(row.primary_phone ?? ""),
    mobilePhone: row.secondary_phone ? String(row.secondary_phone) : null,
    address: String(row.address ?? ""),
    district: String(row.visit_district ?? "永和區"),
    village: String(row.visit_village ?? row.household_village ?? ""),
    serviceUnit: null,
    lineIdStatus: null,
    lineIdNote: null,
    emergencyContactName: null,
    emergencyContactRelationship: null,
    emergencyContactPhone: null,
    householdCity: "新北市",
    householdDistrict: row.household_district ? String(row.household_district) : "永和區",
    householdVillage: row.household_village ? String(row.household_village) : null,
    householdAddress: null,
    residenceCity: "新北市",
    residenceDistrict: String(row.visit_district ?? "永和區"),
    residenceVillage: row.visit_village ? String(row.visit_village) : null,
    residenceAddress: String(row.address ?? ""),
    residenceAddressNote: row.contact_note ? String(row.contact_note) : null,
    solitaryStatus: row.case_type ? String(row.case_type) : null,
    sourceSheetName: "GAS",
    sourceRowNumber: null,
    importBatchCode: null,
    importVisitResult: null,
    importVisitorName: null,
    requiredVisitorTypes: [],
    coVisitRequired: false,
    riskLevel: mapPriorityToRisk(String(row.dispatch_priority ?? "中")),
    status: mapVisitStatus(String(row.visit_status ?? "待訪")),
  };
}

function toVisitSchedule(
  row: GasAssignmentRow,
  attempt: number,
  workspaceId: string,
): VisitSchedule {
  const due = String(row.due_date ?? "").trim();
  const visitDate =
    due ||
    String(row.dispatched_at ?? "").slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  return {
    id: String(row.assignment_id ?? ""),
    workspaceId,
    caseId: String(row.case_id ?? ""),
    visitorId: String(row.visitor_id ?? ""),
    coVisitorId: null,
    visitDate,
    visitAttempt: attempt > 0 ? attempt : 1,
    status: mapAssignmentStatus(String(row.status ?? "待接案")),
    assignmentReason: String(row.notes ?? row.visit_village ?? "GAS 派案"),
    requiredFormTemplateIds: ["mohw_life_care_v1"],
  };
}

function toRegistryItem(row: GasCaseRow): CaseRegistryItem {
  const elderCase = toElderCase(row);
  return {
    ...elderCase,
    visitCount: 0,
    latestVisitDate: null,
    latestAssignmentReason: String(row.dispatch_priority ?? ""),
  };
}

function summarizeCases(cases: CaseRegistryItem[]): CaseRegistrySummary {
  return {
    total: cases.length,
    highRisk: cases.filter((c) => c.riskLevel === "high").length,
    pending: cases.filter((c) => c.status === "pending").length,
    assigned: cases.filter((c) => c.status === "assigned").length,
    closed: cases.filter((c) => c.status === "closed").length,
  };
}

async function buildVisitorTasks(visitorId?: string): Promise<VisitorTask[]> {
  const workspaceId = process.env.GAS_WORKSPACE_ID ?? "WS-YH-115";
  const assignmentParams: { active_only: string; visitor_id?: string } = {
    active_only: "true",
  };
  const resolvedVisitorId = visitorId || process.env.GAS_DEFAULT_VISITOR_ID;
  if (resolvedVisitorId) {
    assignmentParams.visitor_id = resolvedVisitorId;
  }

  const [assignments, cases, allAssignments] = await Promise.all([
    gasClient.assignments.list(assignmentParams) as Promise<GasAssignmentRow[]>,
    gasClient.cases.list({ district: "永和區" }) as Promise<GasCaseRow[]>,
    gasClient.assignments.list() as Promise<GasAssignmentRow[]>,
  ]);

  const caseMap = new Map(cases.map((row) => [String(row.case_id ?? ""), toElderCase(row)]));
  const historyCount = new Map<string, number>();
  for (const row of allAssignments) {
    const caseId = String(row.case_id ?? "");
    historyCount.set(caseId, (historyCount.get(caseId) ?? 0) + 1);
  }

  return assignments.flatMap((row) => {
    const caseId = String(row.case_id ?? "");
    const elderCase = caseMap.get(caseId);
    if (!elderCase) return [];
    return [
      {
        schedule: toVisitSchedule(row, historyCount.get(caseId) ?? 1, workspaceId),
        elderCase,
      },
    ];
  });
}

const yongheWorkspace: Workspace = {
  id: process.env.GAS_WORKSPACE_ID ?? "WS-YH-115",
  unitId: "unit_yonghe_office",
  name: "115年永和區獨居長者訪查",
  type: "elder_visit",
  status: "active",
  blueprint: blueprints[0],
  bindingStatus: "locked",
  responsiblePerson: "永和區公所承辦人",
  roleName: "workspace_manager",
  capabilities: [
    "dashboard.read",
    "cases.read",
    "cases.import",
    "cases.update",
    "assignment.manage",
    "assignment.confirm",
    "exports.create",
    "kpi.read",
  ],
  planName: "永和區公所",
  planLimits: [],
};

export const gasRepository: AppRepository = {
  async getCurrentWorkspace() {
    return yongheWorkspace;
  },

  async getWorkspaces() {
    const ws: WorkspaceWithUnit = {
      ...yongheWorkspace,
      unit: {
        id: "unit_yonghe_office",
        unitName: "新北市永和區公所",
        unitType: "government",
        city: "新北市",
        district: "永和區",
      },
    };
    return [ws];
  },

  async getDashboardMetrics() {
    const kpi = (await gasClient.reports.kpi("115")) as {
      total_assignments?: number;
      completed?: number;
      missed?: number;
      completion_rate?: number;
    };
    const cases = (await gasClient.cases.list({ district: "永和區" })) as GasCaseRow[];
    return [
      {
        key: "cases-total",
        label: "個案總數",
        value: String(cases.length),
        detail: "永和區個案名冊",
      },
      {
        key: "assignments-total",
        label: "派案總數",
        value: String(kpi.total_assignments ?? 0),
        detail: "GAS 派案紀錄",
      },
      {
        key: "completion-rate",
        label: "完成率",
        value: `${kpi.completion_rate ?? 0}%`,
        detail: "115 年訪查",
      },
      {
        key: "missed-visits",
        label: "空訪件數",
        value: String(kpi.missed ?? 0),
        detail: "待追蹤",
      },
    ] satisfies DashboardMetric[];
  },

  async getActivityItems() {
    return [] satisfies ActivityItem[];
  },

  async getVisitorTasks(visitorId?: string) {
    try {
      return await buildVisitorTasks(visitorId);
    } catch {
      return [] satisfies VisitorTask[];
    }
  },

  async getVisitTask(scheduleId: string) {
    const workspaceId = process.env.GAS_WORKSPACE_ID ?? "WS-YH-115";
    try {
      const row = (await gasClient.assignments.get(scheduleId)) as GasAssignmentRow | null;
      if (!row || !row.assignment_id) return null;
      const caseRow = (await gasClient.cases.get(String(row.case_id))) as GasCaseRow | null;
      if (!caseRow) return null;
      const allForCase = ((await gasClient.assignments.list()) as GasAssignmentRow[]).filter(
        (item) => String(item.case_id) === String(row.case_id),
      );
      return {
        schedule: toVisitSchedule(row, allForCase.length || 1, workspaceId),
        elderCase: toElderCase(caseRow),
      } satisfies VisitorTask;
    } catch {
      return null;
    }
  },

  async getCaseRegistry() {
    const rows = (await gasClient.cases.list({ district: "永和區" })) as GasCaseRow[];
    return rows.map(toRegistryItem);
  },

  async getCaseRegistrySummary() {
    const cases = await this.getCaseRegistry();
    return summarizeCases(cases);
  },

  async getAssignmentDashboard() {
    const [caseRows, visitorRows, assignmentRows] = await Promise.all([
      gasClient.cases.list({ district: "永和區" }) as Promise<GasCaseRow[]>,
      gasClient.visitors.list() as Promise<GasCaseRow[]>,
      gasClient.assignments.list({ active_only: "true" }) as Promise<GasAssignmentRow[]>,
    ]);

    const activeCountByVisitor = new Map<string, number>();
    for (const row of assignmentRows) {
      const visitorId = String(row.visitor_id ?? "");
      if (!visitorId) continue;
      activeCountByVisitor.set(visitorId, (activeCountByVisitor.get(visitorId) ?? 0) + 1);
    }

    const pendingRows = caseRows.filter((row) => {
      const status = String(row.visit_status ?? "");
      return status === "待訪" || status === "待派案" || status === "" || status === "pending";
    });
    const cases = pendingRows.map(toElderCase);

    return {
      cases,
      visitors: visitorRows.map((v) => {
        const visitorId = String(v.visitor_id ?? "");
        return {
          id: visitorId,
          fullName: String(v.name ?? ""),
          workerType: "general" as const,
          districtCoverage: String(v.service_areas ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          villageCoverage: [],
          activeTaskCount: activeCountByVisitor.get(visitorId) ?? 0,
          maxDailyTasks: 8,
          trainedModules: ["assignment", "visit_form"],
          visitorCertificateNo: v.badge_no ? String(v.badge_no) : null,
          certificateStatus: v.badge_no ? ("valid" as const) : ("missing" as const),
          trainingDate: null,
          bankAccountLast5: null,
          remittanceReady: false,
          status: v.status === "已核准" ? ("available" as const) : ("inactive" as const),
        };
      }),
      recommendations: cases.slice(0, 40).map((elderCase, index) => ({
        id: `rec-${elderCase.id}`,
        caseId: elderCase.id,
        scheduleId: `sch-${elderCase.id}`,
        visitorId: "",
        score: 80 - index,
        status: "recommended" as const,
        reasons: [
          elderCase.village,
          elderCase.riskLevel === "high" ? "高風險優先" : "待派案",
        ].filter(Boolean),
        warnings: [],
      })),
    } satisfies AssignmentDashboardData;
  },

  async confirmAssignment(recommendationId: string, visitorId?: string) {
    const caseId = recommendationId.replace(/^rec-/, "");
    if (!caseId) {
      return {
        recommendationId,
        status: "manual_review",
        assignedAt: null,
        message: "找不到派案建議，請重新整理派案佇列。",
        activityLog: {
          entityType: "visit_schedule",
          action: "assignment_confirm",
        },
      } satisfies AssignmentDecisionResult;
    }

    let resolvedVisitorId = visitorId?.trim() || "";
    if (!resolvedVisitorId) {
      const visitors = (await gasClient.visitors.list({ status: "已核准" })) as GasCaseRow[];
      resolvedVisitorId = String(visitors[0]?.visitor_id ?? "");
    }

    if (!resolvedVisitorId) {
      return {
        recommendationId,
        status: "manual_review",
        assignedAt: null,
        message: "請先選擇訪員，或於訪查員主檔建立已核准訪員後再派案。",
        activityLog: {
          entityType: "visit_schedule",
          action: "assignment_confirm",
        },
      } satisfies AssignmentDecisionResult;
    }

    try {
      const saved = (await gasClient.assignments.dispatch({
        case_id: caseId,
        visitor_id: resolvedVisitorId,
        notes: "由派案管理確認",
        auto_confirm: true,
      })) as GasAssignmentRow;

      return {
        recommendationId,
        status: "confirmed",
        assignedAt: new Date().toISOString(),
        message: `派案已確認（${String(saved.assignment_id ?? "")}），訪員任務清單會顯示此訪查。`,
        activityLog: {
          entityType: "visit_schedule",
          action: "assignment_confirm",
        },
      } satisfies AssignmentDecisionResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "派案失敗";
      return {
        recommendationId,
        status: "manual_review",
        assignedAt: null,
        message,
        activityLog: {
          entityType: "visit_schedule",
          action: "assignment_confirm",
        },
      } satisfies AssignmentDecisionResult;
    }
  },

  async getPaymentBatchPreview() {
    return {
      batch: createPaymentBatchPreview([]),
      feeRule: paymentFeeRules,
    } satisfies PaymentBatchData;
  },

  async createPaymentBatch() {
    return {
      batch: createPaymentBatchPreview([]),
      feeRule: paymentFeeRules,
    } satisfies PaymentBatchData;
  },
};
