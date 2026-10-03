import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { gasClient } from "@/lib/gas-client";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { normalizeMohwAnswersOptions } from "@/lib/domain/mohw-life-care-options";
import { calculateMohwCareFormCompletion } from "@/lib/domain/mohw-life-care-ui";
import { evaluateHighCare } from "@/lib/domain/high-care-rules";
import { validateMohwLifeCareRow } from "@/lib/domain/mohw-life-care-validation";
import type { VisitSubmission } from "@/lib/domain/types";
import { getVisitFormFlowItems } from "@/lib/domain/visit-form-flow";
import {
  countMissedVisitPhotoSlots,
  getPaymentEligibility,
  missedVisitMinSlots,
  validateVisitSubmission,
} from "@/lib/domain/visits";
import { getSystemStatus } from "@/lib/system/env";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

type MissedVisitPhotoPayload = {
  slot: string;
  fileName: string;
  dataUrl: string;
};

type VisitSubmitPayload = VisitSubmission & {
  assignmentId?: string;
  visitorId?: string;
  encodedId?: string;
  caseCode?: string;
  careFormAnswers?: MohwLifeCareAnswers;
  missedVisitPhotos?: MissedVisitPhotoPayload[];
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

  const isMissedVisit = submission.visitResult === "未遇";
  const mohwValidation =
    careFormAnswers && !isMissedVisit
      ? validateMohwLifeCareRow(careFormAnswers, { row: 2 })
      : null;
  const highCare = careFormAnswers && !isMissedVisit ? evaluateHighCare(careFormAnswers) : null;

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

  if (isMissedVisit && countMissedVisitPhotoSlots(submission.photoNames) < missedVisitMinSlots) {
    return NextResponse.json(
      {
        error: {
          code: "MISSED_VISIT_SLOTS_REQUIRED",
          message: `未遇需至少 ${missedVisitMinSlots} 個不同時段的佐證照片`,
        },
      },
      { status: 400 },
    );
  }

  const paymentEligibility = getPaymentEligibility(submission);
  const status = getSystemStatus();
  let gasResult: unknown = null;

  const missedVisitPhotos = Array.isArray(body.missedVisitPhotos)
    ? body.missedVisitPhotos.filter(
        (item) => item && typeof item.slot === "string" && typeof item.dataUrl === "string",
      )
    : [];

  if (status.dataMode === "gas_ready" && (careFormAnswers || isMissedVisit)) {
    try {
      gasResult = await gasClient.careform.submit({
        assignment_id: body.assignmentId ?? body.scheduleId,
        visitor_id: body.visitorId ?? "visitor-unknown",
        encoded_id: body.encodedId ?? body.caseCode ?? body.scheduleId,
        case_id: body.caseCode,
        visit_result: submission.visitResult,
        completion_pct: isMissedVisit ? careFormCompletion?.percent ?? 0 : careFormCompletion?.percent ?? 0,
        answers: careFormAnswers ?? {},
        consent_signed: submission.consentSigned,
        photos: submission.photoNames,
        missed_visit_photos: missedVisitPhotos,
        gps_lat: submission.gpsLat,
        gps_lng: submission.gpsLng,
        notes: submission.notes,
      });
      invalidateGasReadCaches();
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
      highCare,
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
