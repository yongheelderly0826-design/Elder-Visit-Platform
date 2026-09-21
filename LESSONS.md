# Lessons

## 繁體中文說明

這份文件用來保存「下次不要再重複踩坑」的專案經驗。  
只有當一個發現具備重複價值、會影響未來判斷時，才應該記錄在這裡；不要把一次性的小插曲全部塞進來。

## Lesson: Missed-visit evidence is conditional

- **Trigger:** The visit workflow was interpreted as requiring photo evidence for every visit.
- **Cause:** The wording did not clearly distinguish ordinary visits from missed visits.
- **Rule:** Require `未遇佐證照片` and `未遇定位` only when `visitResult === "未遇"`.
- **Evidence:** `lib/domain/visits.ts` and `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-05-17

## Lesson: Build success is not deployment confirmation

- **Trigger:** A completed local build could be mistaken for a published site.
- **Cause:** Local verification, git state, and Vercel deployment are separate stages.
- **Rule:** Report local edits, local checks, git push state, Vercel deployment state, and live URL verification separately.
- **Evidence:** `DEPLOYMENT.md` and the Vercel publish workflow.
- **Added on:** 2026-05-17

## Lesson: Prefer the reliable verification path in this workspace

- **Trigger:** Local dev mode can become unstable in the synced workspace.
- **Cause:** File watching may hit `EMFILE` limits.
- **Rule:** Use `npm run typecheck`, `npm run lint`, and `npm run build` as the primary verification gate; use build/start when dev-server watching is unreliable.
- **Evidence:** Repeated project verification history in this checkout.
- **Added on:** 2026-05-17

## Lesson: Visitor registration must mirror official rosters

- **Trigger:** New visitor registration had to support the New Taipei visitor roster and later Social Affairs Bureau review.
- **Cause:** If registration fields differ from the official roster, export, review, and assignment eligibility need manual cleanup later.
- **Rule:** Keep visitor registration fields aligned with the official roster first, then add product-only fields such as display name, headshot preview, and workflow status around that core.
- **Evidence:** `components/workspace/users-panel.tsx`, `lib/domain/types.ts`, and `supabase/migrations/0026_visitor_registration_review.sql`.
- **Added on:** 2026-05-20

## Lesson: Visitor approval is not the same as login readiness

- **Trigger:** Approved visitors appeared in management data but did not have a clear way to log in or complete their own profile.
- **Cause:** Workspace approval, Supabase Auth invitation, profile completion, and assignment eligibility are separate states.
- **Rule:** Track `auth_invite_status`, `profile_completion_status`, `visitor_code`, and `is_assignable` separately so administrators can see where each visitor is blocked.
- **Evidence:** `docs/visitor-login-profile-completion-plan.md` and `supabase/migrations/0027_visitor_identity_profile_completion.sql`.
- **Added on:** 2026-05-21

## Lesson: Large visitor rosters need scoped batch actions

- **Trigger:** A workflow expected to handle 200+ volunteers could not rely on a single long approved-user list.
- **Cause:** Without state tabs and explicit batch scope, administrators must manually infer which users need invitations, profile checks, remittance review, or export.
- **Rule:** Large operational rosters should expose state-based tabs, visible selection counts, and clear rules for whether batch actions apply to selected rows or the current filtered view.
- **Evidence:** `components/workspace/users-panel.tsx` and `docs/tasks/2026-05-21-bulk-visitor-management.md`.
- **Added on:** 2026-05-21

## Lesson: Cloudflare Workers needs committed deployment config

- **Trigger:** Cloudflare Workers Builds generated a bad `WORKER_SELF_REFERENCE` service binding during deployment.
- **Cause:** The repository did not include stable Wrangler/OpenNext configuration, so Cloudflare inferred the Worker name from project/package metadata.
- **Rule:** Keep `wrangler.jsonc` and `open-next.config.ts` committed, and make the self-reference service match the actual Worker name before relying on auto deployments.
- **Evidence:** `wrangler.jsonc`, `open-next.config.ts`, and `docs/tasks/2026-05-22-cloudflare-deployment-config.md`.
- **Added on:** 2026-05-22

## Lesson: Approval actions must be idempotent and visibly terminal

- **Trigger:** A manager tapped visitor approval again because the mobile card did not clearly show that processing had completed.
- **Cause:** A final-state action remained visually actionable while the completion message was separated from the card.
- **Rule:** Approval workflows must treat completed decisions as terminal on the server and immediately remove or relabel completed actions in the interface.
- **Evidence:** `lib/domain/user-management.ts` and `components/workspace/users-panel.tsx`.
- **Added on:** 2026-05-24

## Lesson: Sensitive photos need private file storage and controlled exports

- **Trigger:** Approved visitor rosters need to export headshots for 200 or more volunteers.
- **Cause:** Embedding image data in CSV or JSON makes exports oversized and obscures who can copy the actual photo files.
- **Rule:** Store headshots in a private attachment bucket, expose previews through short-lived authorized URLs, and export photos as permission-checked ZIP files named by the permanent visitor code.
- **Evidence:** `lib/domain/visitor-headshots.ts`, `app/api/users/export-headshots/route.ts`, and `supabase/migrations/0029_visitor_headshot_storage.sql`.
- **Added on:** 2026-05-24

## Lesson: Assignment eligibility must be server-enforced

- **Trigger:** Approved visitors still pass through invitation, activation, profile completion and remittance review before assignment.
- **Cause:** A visible management button alone cannot prevent early assignment confirmation or stale client state.
- **Rule:** Treat approval, account activation, required document completion and assignment eligibility as separate statuses, and enforce all eligibility checks in the server action that marks a visitor assignable.
- **Evidence:** `app/api/users/verify-visitor-profile/route.ts`, `components/workspace/users-panel.tsx`, and `supabase/migrations/0030_visitor_remittance_storage_qr_site.sql`.
- **Added on:** 2026-05-24

## Lesson: Payment documents must be exported separately from identity photos

- **Trigger:** Managers need to retrieve volunteer passbook images for remittance review after profile completion.
- **Cause:** Combining payment documents with headshots expands unnecessary access to sensitive banking evidence.
- **Rule:** Store passbook images in a private bucket and export them through an explicit, permission-checked ZIP action with a sensitive-data warning and visitor-code filenames, separately from headshot exports.
- **Evidence:** `lib/domain/visitor-documents.ts`, `app/api/users/export-passbooks/route.ts`, and `components/workspace/users-panel.tsx`.
- **Added on:** 2026-05-25

## Lesson: Public collection entry must not expose demo credentials

- **Trigger:** The production site is opened for volunteer registration intake before account invitation email is enabled.
- **Cause:** A login-first page that lists test users and passwords exposes internal testing access and obscures the public submission workflow.
- **Rule:** Route the public home entry to registration, keep login fields empty, and store any demo credential reference only in a locally ignored file.
- **Evidence:** `app/page.tsx`, `components/auth/login-panel.tsx`, `components/auth/register-panel.tsx`, and `.gitignore`.
- **Added on:** 2026-05-25

## Lesson: Batch review must reuse single-record governance logic

- **Trigger:** Managers need to approve dozens of visitor registrations in one action.
- **Cause:** A direct batch update would skip account creation, workspace membership, visitor profile, visitor code, and QR code side effects that the single approval path already owns.
- **Rule:** Batch review should iterate through the same domain function used by single-record review and only add aggregation, confirmation, and result reporting around it.
- **Evidence:** `lib/domain/user-management.ts`, `app/api/users/batch-review/route.ts`, and `components/workspace/users-panel.tsx`.
- **Added on:** 2026-05-28

## Lesson: Approved rosters need reconciliation after schema changes

- **Trigger:** Approved visitor counts did not match membership/profile counts after registration workflow changes.
- **Cause:** Older records could be approved without all later side-effect tables being populated, while the UI read only the newest registration rows.
- **Rule:** When approval side effects add new destination tables, include an idempotent backfill migration and avoid hard-coded list limits that hide older operational records.
- **Evidence:** `supabase/migrations/0031_backfill_approved_visitor_records.sql` and `lib/domain/user-management.ts`.
- **Added on:** 2026-05-28

## Lesson: Public registration must check duplicates before insert

- **Trigger:** Repeated visitor applications created more approved registration rows than formal visitor profiles.
- **Cause:** The public registration endpoint accepted new rows before checking the formal roster and existing pending or approved applications.
- **Rule:** Check the formal visitor profile first, then pending or approved registration requests, using email, official email, national ID and phone before inserting a new application; backend rosters and exports should count formal visitor records, not raw application rows.
- **Evidence:** `lib/domain/user-management.ts`, `components/workspace/users-panel.tsx`, and `supabase/migrations/0032_registration_duplicate_guards.sql`.
- **Added on:** 2026-05-29

## Lesson: SQL Editor workflows need a generated paste bundle

- **Trigger:** Supabase migrations were being applied by manually opening and pasting one SQL file at a time.
- **Cause:** The local environment did not have `supabase` CLI, Docker, or `psql`, so direct database execution was not available.
- **Rule:** Use `npm run db:bundle` to generate an ordered SQL bundle for Supabase SQL Editor before falling back to file-by-file manual copying.
- **Evidence:** `scripts/build-supabase-sql-bundle.mjs` and `supabase/README.md`.
- **Added on:** 2026-05-29

## Lesson: Government Excel imports must verify the real file container

- **Trigger:** A workbook renamed or saved as `無密碼.xlsx` still opened as a CDFV2 encrypted Office container rather than a standard zipped XLSX file.
- **Cause:** Operational spreadsheets can retain legacy/encrypted Office containers even when the filename extension suggests a normal workbook.
- **Rule:** Detect the actual file signature before parsing, support password-assisted preview when needed, and store import batch/source metadata so government roster rows can be audited after conversion.
- **Evidence:** `docs/elder-case-batch-import-plan.md`, `supabase/migrations/0033_elder_case_import_fields.sql`, and `lib/domain/imports.ts`.
- **Added on:** 2026-05-29

## Lesson: Visit guides should become staged field workflows

- **Trigger:** A government visit guide described how visitors should ask, observe, and obtain consent, but the app only exposed a long form.
- **Cause:** Form fields preserve data structure, but do not teach field workers the order, tone, and hidden observation tasks needed during a real visit.
- **Rule:** Convert visit guides into staged, collapsible field workflows above the form, with each stage linking to the relevant form sections and observation checks.
- **Evidence:** `lib/domain/visit-guide.ts`, `components/visitor/visit-dialogue-form.tsx`, and `docs/new-taipei-care-form-workflow.md`.
- **Added on:** 2026-05-29

## Lesson: Large roster imports need a marked pilot batch

- **Trigger:** A 75-plus Yonghe roster had more than 7,000 rows and no case codes.
- **Cause:** Importing the whole file before parser, mapping, assignment and visit flows are validated creates too much operational risk.
- **Rule:** Start with a clearly marked pilot batch from the source workbook, generate deterministic case codes, keep source batch metadata and row numbers, and only import the remaining rows after the assignment and visit workflow passes.
- **Evidence:** `lib/domain/yh-75-demo-data.ts`, `lib/domain/mock-data.ts`, and `lib/domain/assignments.ts`.
- **Added on:** 2026-05-30

## Lesson: Import previews must validate the full file

- **Trigger:** A 60-row assignment test CSV appeared valid in preview only because the old preview path inspected the first few rows.
- **Cause:** Sampling rows for display and validating rows for write readiness were using the same reduced dataset.
- **Rule:** Separate display sampling from validation: show a small preview table, but compute total rows, warnings, duplicate case-code checks and write eligibility from the full parsed file.
- **Evidence:** `lib/domain/imports.ts`, `components/import/import-preview-tool.tsx`, and `app/api/import/commit/route.ts`.
- **Added on:** 2026-06-22

## Lesson: Issued badges need immutable snapshots

- **Trigger:** Visitor badges must support paper printing, QR verification, and mobile electronic copies even if a profile changes later.
- **Cause:** Rendering badges directly from live visitor profile fields makes past printed badges hard to audit and can silently change what a QR code represents.
- **Rule:** Store an issued-badge snapshot with visitor code, display identity, photo reference, validity dates, QR payload, claim token hash and serial; use that snapshot for printing, public verification and mobile badge claiming.
- **Evidence:** `supabase/migrations/0034_visitor_badges.sql`, `lib/domain/visitor-badges.ts`, and `components/badges/visitor-badge-card.tsx`.
- **Added on:** 2026-06-22

## Lesson: GAS list pages should not N+1 round-trip

- **Trigger:** Manager daily visit stats and visitor tasks felt delayed even when the spreadsheet only had a few rows.
- **Cause:** Each screen made many separate GAS calls, and GAS re-read entire sheets for every care form / assignment lookup. There was no short-lived cache despite the architecture doc.
- **Rule:** For dashboard and inbox reads, add a composite GAS action that reads each sheet once, cache the bundle 20–25 seconds, and invalidate on dispatch, visit submit, visit clock, and audit decide. Keep a legacy fallback until the new GAS action is deployed.
- **Evidence:** `gas/src/modules/ReportModule.gs`, `lib/daily-visit-report-service.ts`, `lib/repositories/gas.ts`, and `lib/gas-read-cache.ts`.
- **Added on:** 2026-09-15

## Lesson: Daily visit stats persist as one JSON row plus a Drive file, not a new spreadsheet per day

- **Trigger:** Daily visit stats still felt slow after the composite bundle, and a one-spreadsheet-per-day layout was considered.
- **Cause:** Rebuilding from six live sheets on every page load is expensive; a new workbook per day would also change the folder architecture for later KPI / dispatch / attendance snapshots.
- **Rule:** Keep `報表快照` as one row per day (`report_type=daily_visit`, `period=YYYY-MM-DD`) and back up to Drive `報表快照/每日訪視統計/YYYY-MM-DD.json`. Rebuild a few seconds after dispatch, visit clock, care-form submit, or audit decide; do not create a new spreadsheet per day.
- **Evidence:** `gas/src/modules/ReportModule.gs`, `gas/src/triggers/OnEditTriggers.gs`, and `lib/daily-visit-report-service.ts`.
- **Added on:** 2026-09-16

## Lesson: Volunteer transport fees use hour brackets or per-trip, never hourly multiplication

- **Trigger:** Yonghe volunteer reimbursement was still a TODO (`amount: 0`) while the 115.07.01 plan already had quarterly/annual tables, and meal delivery was missing.
- **Cause:** The plan tables look like they include an hourly rate, but payment is the lump sum of the highest reached hour bracket. Meal delivery is 100 NTD per breakfast/lunch/dinner trip.
- **Rule:** Look up the volunteer group, accumulate hours or meal trips in the settlement period, and pay the matching bracket total or `trips × 100`. Do not compute `hours × hourly rate`.
- **Evidence:** `lib/domain/volunteer-transport-fees.ts`, `gas/src/utils/VolunteerTransportFees.gs`, and `gas/src/modules/PaymentModule.gs`.
- **Added on:** 2026-09-18
