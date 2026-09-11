import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRoleKey, requireCapability, requireManagerCapability } from "@/lib/api/authorization";
import { SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getDemoVisitorLink } from "@/lib/domain/demo-visitor-link";
import {
  getElectronicConsentTemplate,
  isElectronicConsentTemplateId,
  normalizeGasConsentRecord,
  validateConsentSignInput,
  type ConsentSignInput,
  type ElectronicConsentRecord,
} from "@/lib/domain/consent";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";
import { gasClient } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";

const demoSignature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==";
const demoRecords: ElectronicConsentRecord[] = [
  {
    consentId: "TEST-DEMO-CONSENT-001",
    templateId: "gov_personal_data_consent_115",
    templateVersion: "115-116 年度",
    title: "縣市政府版本個人資料蒐集聲明暨同意書",
    signerName: "TEST 展示簽署人",
    signerRole: "elder",
    visitorId: "TEST-VISITOR",
    caseId: "TEST-CASE",
    scheduleId: "",
    externalRef: "TEST-DEMO-CONSENT-001",
    signatureFileId: "demo",
    signatureFileUrl: "",
    signatureMimeType: "image/png",
    signatureDataUrl: demoSignature,
    signedAt: "2026-09-01T08:00:00.000Z",
    isTest: true,
    fieldValues: {
      personal_data_use_consent: "同意",
      health_database_link_consent: "不同意",
    },
    metadata: { source: "demo_fallback" },
  },
];

function hasExplicitSession(request: NextRequest) {
  return Boolean(
    request.cookies.get("demo_role")?.value || request.cookies.get(SESSION_COOKIE)?.value,
  );
}

export async function GET(request: NextRequest) {
  if (!hasExplicitSession(request)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "請先登入後查看電子簽署紀錄。" } },
      { status: 401 },
    );
  }
  const forbidden = requireManagerCapability(request, "consent.manage");
  if (forbidden) return forbidden;

  const templateId = request.nextUrl.searchParams.get("templateId") ?? "";
  const consentId = request.nextUrl.searchParams.get("id") ?? "";
  const externalRef = request.nextUrl.searchParams.get("externalRef") ?? "";
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 50), 1), 50);

  try {
    const rows =
      getSystemStatus().dataMode === "gas_ready"
        ? consentId
          ? [await gasClient.consent.get(consentId)]
          : await gasClient.consent.list({
              template_id: templateId,
              external_ref: externalRef,
              limit: String(limit),
              include_signature: "true",
            })
        : demoRecords;
    const records = rows
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .map(normalizeGasConsentRecord)
      .filter((record) => !templateId || record.templateId === templateId)
      .filter((record) => !externalRef || record.externalRef === externalRef)
      .slice(0, limit);
    if (consentId && records.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "找不到電子簽署紀錄。" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: { records } });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CONSENT_LIST_FAILED",
          message: error instanceof Error ? error.message : "讀取電子簽署紀錄失敗。",
        },
      },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (getRoleKey(request) !== "visitor" || request.cookies.get("demo_role")?.value !== "visitor") {
    return NextResponse.json(
      { error: { code: "VISITOR_SESSION_REQUIRED", message: "僅登入中的訪員可送出同意書。" } },
      { status: 403 },
    );
  }
  const forbidden = requireCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<ConsentSignInput>;
  if (!isElectronicConsentTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "同意書模板不存在。" } },
      { status: 400 },
    );
  }
  const email = request.cookies.get("demo_email")?.value?.toLowerCase() ?? "";
  const linkedVisitor = getDemoVisitorLink(email);
  const authenticatedVisitorId =
    request.cookies.get(VOLUNTEER_CLOCK_COOKIE)?.value || linkedVisitor?.visitorId || "";
  const authenticatedVisitorName =
    request.cookies.get("demo_name")?.value?.trim() || linkedVisitor?.name || "";
  const template = getElectronicConsentTemplate(body.templateId);
  const isPersonal = body.templateId === "gov_personal_data_consent_115";
  const fieldValues = { ...(body.fieldValues ?? {}) };
  if (!isPersonal) fieldValues.signer_name = authenticatedVisitorName;
  const input: ConsentSignInput = {
    templateId: body.templateId,
    signerName: isPersonal ? String(body.signerName ?? "").trim() : authenticatedVisitorName,
    signerRole: isPersonal ? "elder" : "visitor",
    visitorId: authenticatedVisitorId,
    caseId: String(body.caseId ?? "").trim(),
    scheduleId: String(body.scheduleId ?? "").trim(),
    externalRef: String(body.externalRef ?? "").trim(),
    signatureDataUrl: String(body.signatureDataUrl ?? ""),
    isTest: body.isTest === true,
    fieldValues,
    metadata: {
      ...(body.metadata ?? {}),
      submittedByEmail: email,
      submittedByName: authenticatedVisitorName,
    },
  };
  const validation = validateConsentSignInput(input);
  if (!validation.ok) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: validation.errors.join("；") } },
      { status: 400 },
    );
  }

  try {
    const row =
      getSystemStatus().dataMode === "gas_ready"
        ? await gasClient.consent.sign({
            template_id: input.templateId,
            template_version: template.version,
            title: template.name,
            signer_name: input.signerName,
            signer_role: input.signerRole,
            visitor_id: input.visitorId,
            case_id: input.caseId ?? "",
            schedule_id: input.scheduleId ?? "",
            external_ref: input.externalRef ?? "",
            signature_data_url: input.signatureDataUrl,
            is_test: input.isTest === true,
            field_values: input.fieldValues,
            metadata: input.metadata ?? {},
          })
        : {
            consent_id: `DEMO-${crypto.randomUUID()}`,
            template_id: input.templateId,
            template_version: template.version,
            title: template.name,
            signer_name: input.signerName,
            signer_role: input.signerRole,
            visitor_id: input.visitorId,
            case_id: input.caseId ?? "",
            schedule_id: input.scheduleId ?? "",
            external_ref: input.externalRef ?? "",
            signature_file_id: "demo-memory",
            signature_file_url: "",
            signature_mime_type: input.signatureDataUrl.startsWith("data:image/jpeg")
              ? "image/jpeg"
              : "image/png",
            signature_data_url: input.signatureDataUrl,
            signed_at: new Date().toISOString(),
            is_test: input.isTest === true,
            field_values: input.fieldValues,
            metadata: input.metadata ?? {},
          };
    return NextResponse.json({ data: { record: normalizeGasConsentRecord(row) } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CONSENT_SIGN_FAILED",
          message: error instanceof Error ? error.message : "同意書簽署儲存失敗。",
        },
      },
      { status: 502 },
    );
  }
}
