import { normalizeDeskWorkerGroup } from "@/lib/domain/desk-care-batch";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import type {
  ElderCase,
  VisitSchedule,
  VisitorRegistrationWorkerGroup,
} from "@/lib/domain/types";
import { formatYongheVillageCode } from "@/lib/domain/village-admins";

export const MANAGER_DESK_NOTE = "公所代填・紙本";

const ACTIVE_ASSIGNMENT_STATUSES = new Set(["待接案", "進行中", "空訪續訪"]);

export type DeskVisitorOption = {
  id: string;
  name: string;
  badgeNo: string;
  status: string;
  nationalId: string;
  phone: string;
  workerGroup: VisitorRegistrationWorkerGroup | "unknown";
};

export type DeskCaseOption = {
  id: string;
  caseCode: string;
  name: string;
  village: string;
  address: string;
  visitStatus: string;
  phone: string;
  /** 紙本里民順序（Excel 里編號）；同里內 KEY 對照用 */
  villageSeq: number | null;
  /** 里編碼六碼，如 040051（上林里） */
  villageCode: string;
  externalId: string;
};

export type DeskNewCaseInput = {
  name: string;
  idNumber?: string;
  gender?: string;
  birthDate?: string;
  village?: string;
  address?: string;
  phone?: string;
  mobile?: string;
};

export type DeskPrepareCaseRef = {
  caseId: string;
  caseName?: string;
  caseCode?: string;
};

export type DeskPrepareInput = {
  caseId?: string;
  caseIds?: string[];
  /** 帶名稱／編碼可少打 GAS cases.get，加速大量 KEY 準備 */
  cases?: DeskPrepareCaseRef[];
  newCase?: DeskNewCaseInput;
  visitorId: string;
  companionVisitorIds?: string[];
  visitorName?: string;
  companionNames?: Record<string, string>;
  visitDate?: string;
  visitStartTime?: string;
  visitEndTime?: string;
  /** field_self＝訪員自領／現場 KEY；預設紙本代填 */
  source?: "desk_paper" | "field_self";
};

export function isActiveAssignmentStatus(status: string) {
  return ACTIVE_ASSIGNMENT_STATUSES.has(String(status ?? "").trim());
}

export function parseCareformAnswers(row: unknown): MohwLifeCareAnswers | undefined {
  if (!row || typeof row !== "object") return undefined;
  const record = row as Record<string, unknown>;
  if (record.answers && typeof record.answers === "object" && !Array.isArray(record.answers)) {
    return record.answers as MohwLifeCareAnswers;
  }
  if (typeof record.answers_json === "string" && record.answers_json.trim()) {
    try {
      const parsed = JSON.parse(record.answers_json) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as MohwLifeCareAnswers;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function mapDeskCase(
  row: Record<string, unknown>,
  villageCodeByName?: Record<string, string>,
): DeskCaseOption {
  const caseId = String(row.case_id ?? row.external_id ?? "");
  const seqRaw = row.village_seq ?? row.villageSeq;
  const seqNum = Number(seqRaw);
  const village = String(row.visit_village ?? row.household_village ?? "");
  const fromRow = formatYongheVillageCode(
    (row.village_code ?? row.villageCode) as string | number | null | undefined,
  );
  const fromMap = village ? formatYongheVillageCode(villageCodeByName?.[village]) : "";
  return {
    id: caseId,
    caseCode: String(row.encoded_id ?? row.external_id ?? caseId),
    name: String(row.name ?? ""),
    village,
    address: String(row.address ?? ""),
    visitStatus: String(row.visit_status ?? "待訪"),
    phone: String(row.primary_phone ?? ""),
    villageSeq: Number.isFinite(seqNum) && seqNum > 0 ? seqNum : null,
    villageCode: fromRow || fromMap,
    externalId: String(row.external_id ?? "").trim(),
  };
}

/** 關懷表建檔個案清單：依紙本里編號（village_seq）排序。 */
export function compareDeskCasesByVillageSeq(a: DeskCaseOption, b: DeskCaseOption) {
  const aSeq = a.villageSeq ?? (Number(a.externalId) || Number.POSITIVE_INFINITY);
  const bSeq = b.villageSeq ?? (Number(b.externalId) || Number.POSITIVE_INFINITY);
  if (aSeq !== bSeq) return aSeq - bSeq;
  return a.name.localeCompare(b.name, "zh-Hant");
}

export function mapDeskVisitor(row: Record<string, unknown>): DeskVisitorOption {
  return {
    id: String(row.visitor_id ?? ""),
    name: String(row.name ?? row.full_name ?? ""),
    badgeNo: String(row.badge_no ?? row.visitor_code ?? ""),
    status: String(row.status ?? ""),
    nationalId: String(row.id_number ?? "").trim().toUpperCase(),
    phone: String(row.phone ?? row.primary_phone ?? row.mobile ?? "").trim(),
    workerGroup: normalizeDeskWorkerGroup(
      row.volunteer_group ?? row.worker_group ?? row.workerGroup,
    ),
  };
}

export function toDeskElderCase(row: Record<string, unknown>): ElderCase {
  const caseId = String(row.case_id ?? row.external_id ?? "");
  const encodedId = String(row.encoded_id ?? "");
  return {
    id: caseId,
    caseCode: encodedId || String(row.external_id ?? caseId),
    name: String(row.name ?? ""),
    age: Number(row.age) || 0,
    gender: row.gender ? String(row.gender) : null,
    birthDate: row.birth_date != null && String(row.birth_date).trim() ? String(row.birth_date) : null,
    nationalId: row.id_number ? String(row.id_number) : null,
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
    householdDistrict: String(row.household_district ?? "永和區"),
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
    riskLevel: "medium",
    status: "assigned",
  };
}

export function toDeskSchedule(
  assignment: Record<string, unknown>,
  visitDate: string,
): VisitSchedule {
  return {
    id: String(assignment.assignment_id ?? ""),
    workspaceId: process.env.GAS_WORKSPACE_ID ?? "WS-YH-115",
    caseId: String(assignment.case_id ?? ""),
    visitorId: String(assignment.visitor_id ?? ""),
    coVisitorId: null,
    visitDate,
    visitAttempt: Number(assignment.visit_attempt ?? 1) || 1,
    status: "in_progress",
    assignmentReason: String(assignment.notes ?? MANAGER_DESK_NOTE),
    requiredFormTemplateIds: ["mohw_life_care_v1"],
  };
}
