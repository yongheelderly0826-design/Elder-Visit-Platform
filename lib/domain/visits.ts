import type { ElderCase, VisitSchedule, VisitSubmission } from "@/lib/domain/types";

export const missedVisitClosureAttempt = 3;

/** 未遇佐證時段：至少 3、最多 5 個不同時段各留一張現場照。 */
export const missedVisitTimeSlots = ["上午", "中午", "下午", "傍晚", "夜間"] as const;
export type MissedVisitTimeSlot = (typeof missedVisitTimeSlots)[number];
export const missedVisitMinSlots = 3;
export const missedVisitMaxSlots = missedVisitTimeSlots.length;

export function parseMissedVisitPhotoSlot(photoName: string): MissedVisitTimeSlot | null {
  const label = String(photoName ?? "").split("：")[0]?.trim();
  return (missedVisitTimeSlots as readonly string[]).includes(label ?? "")
    ? (label as MissedVisitTimeSlot)
    : null;
}

export function countMissedVisitPhotoSlots(photoNames: string[]) {
  const slots = new Set<MissedVisitTimeSlot>();
  for (const name of photoNames) {
    const slot = parseMissedVisitPhotoSlot(name);
    if (slot) slots.add(slot);
  }
  return slots.size;
}

export function getRiskLabel(riskLevel: ElderCase["riskLevel"]) {
  const labels = {
    low: "低風險",
    medium: "中風險",
    high: "高風險",
  };

  return labels[riskLevel];
}

export function getVisitStatusLabel(status: VisitSchedule["status"]) {
  const labels = {
    pending: "待訪查",
    in_progress: "填報中",
    submitted: "已送出",
    needs_follow_up: "需追蹤",
  };

  return labels[status];
}

export function validateVisitSubmission(submission: VisitSubmission) {
  const missing: string[] = [];
  const hasGps = typeof submission.gpsLat === "number" && typeof submission.gpsLng === "number";

  if (!submission.visitResult) {
    missing.push("訪查結果");
  }
  if (!submission.healthStatus) {
    missing.push("健康狀況觀察");
  }
  if (!submission.livingStatus) {
    missing.push("生活支持狀態");
  }
  if (submission.visitResult === "未遇") {
    const slotCount = countMissedVisitPhotoSlots(submission.photoNames);
    if (slotCount < missedVisitMinSlots) {
      missing.push(`未遇時段佐證照片（需 ${missedVisitMinSlots}–${missedVisitMaxSlots} 個不同時段）`);
    }
    if (!hasGps) {
      missing.push("未遇定位");
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

export function getMissedVisitPolicy(schedule: VisitSchedule, submission: VisitSubmission) {
  if (submission.visitResult !== "未遇") {
    return {
      applies: false,
      canClose: false,
      nextAttempt: null,
      message: "本次不是未遇案件，依一般訪視流程送督導與稽核。",
    };
  }

  if (schedule.visitAttempt >= missedVisitClosureAttempt) {
    return {
      applies: true,
      canClose: true,
      nextAttempt: null,
      message: "已達第 3 次未遇，可送督導確認後以未遇結案。",
    };
  }

  return {
    applies: true,
    canClose: false,
    nextAttempt: schedule.visitAttempt + 1,
    message: `目前是第 ${schedule.visitAttempt} 次未遇，不可直接結案；送出後應安排第 ${
      schedule.visitAttempt + 1
    } 次訪視。`,
  };
}

export function getPaymentEligibility(submission: VisitSubmission) {
  if (submission.visitResult === "未遇") {
    return {
      eligible: false,
      reason: "未遇案件不直接核銷，需累計 3 次未遇並由督導確認後結案。",
    };
  }

  if (!submission.consentSigned || !submission.signatureDataUrl?.length) {
    return {
      eligible: false,
      reason: "未取得同意或簽名，暫不可進入核銷。",
    };
  }

  if (submission.visitResult === "訪視成功") {
    return {
      eligible: true,
      reason: "可進入稽核與核銷流程。",
    };
  }

  return {
    eligible: false,
    reason: "非成功訪視，需依 payment rules 判定是否可核銷。",
  };
}
