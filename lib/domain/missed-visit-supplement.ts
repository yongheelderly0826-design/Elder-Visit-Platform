import {
  missedVisitClosureAttempt,
  missedVisitMinSlots,
  missedVisitTimeSlots,
  type MissedVisitTimeSlot,
} from "@/lib/domain/visits";

/**
 * 紙本階段改為「一張＝一次訪視」分次 KEY；此模組僅保留 toggle 與（若需）舊三次一次補錄工具。
 * Desk 未遇請用 visit-dialogue-form 的單次時段勾選。
 */

export type MissedVisitAttemptDraft = {
  attempt: number;
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
  notes: string;
  /** 紙本／現場已備之不同時段（至少 3） */
  slots: MissedVisitTimeSlot[];
};

export function createEmptyMissedVisitAttempts(
  seed?: Partial<Pick<MissedVisitAttemptDraft, "visitDate" | "visitStartTime" | "visitEndTime">>,
): MissedVisitAttemptDraft[] {
  return Array.from({ length: missedVisitClosureAttempt }, (_, index) => ({
    attempt: index + 1,
    visitDate: index === 0 ? String(seed?.visitDate ?? "") : "",
    visitStartTime: index === 0 ? String(seed?.visitStartTime ?? "") : "",
    visitEndTime: index === 0 ? String(seed?.visitEndTime ?? "") : "",
    notes: "",
    slots: index === 0 ? [] : [],
  }));
}

export function isMissedVisitAttemptComplete(draft: MissedVisitAttemptDraft) {
  return Boolean(
    draft.visitDate.trim() &&
      draft.slots.length >= missedVisitMinSlots &&
      new Set(draft.slots).size >= missedVisitMinSlots,
  );
}

export function countCompleteMissedVisitAttempts(drafts: MissedVisitAttemptDraft[]) {
  return drafts.filter(isMissedVisitAttemptComplete).length;
}

export function validateMissedVisitSupplement(drafts: MissedVisitAttemptDraft[]) {
  const missing: string[] = [];
  if (drafts.length < missedVisitClosureAttempt) {
    missing.push(`需補齊 ${missedVisitClosureAttempt} 次未遇訪視紀錄`);
    return { ok: false as const, missing };
  }
  for (const draft of drafts) {
    if (!draft.visitDate.trim()) {
      missing.push(`第 ${draft.attempt} 次：訪視日期`);
    }
    if (new Set(draft.slots).size < missedVisitMinSlots) {
      missing.push(
        `第 ${draft.attempt} 次：時段佐證（至少 ${missedVisitMinSlots} 個不同時段）`,
      );
    }
  }
  return { ok: missing.length === 0, missing };
}

export function formatMissedVisitSupplementNotes(drafts: MissedVisitAttemptDraft[]) {
  return drafts
    .map((draft) => {
      const slots = draft.slots.join("、") || "—";
      const time = [draft.visitStartTime, draft.visitEndTime].filter(Boolean).join("–") || "—";
      const note = draft.notes.trim() ? `；備註 ${draft.notes.trim()}` : "";
      return `第${draft.attempt}次未遇 ${draft.visitDate || "?"} ${time} 時段(${slots})${note}`;
    })
    .join(" ｜ ");
}

/** 以紙本時段勾選產生 photoNames，供既有未遇 slot 檢核通過。 */
export function photoNamesFromMissedVisitSupplement(drafts: MissedVisitAttemptDraft[]) {
  const names: string[] = [];
  for (const draft of drafts) {
    for (const slot of draft.slots) {
      if (!(missedVisitTimeSlots as readonly string[]).includes(slot)) continue;
      names.push(`${slot}：紙本補錄·第${draft.attempt}次`);
    }
  }
  return names;
}

export function toggleMissedVisitSlot(
  slots: MissedVisitTimeSlot[],
  slot: MissedVisitTimeSlot,
): MissedVisitTimeSlot[] {
  return slots.includes(slot) ? slots.filter((item) => item !== slot) : [...slots, slot];
}
