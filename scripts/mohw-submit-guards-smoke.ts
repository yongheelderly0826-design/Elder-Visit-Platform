/**
 * Smoke: 第五類正式防呆（正規化＋驗證規則）
 * Run: node --experimental-strip-types scripts/mohw-submit-guards-smoke.ts
 */
import assert from "node:assert/strict";
import { clearOrphanWorkerDates } from "../lib/domain/mohw-worker-dates.ts";
import {
  collectMohwSubmitGuardIssues,
  deskSuccessDurationOptions,
  MIN_SUCCESS_DURATION_MINUTES,
  normalizeMohwQualityGuards,
} from "../lib/domain/mohw-submit-guard-rules.ts";

// 無名清日（既有規則仍在）
{
  const next = clearOrphanWorkerDates({
    social_worker_name: "",
    social_worker_date: "113/10/01",
    civil_worker_name: "王小明",
    civil_worker_date: "113/10/01",
  });
  assert.equal(next.social_worker_date, "");
  assert.equal(next.civil_worker_date, "113/10/01");
}

// 跳過問卷清同住
{
  const next = normalizeMohwQualityGuards({
    visit_status: "拒絕訪視",
    living_status: "與他人同住",
    cohabitation_status: "同住者有照顧能力",
    cohabitant_relation: "子女",
    cohabitant_age: "40",
  });
  assert.equal(next.living_status, "");
  assert.equal(next.cohabitant_relation, "");
}

// 住址不詳清居住明細、保留 other
{
  const next = normalizeMohwQualityGuards({
    visit_status: "住址不詳",
    living_address: "永和路一段",
    living_city: "新北市",
    living_district: "永和區",
    living_address_type: "未住戶籍地址",
    living_address_other: "三次未遇備註",
    household_address: "戶籍路",
  });
  assert.equal(next.living_address, "");
  assert.equal(next.living_address_type, "");
  assert.equal(next.living_address_other, "三次未遇備註");
  assert.equal(next.household_address, "戶籍路");
}

// 時段／時長／矛盾
{
  const windowIssues = collectMohwSubmitGuardIssues({
    visit_status: "已完成",
    visit_start_time: "07:30",
    visit_end_time: "07:40",
  });
  assert.ok(windowIssues.some((i) => i.code === "VISIT_TIME_WINDOW"));

  const shortIssues = collectMohwSubmitGuardIssues({
    visit_status: "已完成",
    visit_start_time: "09:00",
    visit_end_time: "09:01",
  });
  assert.ok(shortIssues.some((i) => i.code === "VISIT_DURATION_MIN"));

  const conflict = collectMohwSubmitGuardIssues({
    visit_status: "已完成",
    visit_start_time: "09:00",
    visit_end_time: "09:10",
    living_address_other: "10/25 09:00訪視未遇",
  });
  assert.ok(conflict.some((i) => i.code === "STATUS_MISSED_CONFLICT"));

  const ok = collectMohwSubmitGuardIssues({
    visit_status: "已完成",
    visit_start_time: "09:00",
    visit_end_time: "09:10",
  });
  assert.equal(ok.length, 0);
}

assert.deepEqual(deskSuccessDurationOptions([1, 5, 10]), [5, 10]);
assert.equal(MIN_SUCCESS_DURATION_MINUTES, 5);

// 求助對象有／無互斥：正規化清對側；驗證擋殘值
{
  const clearedHas = normalizeMohwQualityGuards({
    help_sources_flag: "無",
    help_sources_none: "沒發生過",
    help_sources_has: "家人",
    help_sources_has_other: "親戚",
  });
  assert.equal(clearedHas.help_sources_has, "");
  assert.equal(clearedHas.help_sources_has_other, "");
  assert.equal(clearedHas.help_sources_none, "沒發生過");

  const clearedNone = normalizeMohwQualityGuards({
    help_sources_flag: "有",
    help_sources_has: "家人",
    help_sources_none: "沒發生過",
    help_sources_none_other: "自己處理",
  });
  assert.equal(clearedNone.help_sources_none, "");
  assert.equal(clearedNone.help_sources_none_other, "");
  assert.equal(clearedNone.help_sources_has, "家人");

  const hasWhenNone = collectMohwSubmitGuardIssues({
    help_sources_flag: "無",
    help_sources_has: "家人",
    help_sources_has_other: "親戚",
  });
  assert.ok(hasWhenNone.some((i) => i.code === "HELP_SOURCES_HAS_WHEN_NONE"));

  const noneWhenHas = collectMohwSubmitGuardIssues({
    help_sources_flag: "有",
    help_sources_none: "沒發生過",
    help_sources_none_other: "自己處理",
  });
  assert.ok(noneWhenHas.some((i) => i.code === "HELP_SOURCES_NONE_WHEN_HAS"));
}

console.log("mohw-submit-guards-smoke: ok");
