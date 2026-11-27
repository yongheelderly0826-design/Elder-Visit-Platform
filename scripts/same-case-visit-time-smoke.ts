/**
 * Smoke: 同案關懷表時段衝突（不要求訪查員相同）。
 * Run: node --experimental-strip-types scripts/same-case-visit-time-smoke.ts
 */
import assert from "node:assert/strict";
import {
  findOverlappingWindow,
  findSameCaseTimeConflict,
  formatSameCaseVisitTimeConflictMessage,
  windowsOverlap,
  windowsTimeOverlap,
  type DeskVisitWindow,
} from "../lib/domain/desk-care-batch.ts";

function win(
  partial: Partial<DeskVisitWindow> &
    Pick<DeskVisitWindow, "visitDate" | "start" | "end" | "label">,
): DeskVisitWindow {
  return {
    visitorIds: partial.visitorIds ?? [],
    assignmentId: partial.assignmentId,
    caseId: partial.caseId,
    visitDate: partial.visitDate,
    start: partial.start,
    end: partial.end,
    label: partial.label,
  };
}

function main() {
  const a = win({
    assignmentId: "ASG-1",
    caseId: "C1",
    visitorIds: ["V-A"],
    visitDate: "2026-11-27",
    start: "10:00",
    end: "10:10",
    label: "關懷表 CF-1・未遇",
  });
  const bSameTimeDiffVisitor = win({
    assignmentId: "ASG-2",
    caseId: "C1",
    visitorIds: ["V-B"],
    visitDate: "2026-11-27",
    start: "10:00",
    end: "10:10",
    label: "關懷表 CF-2・完成訪視",
  });
  const adjacent = win({
    assignmentId: "ASG-3",
    caseId: "C1",
    visitorIds: ["V-B"],
    visitDate: "2026-11-27",
    start: "10:10",
    end: "10:20",
    label: "相鄰",
  });
  const otherDay = win({
    assignmentId: "ASG-4",
    caseId: "C1",
    visitorIds: ["V-B"],
    visitDate: "2026-11-28",
    start: "10:00",
    end: "10:10",
    label: "隔日",
  });

  assert.equal(windowsTimeOverlap(a, bSameTimeDiffVisitor), true);
  assert.equal(windowsOverlap(a, bSameTimeDiffVisitor), false, "異訪員不應走同組 overlap");
  assert.ok(findSameCaseTimeConflict(bSameTimeDiffVisitor, [a]));
  assert.equal(findOverlappingWindow(bSameTimeDiffVisitor, [a]), null);

  assert.equal(windowsTimeOverlap(a, adjacent), false, "相鄰不擋");
  assert.equal(findSameCaseTimeConflict(adjacent, [a]), null);
  assert.equal(findSameCaseTimeConflict(otherDay, [a]), null);

  const msg = formatSameCaseVisitTimeConflictMessage(a, "本張");
  assert.match(msg, /同案/);
  assert.match(msg, /10:00–10:10/);

  console.log("same-case-visit-time-smoke: ok");
}

main();
