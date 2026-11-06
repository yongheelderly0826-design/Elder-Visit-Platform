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
  code:
    | "VISIT_TIME_WINDOW"
    | "VISIT_DURATION_MIN"
    | "STATUS_MISSED_CONFLICT"
    | "HELP_SOURCES_HAS_WHEN_NONE"
    | "INVALID_LIVING_CITY";
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

/** 縣市誤填成「XX市」時對應到縣＋鄉鎮區（中央：居住縣市無效）。 */
export const LIVING_CITY_AS_DISTRICT_FIX: Record<
  string,
  { city: string; district: string }
> = {
  彰化市: { city: "彰化縣", district: "彰化市" },
};

/**
 * 求助對象互斥：選「無」則清空「有」複選／說明；選「有」則清空「無」複選／說明。
 */
export function normalizeMohwHelpSourcesExclusive(
  answers: MohwLifeCareAnswers,
): MohwLifeCareAnswers {
  const flag = String(answers.help_sources_flag ?? "").trim();
  if (flag === "無") {
    return {
      ...answers,
      help_sources_has: "",
      help_sources_has_other: "",
    };
  }
  if (flag === "有") {
    return {
      ...answers,
      help_sources_none: "",
      help_sources_none_other: "",
    };
  }
  return answers;
}

/** 居住縣市誤填（如彰化市）→ 縣市＋鄉鎮區 */
export function normalizeMohwLivingCityDistrict(
  answers: MohwLifeCareAnswers,
): MohwLifeCareAnswers {
  const city = String(answers.living_city ?? "").trim();
  const fix = LIVING_CITY_AS_DISTRICT_FIX[city];
  if (!fix) return answers;
  const district = String(answers.living_district ?? "").trim();
  const nextDistrict =
    !district || district === "彰化" || district === city ? fix.district : district;
  return {
    ...answers,
    living_city: fix.city,
    living_district: nextDistrict,
  };
}

/**
 * 品質正規化（不含無名清日）：
 * 跳過問卷清同住、住址不詳清居住明細、求助對象互斥、縣市誤填修正。
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

  next = normalizeMohwHelpSourcesExclusive(next);
  next = normalizeMohwLivingCityDistrict(next);

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

  const helpFlag = String(answers.help_sources_flag ?? "").trim();
  if (helpFlag === "無" && hasVal(answers.help_sources_has)) {
    issues.push({
      key: "help_sources_has",
      code: "HELP_SOURCES_HAS_WHEN_NONE",
      message: "求助對象選「無」時，「求助對象-有的複選選項」應留空",
    });
  }

  const livingCity = String(answers.living_city ?? "").trim();
  if (livingCity && LIVING_CITY_AS_DISTRICT_FIX[livingCity]) {
    issues.push({
      key: "living_city",
      code: "INVALID_LIVING_CITY",
      message: `居住縣市無效：${livingCity}（應為${LIVING_CITY_AS_DISTRICT_FIX[livingCity].city}，鄉鎮區填${LIVING_CITY_AS_DISTRICT_FIX[livingCity].district}）`,
    });
  }

  return issues;
}

/** 場生成功案時長選項：不可選 1 分 */
export function deskSuccessDurationOptions(
  all: readonly number[] = [1, 5, 10],
): number[] {
  return all.filter((m) => m >= MIN_SUCCESS_DURATION_MINUTES);
}
