import { governmentFormTemplates, type GovernmentFormKind } from "@/lib/domain/government-forms";
import type { AuditQueueItem, VisitSchedule } from "@/lib/domain/types";

export type VisitFormStage =
  | "assignment_gate"
  | "visit_start"
  | "visit_record"
  | "supervisor_review"
  | "audit_completion";

export type VisitFormStatus = "completed" | "in_progress" | "needs_review" | "blocked";

export type VisitFormFlowItem = {
  templateId: string;
  kind: GovernmentFormKind;
  name: string;
  stage: VisitFormStage;
  stageLabel: string;
  owner: "承辦管理者" | "訪員" | "督導" | "稽核";
  status: VisitFormStatus;
  statusLabel: string;
  blocking: boolean;
  usage: string;
  completionRule: string;
};

export const requiredVisitFormTemplateIds = [
  "gov_social_worker_confidentiality_115",
  "gov_civil_affairs_confidentiality_115",
  "gov_personal_data_consent_115",
  "gov_care_visit_115",
];

const flowDefinitions: Array<
  Pick<
    VisitFormFlowItem,
    "templateId" | "stage" | "stageLabel" | "owner" | "blocking" | "usage" | "completionRule"
  >
> = [
  {
    templateId: "gov_social_worker_confidentiality_115",
    stage: "assignment_gate",
    stageLabel: "派案前",
    owner: "承辦管理者",
    blocking: true,
    usage: "社政訪查人員參與訪查前，必須先完成保密同意書，才能接觸個資與被派案。",
    completionRule: "訪查人員帳號完成簽署並由承辦或督導確認。",
  },
  {
    templateId: "gov_civil_affairs_confidentiality_115",
    stage: "assignment_gate",
    stageLabel: "派案前",
    owner: "承辦管理者",
    blocking: true,
    usage: "民政訪查人員、公所人員、村里長或村里幹事參與前，必須完成保密同意書。",
    completionRule: "訪查人員身分與計畫年度綁定，完成簽署後才可派案。",
  },
  {
    templateId: "gov_personal_data_consent_115",
    stage: "visit_start",
    stageLabel: "訪視開始",
    owner: "訪員",
    blocking: true,
    usage: "訪員到場後先確認個資蒐集聲明與同意書，取得簽名、蓋章或手印。",
    completionRule: "同意狀態、簽署日期與簽名資料完整，才能進入核銷與正式稽核。",
  },
  {
    templateId: "gov_care_visit_115",
    stage: "visit_record",
    stageLabel: "訪視填報",
    owner: "訪員",
    blocking: true,
    usage: "訪員依縣市政府生活關懷表填寫長者生活、健康、社會支持與居家觀察資料。",
    completionRule: "必填欄位、照片定位與特殊風險題項完成後，送督導與稽核覆核。",
  },
];

export function getVisitFormFlowItems(
  statusByTemplateId: Partial<Record<string, VisitFormStatus>> = {},
) {
  return flowDefinitions.map((definition) => {
    const template = governmentFormTemplates.find((item) => item.id === definition.templateId);
    const status = statusByTemplateId[definition.templateId] ?? "in_progress";

    return {
      ...definition,
      templateId: template?.id ?? definition.templateId,
      kind: template?.kind ?? "care_visit",
      name: template?.name ?? definition.templateId,
      status,
      statusLabel: getVisitFormStatusLabel(status),
    };
  });
}

export function getAssignmentFormChecklist() {
  return getVisitFormFlowItems({
    gov_social_worker_confidentiality_115: "completed",
    gov_civil_affairs_confidentiality_115: "needs_review",
    gov_personal_data_consent_115: "in_progress",
    gov_care_visit_115: "in_progress",
  });
}

export function getVisitRequiredForms(schedule: VisitSchedule) {
  const isFollowUp = schedule.visitAttempt > 1;

  return getVisitFormFlowItems({
    gov_social_worker_confidentiality_115: "completed",
    gov_civil_affairs_confidentiality_115: "completed",
    gov_personal_data_consent_115: isFollowUp ? "needs_review" : "in_progress",
    gov_care_visit_115: "in_progress",
  });
}

export function getAuditFormReviewItems(item: AuditQueueItem) {
  const isBlocked = item.auditState === "blocked";
  const consentPassed = item.checks.some(
    (check) => check.key === "consent_required" && check.passed,
  );
  // 同意書暫不阻擋核准：未同意只標「待覆核」，不標「未通過／阻擋」
  const consentStatus: VisitFormStatus = consentPassed
    ? "completed"
    : "needs_review";

  return getVisitFormFlowItems({
    gov_social_worker_confidentiality_115: "completed",
    gov_civil_affairs_confidentiality_115: "completed",
    gov_personal_data_consent_115: consentStatus,
    gov_care_visit_115: isBlocked ? "needs_review" : "completed",
  }).map((flowItem) => ({
    ...flowItem,
    stage: flowItem.stage === "assignment_gate" ? "supervisor_review" : "audit_completion",
    stageLabel: flowItem.stage === "assignment_gate" ? "督導確認" : "稽核完成",
    owner: flowItem.stage === "assignment_gate" ? "督導" : "稽核",
  }));
}

export function getVisitFormStatusLabel(status: VisitFormStatus) {
  const labels: Record<VisitFormStatus, string> = {
    completed: "已完成",
    in_progress: "填寫中",
    needs_review: "待覆核",
    blocked: "未通過",
  };

  return labels[status];
}
