import { mockRepository } from "@/lib/repositories/mock";
import { createClient } from "@/lib/supabase/server";
import { createAssignmentRecommendations } from "@/lib/domain/assignments";
import {
  createPaymentBatch,
  createPaymentBatchPreview,
  paymentFeeRules,
} from "@/lib/domain/payments";
import type {
  ElderCase,
  PaymentBatchItem,
  PaymentFeeRule,
  PlatformBlueprint,
  VisitSchedule,
  VisitorProfile,
  Workspace,
  WorkspaceModuleKey,
} from "@/lib/domain/types";
import type { AppRepository, CaseRegistryItem, WorkspaceWithUnit } from "@/lib/repositories/types";

export const supabaseRepository: AppRepository = {
  async getCurrentWorkspace() {
    const workspaces = await getSupabaseWorkspaces();
    return workspaces[0] ?? mockRepository.getCurrentWorkspace();
  },
  async getWorkspaces() {
    const workspaces = await getSupabaseWorkspaces();

    if (workspaces.length === 0) {
      return mockRepository.getWorkspaces();
    }

    return workspaces;
  },
  async getDashboardMetrics() {
    return mockRepository.getDashboardMetrics();
  },
  async getActivityItems() {
    return mockRepository.getActivityItems();
  },
  async getVisitorTasks() {
    return mockRepository.getVisitorTasks();
  },
  async getVisitTask(scheduleId: string) {
    return mockRepository.getVisitTask(scheduleId);
  },
  async getCaseRegistry() {
    const cases = await getSupabaseCaseRegistry();
    return cases.length > 0 ? cases : mockRepository.getCaseRegistry();
  },
  async getCaseRegistrySummary() {
    const cases = await this.getCaseRegistry();
    return {
      total: cases.length,
      highRisk: cases.filter((elderCase) => elderCase.riskLevel === "high").length,
      pending: cases.filter((elderCase) => elderCase.status === "pending").length,
      assigned: cases.filter((elderCase) => elderCase.status === "assigned").length,
      closed: cases.filter((elderCase) => elderCase.status === "closed").length,
    };
  },
  async getAssignmentDashboard() {
    const data = await getSupabaseAssignmentDashboard();
    return data ?? mockRepository.getAssignmentDashboard();
  },
  async confirmAssignment(recommendationId: string, visitorId?: string) {
    return mockRepository.confirmAssignment(recommendationId, visitorId);
  },
  async getPaymentBatchPreview() {
    const feeRule = await getSupabasePaymentFeeRule();
    const items = await getSupabasePaymentBatchItems(feeRule);
    return {
      batch: items.length > 0 ? createPaymentBatchPreview(items) : createPaymentBatchPreview(),
      feeRule,
    };
  },
  async createPaymentBatch() {
    const feeRule = await getSupabasePaymentFeeRule();
    const items = await getSupabasePaymentBatchItems(feeRule);
    return {
      batch: items.length > 0 ? createPaymentBatch(items) : createPaymentBatch(),
      feeRule,
    };
  },
};

async function getSupabaseWorkspaces(): Promise<WorkspaceWithUnit[]> {
  try {
    const supabase = await createClient();
    const fallbackWorkspace = await mockRepository.getCurrentWorkspace();
    const fallbackWorkspaces = await mockRepository.getWorkspaces();
    const fallbackUnit = fallbackWorkspaces.find((workspace) => workspace.id === fallbackWorkspace.id)?.unit;
    const { data, error } = await supabase
      .from("workspaces")
      .select(
        `
          id,
          unit_id,
          workspace_name,
          workspace_type,
          status,
          units (
            id,
            unit_name,
            unit_type,
            city,
            district
          ),
          platform_blueprints (
            id,
            blueprint_name,
            blueprint_type,
            description,
            config
          )
        `,
      )
      .eq("status", "active")
      .limit(10);

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((row) => mapWorkspaceRow(row, fallbackWorkspace, fallbackUnit));
  } catch {
    return [];
  }
}

type SupabaseWorkspaceRow = {
  id: string;
  unit_id: string;
  workspace_name: string;
  workspace_type: string | null;
  status: string;
  units:
    | {
        id: string;
        unit_name: string;
        unit_type: string | null;
        city: string | null;
        district: string | null;
      }
    | null
    | Array<{
        id: string;
        unit_name: string;
        unit_type: string | null;
        city: string | null;
        district: string | null;
      }>;
  platform_blueprints:
    | {
        id: string;
        blueprint_name: string;
        blueprint_type: string;
        description: string | null;
        config: unknown;
      }
    | null
    | Array<{
        id: string;
        blueprint_name: string;
        blueprint_type: string;
        description: string | null;
        config: unknown;
      }>;
};

