import { gasClient } from "@/lib/gas-client";
import { blueprints } from "@/lib/domain/mock-data";
import { createPaymentBatchPreview, paymentFeeRules } from "@/lib/domain/payments";
import type {
  ActivityItem,
  AssignmentDecisionResult,
  DashboardMetric,
  ElderCase,
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

  async getVisitorTasks() {
    return [] satisfies VisitorTask[];
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
    const rows = (await gasClient.cases.list({ district: "永和區", visit_status: "待訪" })) as GasCaseRow[];
    const visitors = (await gasClient.visitors.list()) as GasCaseRow[];
    return {
      visitors: visitors.map((v) => ({
        id: String(v.visitor_id ?? ""),
        fullName: String(v.name ?? ""),
        workerType: "general" as const,
        districtCoverage: String(v.service_areas ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        villageCoverage: [],
        activeTaskCount: 0,
        maxDailyTasks: 8,
        trainedModules: ["assignment", "visit_form"],
        visitorCertificateNo: v.badge_no ? String(v.badge_no) : null,
        certificateStatus: v.badge_no ? ("valid" as const) : ("missing" as const),
        trainingDate: null,
        bankAccountLast5: null,
        remittanceReady: false,
        status: v.status === "已核准" ? ("available" as const) : ("inactive" as const),
      })),
      recommendations: rows.slice(0, 20).map((row, index) => ({
        id: `rec-${String(row.case_id ?? index)}`,
        caseId: String(row.case_id ?? ""),
        scheduleId: `sch-${String(row.case_id ?? index)}`,
        visitorId: "",
        score: 80 - index,
        status: "recommended" as const,
        reasons: [String(row.visit_village ?? ""), String(row.data_quality_tag ?? "待派案")].filter(Boolean),
        warnings: row.data_quality_tag ? [String(row.data_quality_tag)] : [],
      })),
    } satisfies AssignmentDashboardData;
  },

  async confirmAssignment(recommendationId: string) {
    return {
      recommendationId,
      status: "confirmed",
      assignedAt: new Date().toISOString(),
      message: "派案確認（GAS 模式）",
      activityLog: {
        entityType: "visit_schedule",
        action: "assignment_confirm",
      },
    } satisfies AssignmentDecisionResult;
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
