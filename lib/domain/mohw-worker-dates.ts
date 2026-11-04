import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";

/**
 * 送出／寫入 answers 前：無名側強制清空日期，避免 desk 兩邊預填 date 後
 * 未用側留下「有日無名」殘留。有 name 的側保留其 date。擇一填寫即可。
 */
export function clearOrphanWorkerDates(answers: MohwLifeCareAnswers): MohwLifeCareAnswers {
  const next: MohwLifeCareAnswers = { ...answers };
  if (!String(next.social_worker_name ?? "").trim()) {
    next.social_worker_date = "";
  }
  if (!String(next.civil_worker_name ?? "").trim()) {
    next.civil_worker_date = "";
  }
  return next;
}