function mapWorkspaceRow(
  row: SupabaseWorkspaceRow,
  fallback: Workspace,
  fallbackUnit: WorkspaceWithUnit["unit"],
): WorkspaceWithUnit {
  const unit = Array.isArray(row.units) ? row.units[0] : row.units;
  const blueprintRow = Array.isArray(row.platform_blueprints)
    ? row.platform_blueprints[0]
    : row.platform_blueprints;
  const blueprint: PlatformBlueprint = blueprintRow
    ? {
        id: blueprintRow.id,
        name: blueprintRow.blueprint_name,
        type: fallback.type,
        version: "1.0.0",
        firstMarketFit: getBlueprintFirstMarketFit(blueprintRow.config),
        description: blueprintRow.description ?? fallback.blueprint.description,
      }
    : fallback.blueprint;

  return {
    ...fallback,
    id: row.id,
    unitId: row.unit_id,
    name: row.workspace_name,
    type: fallback.type,
    status: row.status === "active" ? "active" : fallback.status,
    blueprint,
    unit: unit
      ? {
          id: unit.id,
          unitName: unit.unit_name,
          unitType: fallbackUnit?.unitType ?? "government",
          city: unit.city ?? "",
          district: unit.district ?? "",
        }
      : fallbackUnit,
  };
}

function getBlueprintFirstMarketFit(config: unknown) {
  if (!config || typeof config !== "object" || !("first_market_fit" in config)) {
    return true;
  }

  return Boolean(config.first_market_fit);
}

