export const MOHW_PROGRESS_SOURCE = "MOHW直KEY" as const;

export const MOHW_PROGRESS_OUTCOMES = ["已完成", "未遇", "查無此人"] as const;
export type MohwProgressOutcome = (typeof MOHW_PROGRESS_OUTCOMES)[number];

export type MohwProgressMode = "count" | "case_codes" | "range" | "case_list";

export type MohwProgressCaseRow = {
  case_id: string;
  encoded_id: string;
  village_seq: number | null;
  name: string;
  outcome: MohwProgressOutcome | "";
};

export function isMohwProgressOutcome(value: string): value is MohwProgressOutcome {
  return (MOHW_PROGRESS_OUTCOMES as readonly string[]).includes(value);
}

export function normalizeNonNegInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function countTotal(input: {
  countDone: number;
  countMissed: number;
  countNotFound: number;
}) {
  return input.countDone + input.countMissed + input.countNotFound;
}

export function overRosterWarning(total: number, rosterTotal: number): string | null {
  if (rosterTotal > 0 && total > rosterTotal) {
    return `回報人數 ${total} 超過名冊 ${rosterTotal} 人，仍可送出。`;
  }
  return null;
}

export function summarizeCaseOutcomes(
  outcomes: Array<MohwProgressOutcome | "">,
): { done: number; missed: number; notFound: number; unset: number } {
  let done = 0;
  let missed = 0;
  let notFound = 0;
  let unset = 0;
  for (const outcome of outcomes) {
    if (outcome === "已完成") done += 1;
    else if (outcome === "未遇") missed += 1;
    else if (outcome === "查無此人") notFound += 1;
    else unset += 1;
  }
  return { done, missed, notFound, unset };
}
