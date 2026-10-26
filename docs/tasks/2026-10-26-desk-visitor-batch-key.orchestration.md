# Orchestration Plan: 關懷表建檔訪查組與多案KEY

Source brief: `docs/tasks/2026-10-26-desk-visitor-batch-key.md`

## 繁體中文說明

這份文件是任務的半自動編排建議。它會根據 task brief 的內容，幫你先判斷：

- 這次需要哪些 Agent
- 開始前要補哪些資訊
- 哪些文件要一起檢查
- 任務收尾前要完成哪些確認

## Recommended Roles

1. **Planner / Lead** — confirm goal, scope, and acceptance criteria.
2. **Builder** — implement the functional change.
3. **Design / UX Agent** — review visual hierarchy, icon use, copy, and mobile usability.
4. **Reviewer / QA** — verify edge cases and requirement fit.
5. **Release / Ops** — run release checks and confirm live state.

## Why These Roles Were Selected

- UI-sensitive work detected: **yes**
- PWA / home-screen work detected: **no**
- Release-sensitive work detected: **yes**

## Before Starting

- [ ] Goal and acceptance criteria are filled in.
- [ ] Likely files are listed.
- [ ] Risks / ambiguities are explicit.
- [ ] Existing product language to preserve is identified.

## Documents to Review or Update

- `AGENTS.md`
- `LESSONS.md`
- `RELEASE-CHECKLIST.md`
- `DESIGN-SYSTEM.md`

## Suggested Execution Order

1. Complete the task brief.
2. Confirm whether any workstreams can truly run in parallel.
3. Implement the builder scope.
4. Run Design / UX review.
5. Run PWA review only if installability changed.
6. Run Reviewer / QA checks.
7. Run Release / Ops checks if shipping is intended.
8. Capture durable lessons before closing the task.

## Before Closing

- [ ] `npm run typecheck` completed.
- [ ] `npm run lint` completed.
- [ ] `npm run build` completed.
- [ ] Durable lessons were considered for `LESSONS.md`.
- [ ] Design / UX review completed.
- [ ] Local verification and live deployment state were reported separately.

## Completion Prompt

When the task is done, answer:

1. What changed?
2. What was verified?
3. What design / UX judgment was applied?
4. What lesson should be kept for future work?
5. Is anything still undecided?