async function getSupabaseCaseRegistry(): Promise<CaseRegistryItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase as unknown as SupabaseCaseClient)
      .from("elder_cases")
      .select(
        `
          id,
          case_code,
          name,
          birth_date,
          gender,
          phone,
          mobile_phone,
          address,
          district,
          village,
          service_unit,
          line_id_status,
          line_id_note,
          emergency_contact_name,
          emergency_contact_relationship,
          emergency_contact_phone,
          household_city,
          household_district,
          household_village,
          household_address,
          residence_city,
          residence_district,
          residence_village,
          residence_address,
          residence_address_note,
          solitary_status,
          source_sheet_name,
          source_row_number,
          import_batch_code,
          import_visit_result,
          import_visitor_name,
          required_visitor_types,
          co_visit_required,
          risk_level,
          status,
          visit_schedule (
            visit_date,
            assignment_reason
          )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((row): CaseRegistryItem => {
      const schedules = Array.isArray(row.visit_schedule) ? row.visit_schedule : [];
      const latestSchedule = schedules.at(-1);

      return {
        id: row.id,
        caseCode: row.case_code,
        name: row.name,
        age: getAgeFromBirthDate(row.birth_date),
        gender: row.gender,
        phone: row.phone ?? "未填寫",
        mobilePhone: row.mobile_phone,
        address: row.address ?? "未填寫",
        district: row.district ?? "未填寫",
        village: row.village ?? "待補里別",
        serviceUnit: row.service_unit,
        lineIdStatus: row.line_id_status,
        lineIdNote: row.line_id_note,
        emergencyContactName: row.emergency_contact_name,
        emergencyContactRelationship: row.emergency_contact_relationship,
        emergencyContactPhone: row.emergency_contact_phone,
        householdCity: row.household_city,
        householdDistrict: row.household_district,
        householdVillage: row.household_village,
        householdAddress: row.household_address,
        residenceCity: row.residence_city,
        residenceDistrict: row.residence_district,
        residenceVillage: row.residence_village,
        residenceAddress: row.residence_address,
        residenceAddressNote: row.residence_address_note,
        solitaryStatus: row.solitary_status,
        sourceSheetName: row.source_sheet_name,
        sourceRowNumber: row.source_row_number,
        importBatchCode: row.import_batch_code,
        importVisitResult: row.import_visit_result,
        importVisitorName: row.import_visitor_name,
        requiredVisitorTypes: normalizeRequiredVisitorTypes(row.required_visitor_types),
        coVisitRequired: Boolean(row.co_visit_required),
        riskLevel: normalizeRiskLevel(row.risk_level),
        status: normalizeCaseStatus(row.status),
        visitCount: schedules.length,
        latestVisitDate: latestSchedule?.visit_date ?? null,
        latestAssignmentReason: latestSchedule?.assignment_reason ?? "尚未派案",
      };
    });
  } catch {
    return [];
  }
}

async function getSupabaseAssignmentDashboard() {
  try {
    const [cases, schedules, visitors] = await Promise.all([
      getSupabaseAssignmentCases(),
      getSupabaseVisitSchedules(),
      getSupabaseVisitorProfiles(),
    ]);

    if (cases.length === 0 || schedules.length === 0 || visitors.length === 0) {
      return null;
    }

    return {
      visitors,
      recommendations: createAssignmentRecommendations(schedules, cases, visitors),
      cases,
    };
  } catch {
    return null;
  }
}

async function getSupabaseAssignmentCases(): Promise<ElderCase[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as SupabaseAssignmentCaseClient)
    .from("elder_cases")
    .select(
      `
        id,
        case_code,
        name,
        birth_date,
        gender,
        phone,
        mobile_phone,
        address,
        district,
        village,
        service_unit,
        line_id_status,
        line_id_note,
        emergency_contact_name,
        emergency_contact_relationship,
        emergency_contact_phone,
        household_city,
        household_district,
        household_village,
        household_address,
        residence_city,
        residence_district,
        residence_village,
        residence_address,
        residence_address_note,
        solitary_status,
        source_sheet_name,
        source_row_number,
        import_batch_code,
        import_visit_result,
        import_visitor_name,
        required_visitor_types,
        co_visit_required,
        risk_level,
        status
      `,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    caseCode: row.case_code,
    name: row.name,
    age: getAgeFromBirthDate(row.birth_date),
    gender: row.gender,
    phone: row.phone ?? "未填寫",
    mobilePhone: row.mobile_phone,
    address: row.address ?? "未填寫",
    district: row.district ?? "未填寫",
    village: row.village ?? "待補里別",
    serviceUnit: row.service_unit,
    lineIdStatus: row.line_id_status,
    lineIdNote: row.line_id_note,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactRelationship: row.emergency_contact_relationship,
    emergencyContactPhone: row.emergency_contact_phone,
    householdCity: row.household_city,
    householdDistrict: row.household_district,
    householdVillage: row.household_village,
    householdAddress: row.household_address,
    residenceCity: row.residence_city,
    residenceDistrict: row.residence_district,
    residenceVillage: row.residence_village,
    residenceAddress: row.residence_address,
    residenceAddressNote: row.residence_address_note,
    solitaryStatus: row.solitary_status,
    sourceSheetName: row.source_sheet_name,
    sourceRowNumber: row.source_row_number,
    importBatchCode: row.import_batch_code,
    importVisitResult: row.import_visit_result,
    importVisitorName: row.import_visitor_name,
    requiredVisitorTypes: normalizeRequiredVisitorTypes(row.required_visitor_types),
    coVisitRequired: Boolean(row.co_visit_required),
    riskLevel: normalizeRiskLevel(row.risk_level),
    status: normalizeCaseStatus(row.status),
  }));
}

async function getSupabaseVisitSchedules(): Promise<VisitSchedule[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as SupabaseVisitScheduleClient)
    .from("visit_schedule")
    .select(
      `
        id,
        workspace_id,
        case_id,
        visitor_id,
        co_visitor_id,
        visit_date,
        visit_attempt,
        status,
        assignment_reason
      `,
    )
    .order("visit_date", { ascending: true })
    .limit(200);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    caseId: row.case_id,
    visitorId: row.visitor_id,
    coVisitorId: row.co_visitor_id,
    visitDate: row.visit_date ?? new Date().toISOString(),
    visitAttempt: row.visit_attempt ?? 1,
    status: normalizeVisitScheduleStatus(row.status),
    assignmentReason: row.assignment_reason ?? "尚未填寫派案原因",
    requiredFormTemplateIds: [],
  }));
}

async function getSupabaseVisitorProfiles(): Promise<VisitorProfile[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as SupabaseVisitorProfileClient)
    .from("visitor_profiles")
    .select(
      `
        id,
        full_name,
        worker_type,
        district_coverage,
        village_coverage,
        active_task_count,
        max_daily_tasks,
        trained_modules,
        visitor_certificate_no,
        certificate_status,
        training_date,
        bank_account_last5,
        remittance_ready,
        status
      `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    workerType: normalizeWorkerType(row.worker_type),
    districtCoverage: normalizeStringArray(row.district_coverage, ["北區"]),
    villageCoverage: normalizeStringArray(row.village_coverage, []),
    activeTaskCount: row.active_task_count ?? 0,
    maxDailyTasks: row.max_daily_tasks ?? 6,
    trainedModules: normalizeWorkspaceModules(row.trained_modules),
    visitorCertificateNo: row.visitor_certificate_no,
    certificateStatus: normalizeCertificateStatus(row.certificate_status),
    trainingDate: row.training_date,
    bankAccountLast5: row.bank_account_last5,
    remittanceReady: Boolean(row.remittance_ready),
    status: normalizeVisitorStatus(row.status),
  }));
}

async function getSupabasePaymentFeeRule(): Promise<PaymentFeeRule> {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase as unknown as SupabasePaymentFeeRuleClient)
      .from("payment_fee_rules")
      .select(
        `
          visit_fee,
          data_processing_fee,
          currency,
          effective_from,
          review_note
        `,
      )
      .eq("status", "active")
      .order("effective_from", { ascending: false })
      .limit(1);

    const row = data?.[0];
    if (error || !row) {
      return paymentFeeRules;
    }

    const visitFee = Number(row.visit_fee);
    const dataProcessingFee = Number(row.data_processing_fee);

    return {
      visitFee,
      dataProcessingFee,
      totalPerCompletedVisit: visitFee + dataProcessingFee,
      currency: row.currency ?? paymentFeeRules.currency,
      effectiveFrom: row.effective_from ?? paymentFeeRules.effectiveFrom,
      description:
        row.review_note ??
        `訪視費 ${visitFee} 元，加資料處理費 ${dataProcessingFee} 元。`,
    };
  } catch {
    return paymentFeeRules;
  }
}

async function getSupabasePaymentBatchItems(feeRule: PaymentFeeRule): Promise<PaymentBatchItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase as unknown as SupabasePaymentLockClient)
      .from("payment_locks")
      .select(
        `
          id,
          payment_record_id,
          locked_at,
          total_fee,
          export_ready,
          metadata
        `,
      )
      .eq("export_ready", true)
      .order("locked_at", { ascending: false })
      .limit(50);

    if (error || !data) {
      return [];
    }

    return data.map((row, index) => {
      const metadata = normalizeRecord(row.metadata);
      const totalFee = Number(row.total_fee || feeRule.totalPerCompletedVisit);
      return {
        id: row.id,
        caseCode: getStringValue(metadata.case_code, `PAY-${index + 1}`),
        elderName: getStringValue(metadata.elder_name, "未填寫"),
        visitRecordId: row.payment_record_id ?? row.id,
        lockedAt: row.locked_at,
        visitFee: getNumberValue(metadata.visit_fee, feeRule.visitFee),
        dataProcessingFee: getNumberValue(metadata.data_processing_fee, feeRule.dataProcessingFee),
        totalFee,
        status: "locked",
      };
    });
  } catch {
    return [];
  }
}

function getAgeFromBirthDate(birthDate: string | null) {
  if (!birthDate) {
    return 0;
  }

  const birthYear = new Date(birthDate).getFullYear();
  const currentYear = new Date().getFullYear();
  return Number.isFinite(birthYear) ? currentYear - birthYear : 0;
}

type SupabaseCaseClient = {
  from(table: "elder_cases"): {
    select(query: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): Promise<{
          data: SupabaseCaseRow[] | null;
          error: unknown;
        }>;
      };
    };
  };
};

type SupabaseAssignmentCaseClient = {
  from(table: "elder_cases"): {
    select(query: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): Promise<{
          data: SupabaseAssignmentCaseRow[] | null;
          error: unknown;
        }>;
      };
    };
  };
};

type SupabaseVisitScheduleClient = {
  from(table: "visit_schedule"): {
    select(query: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): Promise<{
          data: SupabaseVisitScheduleRow[] | null;
          error: unknown;
        }>;
      };
    };
  };
};

type SupabaseVisitorProfileClient = {
  from(table: "visitor_profiles"): {
    select(query: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): Promise<{
          data: SupabaseVisitorProfileRow[] | null;
          error: unknown;
        }>;
      };
    };
  };
};

type SupabasePaymentFeeRuleClient = {
  from(table: "payment_fee_rules"): {
    select(query: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): Promise<{
            data: SupabasePaymentFeeRuleRow[] | null;
            error: unknown;
          }>;
        };
      };
    };
  };
};

type SupabasePaymentLockClient = {
  from(table: "payment_locks"): {
    select(query: string): {
      eq(column: string, value: boolean): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): Promise<{
            data: SupabasePaymentLockRow[] | null;
            error: unknown;
          }>;
        };
      };
    };
  };
};

type SupabaseCaseRow = {
  id: string;
  case_code: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
  phone: string | null;
  mobile_phone: string | null;
  address: string | null;
  district: string | null;
  village: string | null;
  service_unit: string | null;
  line_id_status: string | null;
  line_id_note: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  household_city: string | null;
  household_district: string | null;
  household_village: string | null;
  household_address: string | null;
  residence_city: string | null;
  residence_district: string | null;
  residence_village: string | null;
  residence_address: string | null;
  residence_address_note: string | null;
  solitary_status: string | null;
  source_sheet_name: string | null;
  source_row_number: number | null;
  import_batch_code: string | null;
  import_visit_result: string | null;
  import_visitor_name: string | null;
  required_visitor_types: unknown;
  co_visit_required: boolean | null;
  risk_level: string | null;
  status: string;
  visit_schedule:
    | Array<{
        visit_date: string | null;
        assignment_reason: string | null;
      }>
    | null;
};

type SupabaseAssignmentCaseRow = Omit<SupabaseCaseRow, "visit_schedule">;

type SupabaseVisitScheduleRow = {
  id: string;
  workspace_id: string;
  case_id: string;
  visitor_id: string;
  co_visitor_id: string | null;
  visit_date: string | null;
  visit_attempt: number | null;
  status: string;
  assignment_reason: string | null;
};

type SupabaseVisitorProfileRow = {
  id: string;
  full_name: string;
  worker_type: string | null;
  district_coverage: unknown;
  village_coverage: unknown;
  active_task_count: number | null;
  max_daily_tasks: number | null;
  trained_modules: unknown;
  visitor_certificate_no: string | null;
  certificate_status: string | null;
  training_date: string | null;
  bank_account_last5: string | null;
  remittance_ready: boolean | null;
  status: string;
};

type SupabasePaymentFeeRuleRow = {
  visit_fee: number | string;
  data_processing_fee: number | string;
  currency: string | null;
  effective_from: string | null;
  review_note: string | null;
};

type SupabasePaymentLockRow = {
  id: string;
  payment_record_id: string | null;
  locked_at: string;
  total_fee: number | string;
  export_ready: boolean;
  metadata: unknown;
};

function normalizeRiskLevel(riskLevel: string | null): ElderCase["riskLevel"] {
  if (riskLevel === "low" || riskLevel === "medium" || riskLevel === "high") {
    return riskLevel;
  }

  return "medium";
}

function normalizeRequiredVisitorTypes(value: unknown): ElderCase["requiredVisitorTypes"] {
  if (!Array.isArray(value)) {
    return ["social_affairs"];
  }

  const validTypes = value.filter(
    (item): item is ElderCase["requiredVisitorTypes"][number] =>
      item === "social_affairs" || item === "civil_affairs" || item === "general",
  );

  return validTypes.length > 0 ? validTypes : ["social_affairs"];
}

function normalizeWorkerType(value: string | null): VisitorProfile["workerType"] {
  if (value === "social_affairs" || value === "civil_affairs" || value === "general") {
    return value;
  }

  return "general";
}

function normalizeCertificateStatus(value: string | null): VisitorProfile["certificateStatus"] {
  if (value === "valid" || value === "missing" || value === "expired") {
    return value;
  }

  return "missing";
}

function normalizeVisitorStatus(value: string): VisitorProfile["status"] {
  if (value === "available" || value === "busy" || value === "inactive") {
    return value;
  }

  return "available";
}

function normalizeVisitScheduleStatus(value: string): VisitSchedule["status"] {
  if (
    value === "pending" ||
    value === "in_progress" ||
    value === "submitted" ||
    value === "needs_follow_up"
  ) {
    return value;
  }

  return "pending";
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : fallback;
}

function normalizeWorkspaceModules(value: unknown): WorkspaceModuleKey[] {
  const modules = normalizeStringArray(value, []);
  return modules.filter((item): item is WorkspaceModuleKey =>
    [
      "case_import",
      "assignment",
      "visit_form",
      "consent",
      "audit",
      "payment",
      "export",
      "kpi",
      "notification",
    ].includes(item),
  );
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getStringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function getNumberValue(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeCaseStatus(status: string): ElderCase["status"] {
  if (
    status === "pending" ||
    status === "assigned" ||
    status === "visited" ||
    status === "auditing" ||
    status === "closed"
  ) {
    return status;
  }

  return "pending";
}
