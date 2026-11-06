import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";

/** 訪視／未遇允許時段（含界）：08:00–20:00 */
export const VISIT_WINDOW_START_MINUTES = 8 * 60;
export const VISIT_WINDOW_END_MINUTES = 20 * 60;

/** 訪視成功最短時長（分鐘） */
export const MIN_SUCCESS_DURATION_MINUTES = 5;

export const QUESTIONNAIRE_SKIP_STATUSES = [
  "拒絕訪視",
  "查無此人",
  "無法溝通",
  "住址不詳",
] as const;

export type MohwSubmitGuardIssue = {
  key: string;
  code: "VISIT_TIME_WINDOW" | "VISIT_DURATION_MIN" | "STATUS_MISSED_CONFLICT";
  message: string;
};

const COHABIT_KEYS = [
  "living_status",
  "cohabitation_status",
  "cohabitant_relation",
  "cohabitant_age",
  "cohabitant_no_care_capacity_note",
] as const;

const LIVING_DETAIL_KEYS = [
  "living_address",
  "living_city",
  "living_district",
  "living_village",
  "living_neighborhood",
  "living_lane",
  "living_alley",
  "living_number",
  "living_floor",
  "living_address_note",
  "living_address_type",
] as const;

function hasVal(v: unknown): boolean {
  return String(v ?? "").trim() !== "";
}

export function parseHhMmToMinutes(value: unknown): number | null {
  const m = String(value ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHhMm(total: number): string {
  const t = ((Math.floor(total) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isWithinVisitWindow(hhmm: unknown): boolean {
  const mins = parseHhMmToMinutes(hhmm);
  if (mins == null) return true;
  return mins >= VISIT_WINDOW_START_MINUTES && mins <= VISIT_WINDOW_END_MINUTES;
}

export function visitDurationMinutes(start: unknown, end: unknown): number | null {
  const s = parseHhMmToMinutes(start);
  const e = parseHhMmToMinutes(end);
  if (s == null || e == null) return null;
  let d = e - s;
  if (d < 0) d += 24 * 60;
  return d;
}

function clearKeys(
  answers: MohwLifeCareAnswers,
  keys: readonly string[],
): MohwLifeCareAnswers {
  const next = { ...answers };
  for (const key of keys) {
    if (hasVal(next[key])) next[key] = "";
  }
  return next;
}

/**
 * 品質正規化（不含無名清日）：跳過問卷清同住、住址不詳清居住明細。
 */
export function normalizeMohwQualityGuards(
  answers: MohwLifeCareAnswers,
): MohwLifeCareAnswers {
  let next = { ...answers };
  const visitStatus = String(next.visit_status ?? "").trim();

  if ((QUESTIONNAIRE_SKIP_STATUSES as readonly string[]).includes(visitStatus)) {
    next = clearKeys(next, COHABIT_KEYS);
  }

  if (visitStatus === "住址不詳") {
    next = clearKeys(next, LIVING_DETAIL_KEYS);
  }

  if (visitStatus === "查無此人" && !hasVal(next.living_address_type)) {
    next = { ...next, living_address_type: "查無此人" };
  }

  return next;
}

/**
 * 送出驗證防呆（擋送出）：
 * - 已完成：時長 ≥ 5 分
 * - 訪查開始／結束須在 08:00–20:00
 * - 已完成卻備註含「訪視未遇」→ 矛盾
 */
export function collectMohwSubmitGuardIssues(
  answers: MohwLifeCareAnswers,
): MohwSubmitGuardIssue[] {
  const issues: MohwSubmitGuardIssue[] = [];
  const visitStatus = String(answers.visit_status ?? "").trim();
  const start = answers.visit_start_time ?? answers.visit_time_start;
  const end = answers.visit_end_time ?? answers.visit_time_end;

  if (hasVal(start) && !isWithinVisitWindow(start)) {
    issues.push({
      key: "visit_start_time",
      code: "VISIT_TIME_WINDOW",
      message: "訪查開始時間須在 08:00–20:00",
    });
  }
  if (hasVal(end) && !isWithinVisitWindow(end)) {
    issues.push({
      key: "visit_end_time",
      code: "VISIT_TIME_WINDOW",
      message: "訪查結束時間須在 08:00–20:00",
    });
  }

  if (visitStatus === "已完成") {
    const dur = visitDurationMinutes(start, end);
    if (dur != null && dur < MIN_SUCCESS_DURATION_MINUTES) {
      issues.push({
        key: "visit_end_time",
        code: "VISIT_DURATION_MIN",
        message: `訪視成功時長至少 ${MIN_SUCCESS_DURATION_MINUTES} 分鐘（目前 ${dur} 分）`,
      });
    }
    const blob = [
      answers.living_address_other,
      answers.visit_notes,
      answers.notes,
    ]
      .map((v) => String(v ?? ""))
      .join("|");
    if (blob.includes("訪視未遇")) {
      issues.push({
        key: "visit_status",
        code: "STATUS_MISSED_CONFLICT",
        message:
          "訪視狀態為已完成，但備註含「訪視未遇」；請改為查無此人／住址不詳，或刪除未遇戳記",
      });
    }
  }

  return issues;
}

/** 場生成功案時長選項：不可選 1 分 */
export function deskSuccessDurationOptions(
  all: readonly number[] = [1, 5, 10],
): number[] {
  return all.filter((m) => m >= MIN_SUCCESS_DURATION_MINUTES);
}
