# Release Checklist

## 繁體中文說明

這份清單用來避免把「本地完成」誤認成「已經可以安全發布」。  
它要求把本地修改、本地驗證、Git 狀態與實際部署狀態拆開確認。

## Before Release

- [ ] Requirements are satisfied against the relevant spec or workflow doc.
- [ ] UI changes received a Design / UX review.
- [ ] PWA or home-screen changes received an App Icon / PWA review.
- [ ] Durable lessons were added to `LESSONS.md` when needed.
- [ ] `npm run typecheck` completed.
- [ ] `npm run lint` completed.
- [ ] `npm run build` completed.

## Release State

- [ ] Local edits complete.
- [ ] Local verification complete.
- [ ] Git commit created when appropriate.
- [ ] Git push completed when publish is intended.
- [ ] Live deployment confirmed separately from build success.

## Elder Visit Specific Smoke Checks

- [ ] Login works for the intended demo or real account.
- [ ] Relevant role sees the expected navigation and actions.
- [ ] Missed-visit flow still requires evidence only for `未遇`（3–5 distinct time-slot photos + GPS）.
- [ ] Any changed manager / visitor / audit route loads correctly.
- [ ] If PWA assets changed, add-to-home-screen behavior was checked on target devices when possible.
