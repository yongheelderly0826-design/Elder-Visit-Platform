import type {
  ConsentGovernanceResult,
  ConsentRecord,
  ConsentScope,
  ExportTemplateSummary,
} from "@/lib/domain/types";
import { governmentFormTemplates } from "@/lib/domain/government-forms";
import {
  consentDocumentIds,
  type ConsentDocumentId,
} from "@/lib/domain/consent-documents";

export const consentScopeLabels: Record<ConsentScope, string> = {
  internal_use: "單位內部服務",
  government_report: "政府成果回報",
  anonymous_kpi: "匿名統計 KPI",
  research_use: "研究分析",
  sponsor_reporting: "贊助成果揭露",
};

export const consentRecords: ConsentRecord[] = [
  {
    id: "consent_001",
    caseCode: "EV-115-0001",
    elderName: "林阿梅",
    signed: true,
    scopes: ["internal_use", "government_report", "anonymous_kpi"],
    signedDate: "2026-04-18",
    expiryDate: "2027-04-18",
    revoked: false,
    revokedAt: null,
    source: "visit_form",
  },
  {
    id: "consent_002",
    caseCode: "EV-115-0002",
    elderName: "陳水木",
    signed: true,
    scopes: ["internal_use", "anonymous_kpi"],
    signedDate: "2026-03-30",
    expiryDate: "2026-12-31",
    revoked: false,
    revokedAt: null,
    source: "paper_import",
  },
  {
    id: "consent_003",
    caseCode: "EV-115-0003",
    elderName: "黃秋霞",
    signed: false,
    scopes: [],
    signedDate: null,
    expiryDate: null,
    revoked: true,
    revokedAt: "2026-04-20T09:10:00+08:00",
    source: "guardian_upload",
  },
];

const personalDataKeys = new Set(["name"]);

export function getConsentPurposeOptions() {
  return Object.entries(consentScopeLabels).map(([value, label]) => ({
    value: value as ConsentScope,
    label,
  }));
}

export function getConsentGovernanceSummary() {
  const active = consentRecords.filter((record) => isConsentActive(record));
  const revoked = consentRecords.filter((record) => record.revoked);

  return {
    total: consentRecords.length,
    active: active.length,
    revoked: revoked.length,
    expiringSoon: consentRecords.filter(isExpiringSoon).length,
  };
}

export function evaluateExportConsent(
  template: ExportTemplateSummary,
  purpose: ConsentScope,
): ConsentGovernanceResult {
  const hasPersonalData = template.columns.some((column) => personalDataKeys.has(column.key));
  const allowsPersonalData = purpose === "internal_use" || purpose === "government_report";
  const redactedColumns =
    hasPersonalData && !allowsPersonalData
      ? template.columns
          .filter((column) => personalDataKeys.has(column.key))
          .map((column) => column.label)
      : [];
  const warnings: string[] = [];

  if (redactedColumns.length > 0) {
    warnings.push("此用途不得揭露可識別個資，姓名欄位已自動去識別化。");
  }

  const missingScopeCount = consentRecords.filter(
    (record) => isConsentActive(record) && !record.scopes.includes(purpose),
  ).length;

  if (missingScopeCount > 0) {
    warnings.push(`${missingScopeCount} 筆同意書未涵蓋此用途，匯出前需主管覆核。`);
  }

  const inactiveCount = consentRecords.filter((record) => !isConsentActive(record)).length;

  if (inactiveCount > 0) {
    warnings.push(`${inactiveCount} 筆同意書已撤回、缺簽或過期，不得用於可識別資料匯出。`);
  }

  return {
    purpose,
    purposeLabel: consentScopeLabels[purpose],
    allowsPersonalData,
    warnings,
    redactedColumns,
  };
}

export function redactExportCell(key: string, value: string, governance: ConsentGovernanceResult) {
  if (personalDataKeys.has(key) && !governance.allowsPersonalData) {
    return "已去識別";
  }

  return value;
}

function isConsentActive(record: ConsentRecord) {
  if (!record.signed || record.revoked) {
    return false;
  }

  if (!record.expiryDate) {
    return true;
  }

  return new Date(`${record.expiryDate}T23:59:59+08:00`) >= new Date("2026-04-26T00:00:00+08:00");
}

function isExpiringSoon(record: ConsentRecord) {
  if (!isConsentActive(record) || !record.expiryDate) {
    return false;
  }

  const today = new Date("2026-04-26T00:00:00+08:00");
  const expiryDate = new Date(`${record.expiryDate}T00:00:00+08:00`);
  const daysUntilExpiry = (expiryDate.getTime() - today.getTime()) / 86_400_000;

  return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
}

export const electronicConsentTemplateIds = consentDocumentIds;

export type ElectronicConsentTemplateId = ConsentDocumentId;
export type ConsentSignerRole = "elder" | "visitor";

export type ElectronicConsentRecord = {
  consentId: string;
  templateId: ElectronicConsentTemplateId;
  templateVersion: string;
  title: string;
  signerName: string;
  signerRole: ConsentSignerRole;
  visitorId: string;
  caseId: string;
  scheduleId: string;
  externalRef: string;
  signatureFileId: string;
  signatureFileUrl: string;
  signatureMimeType: "image/png" | "image/jpeg";
  signatureDataUrl?: string;
  pdfFileId: string;
  pdfFileUrl: string;
  pdfFileName: string;
  pdfGeneratedAt: string;
  signedAt: string;
  isTest: boolean;
  fieldValues: Record<string, string | boolean>;
  metadata: Record<string, string | number | boolean | null>;
};

