## Lesson: Village admin management is owner-facing, desk is assignee-facing

- **Trigger:** P2 needed UI to change village↔admin rows without re-importing Excel.
- **Cause:** Desk scope only reads `里責任分配`; without upsert/setStatus, Excel was the only write path.
- **Rule:** Manage at `/manager/village-admins` (assignment.manage). Use `villageAdmins.upsert` / `setStatus` for single-row edits; keep `replaceAll` for bulk import. Desk entry stays `/desk/care-forms`.
- **Evidence:** `components/manage/village-admins-panel.tsx`, `gas/src/modules/VillageAdminModule.gs`, `app/api/manager/village-admins/route.ts`.
- **Added on:** 2026-10-25

## Lesson: Village desk scope matches visitor roster first

- **Trigger:** 里責紙本 KEY needs personal/org login mapped to villages without a full admin UI.
- **Cause:** Excel names may not yet exist as visitors; org emails are shared.
- **Rule:** Resolve desk scope by (1) workspace_owner → all, (2) `DESK_ORG_EMAILS` email→org slug, (3) login email/name against 訪查員主檔 then `里責任分配.admin_display_name`. Unmatched persons keep village rows by display name; create visitors later via desk minimal create. Bulk case import must batch `appendRows`, not per-row `appendRow`.
- **Evidence:** `lib/domain/village-admins.ts`, `scripts/import-village-desk-p0.mjs`, `gas/src/modules/VillageAdminModule.gs`, `app/desk/care-forms/`.
- **Added on:** 2026-10-25

## Lesson: Badge printing uses an explicit cross-search tray

- **Trigger:** Office staff need to find approved visitors one at a time, then combine several badges into A4 sheets.
- **Cause:** Filtering the roster replaced the visible selection, and an empty selection could accidentally fall back to printing the current result set or the whole roster.
- **Rule:** Keep search results separate from the print tray. Store canonical visitor IDs in session storage, merge explicitly selected URL entries, deduplicate visitor ID/code/email aliases, and never interpret an empty tray as “print everyone.” Four badges fill one 2×2 sheet; underfilled sheets remain printable with a warning.
- **Evidence:** `components/badges/use-gas-badge-print-data.ts`, `components/badges/gas-badge-print-sheet.tsx`, `components/workspace/users-panel.tsx`.
- **Added on:** 2026-10-24

# Lessons

## 繁體中文說明

這份文件用來保存「下次不要再重複踩坑」的專案經驗。  
只有當一個發現具備重複價值、會影響未來判斷時，才應該記錄在這裡；不要把一次性的小插曲全部塞進來。

## Lesson: Manager desk care forms reuse the visitor submit path

- **Trigger:** Office staff key paper care forms and must attach them to a visitor without a new export pipeline.
- **Cause:** Creating a separate desk table would drift from the 102-column gold export.
- **Rule:** Desk flow creates or reuses a case, dispatches `公所代填・紙本` to the chosen visitor, then submits through `careform.submit`. After status is submitted, the visitor page is read-only. Do not skip audit or invent a second MOHW path. `cases.create` must be deployed with GAS before live desk-create works. Current phase: **one paper = one visit**; each desk「下一步」always creates a new assignment (`allow_multi_active`). Three 未遇 papers KEY’d in sequence = three visit attempts = complete—do **not** pack three attempts into one form. Field visitor self-KEY still keeps unique active assignment.
- **Evidence:** `app/manager/care-forms/`, `app/api/manager/care-forms/prepare/route.ts`, `gas/src/modules/AssignmentModule.gs`, `gas/src/modules/CaseModule.gs`.
- **Added on:** 2026-10-24（紙本一張一次／2026-10-25）

## Lesson: Elder phone sentinels are 10 zeros or 10 nines

- **Trigger:** Visitors needed a way to record no phone / refused phone; `9999999999` failed mobile validation and emergency `0000000000` also failed.
- **Cause:** Mobile required `09xxxxxxxx`; emergency required a real landline or mobile.
- **Rule:** On 電話／手機 accept `0000000000` (none) and `9999999999` (refused). Emergency contact phone is optional—empty is fine. Do not apply these codes to 訪查人 phones.
- **Evidence:** `lib/domain/mohw-life-care-export.ts`, `lib/domain/mohw-life-care-validation.ts`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-23

## Lesson: Manager default-email login stays off the public home

