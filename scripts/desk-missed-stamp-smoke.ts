/**
 * Smoke: one-paper 未遇戳記不可與同訪查員撞 M/D+時間。
 * Run: node --experimental-strip-types scripts/desk-missed-stamp-smoke.ts
 */
import assert from "node:assert/strict";
import {
  buildDeskOnePaperMissedNote,
  deskBatchMissedStampOffsetMinutes,
  notesIndicateDeceased,
  parseMissedVisitStamps,
  rewriteMissedVisitStampTimes,
  stripMissedVisitStamps,
  type DeskBatchState,
} from "../lib/domain/desk-care-batch.ts";

function main() {
  const base = buildDeskOnePaperMissedNote({
    visitDateRaw: "2025-10-28",
    visitStartTime: "15:30",
  });
  assert.ok(base);
  assert.match(base!, /10\/26 09:00訪視未遇/);
  assert.match(base!, /10\/27 14:00訪視未遇/);
  assert.match(base!, /10\/28 15:30訪視未遇/);

  const offset = buildDeskOnePaperMissedNote({
    visitDateRaw: "2025-10-28",
    visitStartTime: "15:40",
    slotOffsetMinutes: 10,
  });
  assert.ok(offset);
  assert.match(offset!, /10\/26 09:10訪視未遇/);
  assert.match(offset!, /10\/27 14:10訪視未遇/);
  assert.match(offset!, /10\/28 15:40訪視未遇/);

  const occupied = new Set(parseMissedVisitStamps(base!).map((s) => s.key));
  const avoided = buildDeskOnePaperMissedNote({
    visitDateRaw: "2025-10-28",
    visitStartTime: "15:50",
    occupiedStampKeys: occupied,
  });
  assert.ok(avoided);
  assert.match(avoided!, /10\/26 09:10訪視未遇/);
  assert.match(avoided!, /10\/27 14:10訪視未遇/);
  assert.match(avoided!, /10\/28 15:50訪視未遇/);

  const batch: DeskBatchState = {
    version: 1,
    returnPath: "/",
    identityKey: "x",
    village: "豫溪里",
    primaryVisitorId: "V1",
    companionVisitorIds: [],
    visitorNames: {},
    items: [
      { caseId: "c1", caseName: "a", caseCode: "1", assignmentId: "ASG-1", status: "keyed" },
      { caseId: "c2", caseName: "b", caseCode: "2", assignmentId: "ASG-2", status: "ready" },
      { caseId: "c3", caseName: "c", caseCode: "3", assignmentId: "ASG-3", status: "ready" },
    ],
    updatedAt: new Date().toISOString(),
  };
  assert.equal(deskBatchMissedStampOffsetMinutes(batch, "ASG-1"), 0);
  assert.equal(deskBatchMissedStampOffsetMinutes(batch, "ASG-2"), 10);
  assert.equal(deskBatchMissedStampOffsetMinutes(batch, "ASG-3"), 20);

  const rewritten = rewriteMissedVisitStampTimes(base!, {
    "10/26 09:00": "09:20",
  });
  assert.match(rewritten, /10\/26 09:20訪視未遇/);
  assert.match(rewritten, /10\/27 14:00訪視未遇/);

  assert.equal(notesIndicateDeceased("社區管理員指案主已於115年9月往生"), true);
  assert.equal(notesIndicateDeceased("10/25 09:20訪視未遇"), false);
  const cleaned = stripMissedVisitStamps(
    "社區管理員指案主已於115年9月往生；10/25 09:20訪視未遇；10/26 14:20訪視未遇；10/27 16:40訪視未遇。",
  );
  assert.equal(cleaned, "社區管理員指案主已於115年9月往生");

  console.log("desk missed stamp smoke passed");
}

main();
