/**
 * Smoke: 無名側清空 worker date；有名側保留；擇一完整案例不變。
 * Run: node --experimental-strip-types scripts/orphan-worker-dates-smoke.ts
 */
import assert from "node:assert/strict";
import { clearOrphanWorkerDates } from "../lib/domain/mohw-worker-dates.ts";

function main() {
  const bothPrefill = clearOrphanWorkerDates({
    social_worker_name: "黃社工",
    social_worker_date: "115/11/04",
    civil_worker_name: "",
    civil_worker_date: "115/11/04",
  });
  assert.equal(bothPrefill.social_worker_name, "黃社工");
  assert.equal(bothPrefill.social_worker_date, "115/11/04");
  assert.equal(bothPrefill.civil_worker_name, "");
  assert.equal(bothPrefill.civil_worker_date, "");

  const civilOnly = clearOrphanWorkerDates({
    social_worker_name: "  ",
    social_worker_date: "115/10/01",
    civil_worker_name: "王里幹",
    civil_worker_date: "115/10/01",
  });
  assert.equal(civilOnly.social_worker_date, "");
  assert.equal(civilOnly.civil_worker_date, "115/10/01");
  assert.equal(civilOnly.civil_worker_name, "王里幹");

  const bothNamed = clearOrphanWorkerDates({
    social_worker_name: "黃社工",
    social_worker_date: "115/11/04",
    civil_worker_name: "王里幹",
    civil_worker_date: "115/11/05",
  });
  assert.equal(bothNamed.social_worker_date, "115/11/04");
  assert.equal(bothNamed.civil_worker_date, "115/11/05");

  const neither = clearOrphanWorkerDates({
    social_worker_date: "115/11/04",
    civil_worker_date: "115/11/04",
  });
  assert.equal(neither.social_worker_date, "");
  assert.equal(neither.civil_worker_date, "");

  console.log("orphan worker dates smoke passed");
}

main();
