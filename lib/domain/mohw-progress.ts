export const MOHW_PROGRESS_SOURCE = "MOHW直KEY" as const;

export const MOHW_PROGRESS_OUTCOMES = ["已完成", "未遇", "拒訪"] as const;
export type MohwProgressOutcome = (typeof MOHW_PROGRESS_OUTCOMES)[number];

/** 舊版直 KEY 第三狀態；讀取時對應為「拒訪」 */
export const MOHW_PROGRESS_OUTCOME_LEGACY_NOT_FOUND = "查無此人" as const;

/** 衛福部進度回報：稽核督導固定選項（暫不要求送出；UI 已隱藏） */
export const MOHW_PROGRESS_AUDIT_SUPERVISORS = ["沈煒庭", "課長"] as const;
export type MohwProgressAuditSupervisor = (typeof MOHW_PROGRESS_AUDIT_SUPERVISORS)[number];

export type MohwProgressMode = "count" | "case_codes" | "range" | "case_list";

export type MohwProgressCaseTab = "keyed" | "direct";

export type MohwProgressCaseRow = {
  case_id: string;
  encoded_id: string;
  village_seq: number | null;
  name: string;
  outcome: MohwProgressOutcome | "";
  /** 民政訪查人員（派案備註／訪查員） */
  civil_worker_name: string;
  /** 社政訪查人員 */
  social_worker_name: string;
  /** 建檔／紙本登打人員 */
  keyed_by_name: string;
  /** 稽核督導 */
  audit_supervisors: string[];
  /** 本平台 eligible 關懷表狀態（已提交／已稽核）；直 KEY 列為空 */
  careform_status?: string;
  careform_id?: string;
};

/** GAS mohwProgress.listCaseContext 回傳（已 KEY + 直 KEY 兩組） */
export type MohwProgressCaseContextPayload = {
  village_name?: string;
  roster_total?: number;
  keyed_count?: number;
  direct_count?: number;
  /** @deprecated 同 keyed_count */
  excluded_with_careform?: number;
  items_keyed?: Array<Record<string, unknown>>;
  items_direct?: Array<Record<string, unknown>>;
  /** @deprecated 同 items_direct */
  items?: Array<Record<string, unknown>>;
};

/** GAS mohwProgress.summary 單里列 */
export type MohwProgressVillageSummary = {
  village_name: string;
  roster_total: number;
  platform_keyed: number;
  direct_done: number;
  direct_missed: number;
  direct_not_found: number;
  direct_unset: number;
  /** 直 KEY 已完成（相容舊欄） */
  done: number;
  missed: number;
  not_found: number;
  /** 整體已完成進度（本系統已 KEY ∪ 直 KEY 有狀態） */
  reported: number;
  remaining: number;
  completion_rate: number;
  latest_report_at: string;
};

export type MohwProgressSummaryTotals = {
  roster_total: number;
  platform_keyed: number;
  direct_done: number;
  direct_missed: number;
  direct_not_found: number;
  direct_unset: number;
  done: number;
  missed: number;
  not_found: number;
  reported: number;
  remaining: number;
  completion_rate: number;
};

export type MohwProgressSummaryPayload = {
  villages: MohwProgressVillageSummary[];
  totals: MohwProgressSummaryTotals;
};

export function emptyMohwProgressCaseMeta(): Pick<
  MohwProgressCaseRow,
  | "civil_worker_name"
  | "social_worker_name"
  | "keyed_by_name"
  | "audit_supervisors"
  | "careform_status"
  | "careform_id"
> {
  return {
    civil_worker_name: "",
    social_worker_name: "",
    keyed_by_name: "",
    audit_supervisors: [],
    careform_status: "",
    careform_id: "",
  };
}

export function mapMohwProgressCaseContext(
  raw: Record<string, unknown> | null | undefined,
): Pick<
  MohwProgressCaseRow,
  | "civil_worker_name"
  | "social_worker_name"
  | "keyed_by_name"
  | "audit_supervisors"
  | "careform_status"
  | "careform_id"
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
    careform_status: String(raw.careform_status || "").trim(),
    careform_id: String(raw.careform_id || "").trim(),
  };
}

/** 將舊「查無此人」標記正規化為「拒訪」；無效則回空字串 */
export function normalizeMohwProgressOutcome(value: string): MohwProgressOutcome | "" {
  const trimmed = String(value || "").trim();
  if (trimmed === MOHW_PROGRESS_OUTCOME_LEGACY_NOT_FOUND) return "拒訪";
  if ((MOHW_PROGRESS_OUTCOMES as readonly string[]).includes(trimmed)) {
    return trimmed as MohwProgressOutcome;
  }
  return "";
}

export function isMohwProgressOutcome(value: string): boolean {
  return normalizeMohwProgressOutcome(value) !== "";
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
    const normalized = normalizeMohwProgressOutcome(outcome);
    if (normalized === "已完成") done += 1;
    else if (normalized === "未遇") missed += 1;
    else if (normalized === "拒訪") notFound += 1;
    else unset += 1;
  }
  return { done, missed, notFound, unset };
}

export function mapMohwProgressVillageSummary(
  raw: Record<string, unknown> | null | undefined,
): MohwProgressVillageSummary {
  const roster = normalizeNonNegInt(raw?.roster_total);
  const platformKeyed = normalizeNonNegInt(raw?.platform_keyed);
  const directDone = normalizeNonNegInt(raw?.direct_done ?? raw?.done);
  const directMissed = normalizeNonNegInt(raw?.direct_missed ?? raw?.missed);
  const directNotFound = normalizeNonNegInt(raw?.direct_not_found ?? raw?.not_found);
  const directUnset = normalizeNonNegInt(
    raw?.direct_unset ?? Math.max(roster - platformKeyed - directDone - directMissed - directNotFound, 0),
  );
  const reported = normalizeNonNegInt(raw?.reported);
  const remaining = normalizeNonNegInt(raw?.remaining ?? Math.max(roster - reported, 0));
  const completionRate =
    typeof raw?.completion_rate === "number"
      ? raw.completion_rate
      : roster > 0
        ? Math.round((reported / roster) * 1000) / 10
        : 0;
  return {
    village_name: String(raw?.village_name || "").trim(),
    roster_total: roster,
    platform_keyed: platformKeyed,
    direct_done: directDone,
    direct_missed: directMissed,
    direct_not_found: directNotFound,
    direct_unset: directUnset,
    done: directDone,
    missed: directMissed,
    not_found: directNotFound,
    reported,
    remaining,
    completion_rate: completionRate,
    latest_report_at: String(raw?.latest_report_at || ""),
  };
}
