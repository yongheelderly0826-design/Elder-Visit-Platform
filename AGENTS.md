# AGENTS.md

## 繁體中文說明

這份文件是本專案給 AI Agent 使用的總操作手冊。  
它定義「要怎麼開始、怎麼分工、怎麼驗證、怎麼收尾」，讓每一次開發都盡量沿著同一套標準流程前進。

## Project Operating Model

This project follows the user's four-step agentic development workflow:

1. Plan before coding.
2. Parallelize only independent workstreams.
3. Record durable lessons instead of relying on memory.
4. Deliver through role-based review.

The product source of truth is:

- `docs/spec-v2.4.pdf`
- `docs/spec-v2.4-extracted.md`

The **operational architecture** for 永和區落地 is:

- `docs/architecture/README.md` — GitHub + Google Sheets + GAS stack
- `docs/sheets/schema-overview.md` — spreadsheet column definitions
- `gas/` — Apps Script backend (clasp-deployed)
- `lib/gas-client.ts` — Next.js → GAS API client

## Standard Roles

- **Planner / Lead** — frame the goal, affected workflow, acceptance criteria, and risks.
- **Builder** — implement the functional change.
- **Design / UX Agent** — protect product language, icon consistency, hierarchy, readability, and field usability.
- **App Icon / PWA Agent** — review manifest, home-screen icons, installability, and launch polish when relevant.
- **Reviewer / QA** — inspect edge cases and verify against requirements.
- **Release / Ops** — run final checks and distinguish local build success from actual deployment status.

## Project-Specific Rules

- Prefer the existing calm, care-oriented visual language before inventing new UI patterns.
- Photos and location are required only when `visitResult === "未遇"`.
- Keep demo-role accounts under `@eldervisit.org`.
- Treat `docs/spec-v2.4.pdf` as the governing product reference when behavior is ambiguous.
- Use `npm run typecheck`, `npm run lint`, and `npm run build` as the standard verification gate before publish work.
- When discussing publication, separate:
  - local edits
  - local verification
  - git push state
  - live deployment state

## Standard Work Pattern

For meaningful tasks:

1. Briefly state the goal and files likely involved.
2. Define acceptance criteria before implementation.
3. Split independent work only when write scopes are clear.
4. Run a Design / UX pass for visible interface changes.
5. Run an App Icon / PWA pass when installability or home-screen presentation changes.
6. Record reusable lessons in `LESSONS.md`.
7. Use `RELEASE-CHECKLIST.md` before claiming a task is ready to ship.

## Task Kickoff Command

Use the project task generator when starting meaningful work:

```bash
npm run task:new -- --title "Short task title" --slug short-task-slug
```

Optional flags:

- `--ui` for visible UI work
- `--pwa` for manifest / home-screen / installability work
- `--release` when deployment is part of the task

After the brief exists, generate a semi-automatic orchestration plan:

```bash
npm run task:orchestrate -- --file docs/tasks/YYYY-MM-DD-short-task-slug.md
```

This creates a companion `.orchestration.md` file with recommended roles, documents to review, and closeout checks.

任務完成前，再執行：

```bash
npm run task:close -- --file docs/tasks/YYYY-MM-DD-short-task-slug.md
```

這會產生 `.closeout.md`，協助檢查是否還有未完成項目、空白佔位內容，或需要回寫的經驗。

## Architecture Rules (永和區)

- **Operational data** lives in Google Sheets; do not duplicate master data in Supabase unless Phase 2 migration is active.
- **Business logic** for import, validation, encoding, and MOHW export belongs in `gas/src/modules/`.
- **GitHub account** `yongheelderly0826-design` owns the repo; GAS deploys via clasp from `gas/`.
- Use **訪查員** (not 志工/訪員) in user-facing copy and sheet names.
- Deploy GAS with `bash scripts/deploy-gas.sh`; never commit `gas/.clasp.json`.

## Key Project References

- `docs/architecture/README.md`
- `docs/architecture/gas-api.md`
- `docs/architecture/deployment.md`
- `docs/sheets/schema-overview.md`
- `gas/README.md`
- `docs/development-plan-v2.4.md`
- `docs/rbac-auth-plan.md`
- `docs/new-taipei-care-form-workflow.md`
- `docs/pwa-offline-checklist.md`
- `docs/pwa-home-screen-review.md`
- `docs/task-brief-template.md`
- `DESIGN-SYSTEM.md`
- `LESSONS.md`
- `RELEASE-CHECKLIST.md`
