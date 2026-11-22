export type CaseProgressChannelCounts = {
  careform: number;
  direct_mark: number;
  both: number;
  none: number;
  any_record: number;
};

export type CaseProgressTotals = {
  system_roster: number;
  careform_keyed: number;
  direct_keyed: number;
  both_channels: number;
  no_trace: number;
  any_record: number;
  incomplete_visit_status: number;
  completion_rate: number;
};

export type CaseProgressGaps = {
  mark_but_unvisited: number;
  careform_but_unvisited: number;
};

export type CaseProgressBuckets = {
  A_roster_result_careform: number;
  B_roster_result_direct: number;
  C_roster_result_no_trace: number;
  D_careform_roster_pending: number;
  E_both_pending_with_mark: number;
  E_both_pending: number;
  F_roster_only_pending: number;
  F_roster_only_result: number;
  F_system_only: number;
};

export type CaseProgressSample = {
  case_id: string;
  name_masked: string;
  id_masked: string;
  village: string;
  visit_status: string;
  has_careform: boolean;
  has_direct_mark: boolean;
  mark_outcome: string;
  roster_status: string;
  channel: string;
};

export type CaseProgressRosterMeta = {
  loaded: boolean;
  snapshot_id: string | null;
  total: number;
  both_sides: number;
  system_only: number;
  roster_only: number;
};

export type CaseProgressSummaryPayload = {
  computed_at: string;
  from_cache?: boolean;
  village_filter?: string | null;
  roster: CaseProgressRosterMeta;
  totals: CaseProgressTotals;
  channels: CaseProgressChannelCounts;
  visit_status_counts: Record<string, number>;
  gaps: CaseProgressGaps;
  buckets: CaseProgressBuckets;
  roster_status_cross: Record<
    string,
    { total: number; careform: number; direct: number; none: number; both: number }
  >;
  samples_by_bucket: Record<string, CaseProgressSample[]>;
  notes?: string[];
};

export const CASE_PROGRESS_BUCKET_LABELS: Record<keyof CaseProgressBuckets, string> = {
  A_roster_result_careform: "A 清冊有結果＋已 KEY 關懷表",
  B_roster_result_direct: "B 清冊有結果＋直 KEY",
  C_roster_result_no_trace: "C 清冊有結果＋系統無痕跡",
  D_careform_roster_pending: "D 系統有關懷表＋清冊仍待訪",
  E_both_pending_with_mark: "E 兩邊待訪＋有直 KEY",
  E_both_pending: "E 兩邊待訪＋未完成",
  F_roster_only_pending: "F 僅清冊（待訪）",
  F_roster_only_result: "F 僅清冊（有結果）",
  F_system_only: "F 僅系統",
};

export function emptyCaseProgressSummary(): CaseProgressSummaryPayload {
  return {
    computed_at: "",
    roster: {
      loaded: false,
      snapshot_id: null,
      total: 0,
      both_sides: 0,
      system_only: 0,
      roster_only: 0,
    },
    totals: {
      system_roster: 0,
      careform_keyed: 0,
      direct_keyed: 0,
      both_channels: 0,
      no_trace: 0,
      any_record: 0,
      incomplete_visit_status: 0,
      completion_rate: 0,
    },
    channels: {
      careform: 0,
      direct_mark: 0,
      both: 0,
      none: 0,
      any_record: 0,
    },
    visit_status_counts: {},
    gaps: {
      mark_but_unvisited: 0,
      careform_but_unvisited: 0,
    },
    buckets: {
      A_roster_result_careform: 0,
      B_roster_result_direct: 0,
      C_roster_result_no_trace: 0,
      D_careform_roster_pending: 0,
      E_both_pending_with_mark: 0,
      E_both_pending: 0,
      F_roster_only_pending: 0,
      F_roster_only_result: 0,
      F_system_only: 0,
    },
    roster_status_cross: {},
    samples_by_bucket: {},
    notes: [],
  };
}
