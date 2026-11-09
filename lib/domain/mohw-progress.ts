export const MOHW_PROGRESS_SOURCE = "MOHW直KEY" as const;

export const MOHW_PROGRESS_OUTCOMES = ["已完成", "未遇", "查無此人"] as const;
export type MohwProgressOutcome = (typeof MOHW_PROGRESS_OUTCOMES)[number];

/** 衛福部進度回報：稽核督導固定選項（永和承辦指定） */
export const MOHW_PROGRESS_AUDIT_SUPERVISORS = ["沈煒庭", "課長"] as const;
export type MohwProgressAuditSupervisor = (typeof MOHW_PROGRESS_AUDIT_SUPERVISORS)[number];

export type MohwProgressMode = "count" | "case_codes" | "range" | "case_list";

export type MohwProgressCaseRow = {
  case_id: string;
  encoded_id: string;
  village_seq: number | null;
  name: string;
  outcome: MohwProgressOutcome | "";
  /** 民政訪查人員（派案備註／訪查員；未建檔列通常只有這邊有值） */
  civil_worker_name: string;
  /** 社政訪查人員 */
  social_worker_name: string;
  /** 建檔／紙本登打人員（未建檔列多為空） */
  keyed_by_name: string;
  /** 稽核督導（未建檔列多為空） */
  audit_supervisors: string[];
};

/** GAS mohwProgress.listCaseContext 回傳（僅未建檔個案） */
export type MohwProgressCaseContextPayload = {
  village_name?: string;
  roster_total?: number;
  excluded_with_careform?: number;
  items: Array<Record<string, unknown>>;
};

export function emptyMohwProgressCaseMeta(): Pick<
  MohwProgressCaseRow,
  "civil_worker_name" | "social_worker_name" | "keyed_by_name" | "audit_supervisors"
> {
  return {
    civil_worker_name: "",
    social_worker_name: "",
    keyed_by_name: "",
    audit_supervisors: [],
  };
}

export function mapMohwProgressCaseContext(
  raw: Record<string, unknown> | null | undefined,
): Pick<
  MohwProgressCaseRow,
  "civil_worker_name" | "social_worker_name" | "keyed_by_name" | "audit_supervisors"
> {
  if (!raw) return emptyMohwProgressCaseMeta();
  const supervisors = Array.isArray(raw.audit_supervisors)
    ? raw.audit_supervisors.map((item) => String(item || "").trim()).filter(Boolean)
    : String(raw.audit_supervisors || "")
        .split(/[,，、;/｜|]/)
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    civil_worker_name: String(raw.civil_worker_name || "").trim(),
    social_worker_name: String(raw.social_worker_name || "").trim(),
    keyed_by_name: String(raw.keyed_by_name || "").trim(),
    audit_supervisors: [...new Set(supervisors)],
  };
}

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