- **Trigger:** The public login showed the prefilled 管理者 Google 帳號 entry.
- **Cause:** `/login` mixed visitor email/password with the allowlisted manager shortcut.
- **Rule:** Keep the manager default-email form on unlisted `/yonghe` (no public link). Homepage `/`, `/register`, and `/login` only show visitor register/login. Old `/login/manager` redirects to `/yonghe`.
- **Evidence:** `app/yonghe/page.tsx`, `components/auth/manager-login-panel.tsx`, `components/auth/login-panel.tsx`.
- **Added on:** 2026-10-23

## Lesson: Manager visitor corrections stay on the approved roster

- **Trigger:** Badge photos and roster names were wrong; operators had to patch Drive via scripts.
- **Cause:** GAS already had `visitors.update` / `accounts.setHeadshot`, but the users panel had no whitelist editor.
- **Rule:** First version only corrects name, mobile, and headshot on approved visitors. Do not expose generic sheet updates. Keep old Drive photos. Sync 訪查員主檔, 註冊檔, and login display name together.
- **Evidence:** `components/workspace/visitor-correction-dialog.tsx`, `gas/src/modules/UserAccountModule.gs` `patchApprovedVisitor`.
- **Added on:** 2026-10-22

## Lesson: Care-form numbers must be foolproof for import

- **Trigger:** Household-registration names can show `?`, and MOHW import rejects full-width `：` or English `O` typed as zero.
- **Cause:** Visitors were given free-text date/time/phone fields; Google Forms previously let people type `O` instead of `0`.
- **Rule:** Show full names and let visitors edit them. Date/time use fixed half-width separators; visitors type digits only. Convert lookalike `O` to `0` (keep a leading `O` on national IDs). ROC year: 3 digits stay as-is, 1–2 digits pad to 3.
- **Evidence:** `components/visitor/visit-dialogue-form.tsx`, `lib/domain/mohw-life-care-export.ts`.
- **Added on:** 2026-10-21

## Lesson: 訪視中 drill-down must use in-progress cases

- **Trigger:** Managers expected「訪視中」date totals to equal the workflow count, but daily-visits summed assignments by due date.
- **Cause:** Different universes—`visit_status === "進行中"` vs assignment-date slices—and unassigned cases were easy to hide.
- **Rule:** For workflow「訪視中」drill-down, source only in-progress cases; bucket by due/visit date (else 未排程); sort overdue → today → future → unscheduled; unassigned visitor group first; case order by stuckness. Date sums must equal the workflow total.
- **Evidence:** `lib/domain/in-progress-visit-board.ts`, `app/api/manager/in-progress-visits/route.ts`, `components/daily-visits/daily-visit-report-panel.tsx`.
- **Added on:** 2026-10-07

## Lesson: Missed-visit evidence is conditional

