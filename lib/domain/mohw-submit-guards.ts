import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { clearOrphanWorkerDates } from "@/lib/domain/mohw-worker-dates";
import { normalizeMohwQualityGuards } from "@/lib/domain/mohw-submit-guard-rules";

export {
  VISIT_WINDOW_START_MINUTES,
  VISIT_WINDOW_END_MINUTES,
  MIN_SUCCESS_DURATION_MINUTES,
  QUESTIONNAIRE_SKIP_STATUSES,
  parseHhMmToMinutes,
  minutesToHhMm,
  isWithinVisitWindow,
  visitDurationMinutes,
  normalizeMohwQualityGuards,
  collectMohwSubmitGuardIssues,
  deskSuccessDurationOptions,
  type MohwSubmitGuardIssue,
} from "@/lib/domain/mohw-submit-guard-rules";

/**
 * 送出前正規化（寫入 answers）：
 * - 無名側清空日期
 * - 跳過問卷狀態 → 清空同住問卷殘值
 * - 住址不詳 → 清空居住地址明細／類型（保留戶籍、living_address_other）
 */
export function applyMohwSubmitGuards(answers: MohwLifeCareAnswers): MohwLifeCareAnswers {
  return normalizeMohwQualityGuards(clearOrphanWorkerDates(answers));
}
