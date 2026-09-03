import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasClient } from "@/lib/gas-client";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { normalizeMohwAnswersOptions } from "@/lib/domain/mohw-life-care-options";
import { calculateMohwCareFormCompletion } from "@/lib/domain/mohw-life-care-ui";
import { validateMohwLifeCareRow } from "@/lib/domain/mohw-life-care-validation";
import type { VisitSubmission } from "@/lib/domain/types";
import { getVisitFormFlowItems } from "@/lib/domain/visit-form-flow";
import { getPaymentEligibility, validateVisitSubmission } from "@/lib/domain/visits";
import { getSystemStatus } from "@/lib/system/env";

type VisitSubmitPayload = VisitSubmission & {
  assignmentId?: string;
  visitorId?: string;
  encodedId?: string;
  caseCode?: string;
  careFormAnswers?: MohwLifeCareAnswers;
};

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  const body = (await request.json()) as VisitSubmitPayload;
  const submission: VisitSubmission = {
    scheduleId: body.scheduleId,
    visitResult: body.visitResult,
    healthStatus: body.healthStatus,
    livingStatus: body.livingStatus,
    consentSigned: body.consentSigned,
    consentScope: body.consentScope,
    signatureDataUrl: body.signatureDataUrl,
    gpsLat: body.gpsLat,
    gpsLng: body.gpsLng,
    photoNames: body.photoNames,
    notes: body.notes,
  };

  const validation = validateVisitSubmission(submission);

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "VALIDATION_FAILED",
        missing: validation.missing,
      },
      { status: 400 },
    );
  }

  const careFormAnswers = body.careFormAnswers
    ? normalizeMohwAnswersOptions(body.careFormAnswers)
    : undefined;

  const careFormCompletion = careFormAnswers
    ? calculateMohwCareFormCompletion(careFormAnswers)
    : null;

  const mohwValidation = careFormAnswers
    ? validateMohwLifeCareRow(careFormAnswers, { row: 2 })
    : null;

  if (mohwValidation && !mohwValidation.ok) {
    return NextResponse.json(
      {
        error: {
          code: "MOHW_VALIDATION_ERROR",
          message: mohwValidation.errorLines.join("；"),
          errorLines: mohwValidation.errorLines,
          errors: mohwValidation.errors,
        },
      },
      { status: 400 },
    );
  }

  if (
    careFormCompletion &&
    careFormCompletion.percent < 100 &&
    submission.visitResult === "訪視成功"
  ) {
    return NextResponse.json(
      {
        error: {
          code: "CARE_FORM_INCOMPLETE",
          message: `關懷表尚缺必填：${careFormCompletion.missingLabels.join("、")}`,
          missing: careFormCompletion.missingLabels,
        },
      },
      { status: 400 },
    );
  }

  const paymentEligibility = getPaymentEligibility(submission);
  const status = getSystemStatus();
  let gasResult: unknown = null;

  if (status.dataMode === "gas_ready" && careFormAnswers) {
    try {
      gasResult = await gasClient.careform.submit({
        assignment_id: body.assignmentId ?? body.scheduleId,
        visitor_id: body.visitorId ?? "visitor-unknown",
        encoded_id: body.encodedId ?? body.caseCode ?? body.scheduleId,
        visit_result: submission.visitResult,
        completion_pct: careFormCompletion?.percent ?? 0,
        answers: careFormAnswers,
        consent_signed: submission.consentSigned,
        photos: submission.photoNames,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GAS careform.submit 失敗";
      return NextResponse.json({ error: { code: "GAS_SUBMIT_FAILED", message } }, { status: 502 });
    }
  }

  return NextResponse.json({
    data: {
      status: "submitted",
      scheduleId: submission.scheduleId,
      auditState: paymentEligibility.eligible ? "ready_for_audit" : "needs_review",
      paymentEligibility,
      careFormCompletion,
      mohwValidation,
      gasResult,
      forms: getVisitFormFlowItems({
        gov_social_worker_confidentiality_115: "completed",
        gov_civil_affairs_confidentiality_115: "completed",
        gov_personal_data_consent_115: submission.consentSigned ? "completed" : "blocked",
        gov_care_visit_115:
          careFormCompletion && careFormCompletion.percent >= 100 ? "completed" : "needs_review",
      }),
      nextStep: paymentEligibility.eligible ? "已送出，待督導稽核" : "已送出，需主管覆核",
      logs: ["visit_records", "workflow_instance_logs", "workspace_activity_logs"],
    },
  });
}