- **Trigger:** The visit workflow was interpreted as requiring photo evidence for every visit.
- **Cause:** The wording did not clearly distinguish ordinary visits from missed visits.
- **Rule:** Require `未遇佐證照片` and `未遇定位` only when `visitResult === "未遇"`.
- **Evidence:** `lib/domain/visits.ts` and `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-05-17

## Lesson: Visitor tab cache vs attendance invalidation

- **Trigger:** Speeding up every visitor tab raised the question whether check-in/out must clear caches.
- **Cause:** Read caches (3–60s) improve tab switching, but hours/tasks would briefly show pre-clock data if not invalidated.
- **Rule:** Cache visitor hours (3s), tasks (3s), payments (3s), badge QR (60s). On check-in/out only invalidate `visitorHours` + `visitorTasks` (+ daily visits)—not badge or payments.
- **Evidence:** `lib/gas-read-cache.ts`, `app/api/visitor/hours/route.ts`, `app/api/attendance/clock/route.ts`, `app/api/visits/clock/route.ts`.
- **Added on:** 2026-10-05

## Lesson: Assignment confirm must honor completion status

- **Trigger:** Joe’s payments showed audited/completed visits, but `/visitor/tasks` still listed them as `填報中`.
- **Cause:** `AssignmentModule.confirm` ignored `status` from care-form submit and always wrote `進行中`; the live Web App also needed a versioned redeploy after `clasp push`.
- **Rule:** When completing a visit, set assignment to `已完成`/`空訪`; audit pass should close the assignment; redeploy the production Web App deployment ID, not only `@HEAD`.
- **Evidence:** `gas/src/modules/AssignmentModule.gs`, `gas/src/modules/AuditModule.gs`, `gas/src/modules/CareFormModule.gs`.
- **Added on:** 2026-10-05

## Lesson: Missed-visit needs multi-slot photos

- **Trigger:** A single doorway photo was not enough to document repeated empty visits at different times of day.
- **Cause:** Validation only required `photoNames.length >= 1`.
- **Rule:** When `visitResult === "未遇"`, require photos covering **3–5** distinct time slots (`上午／中午／下午／傍晚／夜間`), with GPS; upload slot images to Drive and write `空訪紀錄`.
- **Evidence:** `lib/domain/visits.ts`, `components/visitor/visit-dialogue-form.tsx`, `gas/src/modules/CareFormModule.gs`.
- **Added on:** 2026-10-03

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

## Lesson: 永和紙本證件套列印走 GAS，不走舊版 Supabase 發證

- **Trigger:** 承辦要依目前 GAS 名冊批次印永和證件套並裁切，舊「產生／列印訪員證」讀的是 Supabase。
- **Cause:** 營運資料在 Sheets／GAS；Supabase `visitor_badges` 發證與證件套版型是兩套流程。
- **Rule:** 紙本證件套只用 `/workspace/users/badges/gas-print`（A4 2×2、正／背面／雙面交錯）；使用者管理畫面不要再放 Supabase「發證列印」入口，避免與 GAS 營運混淆。
- **Evidence:** `lib/domain/gas-physical-badge-print.ts`, `components/badges/gas-badge-print-sheet.tsx`, `app/workspace/users/badges/gas-print/page.tsx`, `components/workspace/users-panel.tsx`.
- **Added on:** 2026-10-20

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

## Lesson: Visitor care-form errors belong on the field, not in Excel coordinates

- **Trigger:** 高齡訪查員 saw `I2` / `CV2` and “MOHW 驗證錯誤（含儲存格座標）” and could not tell which box to fix.
- **Cause:** Validation already had `key` / `label` / `message`, but the visitor form only rendered `display` (cell + jargon) in a top list. Inputs had no error state.
- **Rule:** On the visitor care form, show a plain-language reason under the field, rewrite the top list with Chinese labels, and jump to that field on tap. Keep Excel coordinates on manager export / audit only.
- **Evidence:** `components/visitor/visit-dialogue-form.tsx` and `lib/domain/mohw-life-care-validation.ts` (`visitorFacingMohwError`).
- **Added on:** 2026-09-21

## Lesson: Export and payment joins must use case_id / assignment_id, not encoded_id

- **Trigger:** Four 已稽核 cases existed, but 匯出管理 showed 0 candidates and 核銷批次 showed 0 items after 核准.
- **Cause:** `export.listCandidates` looked up care forms by `encoded_id`. Import reused `YH-115-A001` for every case (`parseInt('A001')` is NaN), so the latest row was a 待補件／草稿 and every case was skipped. GAS payment preview also always returned `[]`.
- **Rule:** Join 關懷表 → 派案 → 個案 by `assignment_id` / `case_id`. Do not treat `encoded_id` as unique. `IdEncoder` must parse the `A###` suffix. Manager export/payment screens should use one composite GAS read.
- **Evidence:** `gas/src/utils/VisitRecordIndex.gs`, `gas/src/modules/ExportModule.gs`, `gas/src/utils/IdEncoder.gs`, and `components/export/exports-workspace.tsx`.
- **Added on:** 2026-09-21

## Lesson: Volunteer transport fees use hour brackets or per-trip, never hourly multiplication

- **Trigger:** Yonghe volunteer reimbursement was still a TODO (`amount: 0`) while the 115.07.01 plan already had quarterly/annual tables, and meal delivery was missing.
- **Cause:** The plan tables look like they include an hourly rate, but payment is the lump sum of the highest reached hour bracket. Meal delivery is 100 NTD per breakfast/lunch/dinner trip.
- **Rule:** Look up the volunteer group, accumulate hours or meal trips in the settlement period, and pay the matching bracket total or `trips × 100`. Do not compute `hours × hourly rate`.
- **Evidence:** `lib/domain/volunteer-transport-fees.ts`, `gas/src/utils/VolunteerTransportFees.gs`, and `gas/src/modules/PaymentModule.gs`.
- **Added on:** 2026-09-18

## Lesson: Doorplate check-in is not missed-visit evidence

- **Trigger:** Stakeholders asked for address/doorplate photo as arrival check-in, while 未遇 already required 門口/門牌 photos.
- **Cause:** Mixing the two makes ordinary visits look like they always need evidence photos, and hides the arrival check-in step.
- **Rule:** Require doorplate/entrance photo + GPS on **visit session check-in** (`session_type=訪查`, `checkin_photo_url`). Keep 未遇 photo categories only when `visitResult === "未遇"`. Day-end volunteer checkout stays **manual confirm**, never silent auto-checkout.
- **Evidence:** `components/visitor/visit-assignment-clock.tsx`, `gas/src/modules/AttendanceModule.gs`, `components/visitor/day-complete-panel.tsx`.
- **Added on:** 2026-10-03