export type ConsentSignInput = {
  templateId: ElectronicConsentTemplateId;
  signerName: string;
  signerRole: ConsentSignerRole;
  visitorId: string;
  caseId?: string;
  scheduleId?: string;
  externalRef?: string;
  signatureDataUrl: string;
  isTest?: boolean;
  fieldValues: Record<string, string | boolean>;
  metadata?: Record<string, string | number | boolean | null>;
};

export const electronicConsentTemplates = electronicConsentTemplateIds.map((id) => {
  const template = governmentFormTemplates.find((item) => item.id === id);
  if (!template) throw new Error(`Missing government consent template: ${id}`);
  return template;
});

export function isElectronicConsentTemplateId(value: unknown): value is ElectronicConsentTemplateId {
  return electronicConsentTemplateIds.includes(value as ElectronicConsentTemplateId);
}

export function getElectronicConsentTemplate(templateId: ElectronicConsentTemplateId) {
  return electronicConsentTemplates.find((template) => template.id === templateId)!;
}

export function estimateDataUrlBytes(value: string) {
  const payload = value.split(",", 2)[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

export function validateConsentSignInput(input: ConsentSignInput) {
  const errors: string[] = [];
  const template = isElectronicConsentTemplateId(input.templateId)
    ? getElectronicConsentTemplate(input.templateId)
    : null;
  const dataUrlMatch = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/.exec(
    input.signatureDataUrl ?? "",
  );

  if (!template) errors.push("同意書模板不存在。");
  if (!input.signerName?.trim()) errors.push("請填寫簽署人姓名。");
  if (!input.visitorId?.trim()) errors.push("無法確認訪員身分，請重新登入。");
  if (!dataUrlMatch) errors.push("簽名必須是 PNG 或 JPEG 圖檔。");
  if (dataUrlMatch && estimateDataUrlBytes(input.signatureDataUrl) > 750_000) {
    errors.push("簽名圖檔超過 750 KB，請清除後重新簽名。");
  }
  if (input.templateId === "gov_personal_data_consent_115") {
    if (input.signerRole !== "elder") errors.push("個資同意書必須由長者簽署。");
    if (!["同意", "不同意"].includes(String(input.fieldValues.personal_data_use_consent))) {
      errors.push("請勾選個資使用意願。");
    }
    if (!["同意", "不同意"].includes(String(input.fieldValues.health_database_link_consent))) {
      errors.push("請勾選健康資料串聯意願。");
    }
  } else {
    if (input.signerRole !== "visitor") errors.push("保密同意書必須由訪員本人簽署。");
    if (input.fieldValues.confidentiality_confirmed !== "同意") {
      errors.push("請確認遵守保密事項。");
    }
    for (const key of ["identity_type", "national_id", "phone"]) {
      if (!String(input.fieldValues[key] ?? "").trim()) errors.push(`請填寫${key}。`);
    }
  }
  if (input.isTest) {
    const marker = `${input.signerName} ${input.externalRef ?? ""}`.toUpperCase();
    if (!marker.includes("TEST") && !input.signerName.includes("測試簽署人")) {
      errors.push("TEST 記錄的簽署人或外部參照必須明確標示 TEST。");
    }
  }
  return { ok: errors.length === 0, errors, template };
}

export function normalizeGasConsentRecord(row: Record<string, unknown>): ElectronicConsentRecord {
  const parseJson = <T>(value: unknown, fallback: T): T => {
    if (value && typeof value === "object") return value as T;
    try {
      return value ? (JSON.parse(String(value)) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    consentId: String(row.consent_id ?? row.consentId ?? ""),
    templateId: String(row.template_id ?? row.templateId) as ElectronicConsentTemplateId,
    templateVersion: String(row.template_version ?? row.templateVersion ?? ""),
    title: String(row.title ?? ""),
    signerName: String(row.signer_name ?? row.signerName ?? ""),
    signerRole: String(row.signer_role ?? row.signerRole ?? "visitor") as ConsentSignerRole,
    visitorId: String(row.visitor_id ?? row.visitorId ?? ""),
    caseId: String(row.case_id ?? row.caseId ?? ""),
    scheduleId: String(row.schedule_id ?? row.scheduleId ?? ""),
    externalRef: String(row.external_ref ?? row.externalRef ?? ""),
    signatureFileId: String(row.signature_file_id ?? row.signatureFileId ?? ""),
    signatureFileUrl: String(row.signature_file_url ?? row.signatureFileUrl ?? ""),
    signatureMimeType: String(
      row.signature_mime_type ?? row.signatureMimeType ?? "image/png",
    ) as "image/png" | "image/jpeg",
    signatureDataUrl: String(row.signature_data_url ?? row.signatureDataUrl ?? "") || undefined,
    pdfFileId: String(row.pdf_file_id ?? row.pdfFileId ?? ""),
    pdfFileUrl: String(row.pdf_file_url ?? row.pdfFileUrl ?? ""),
    pdfFileName: String(row.pdf_file_name ?? row.pdfFileName ?? ""),
    pdfGeneratedAt: String(row.pdf_generated_at ?? row.pdfGeneratedAt ?? ""),
    signedAt: new Date(String(row.signed_at ?? row.signedAt ?? Date.now())).toISOString(),
    isTest:
      row.is_test === true ||
      row.isTest === true ||
      String(row.is_test ?? row.isTest).toLowerCase() === "true",
    fieldValues: parseJson(row.field_values ?? row.field_values_json ?? row.fieldValues, {}),
    metadata: parseJson(row.metadata ?? row.metadata_json, {}),
  };
}
