## Lesson: Worker side 「已開始填」 ignores date-only residue

- **Trigger:** Care form showed「已開始填民政訪查人，請補齊身分／姓名／電話」even when only social was filled (user expected 擇一／至少一邊).
- **Cause:** `hasCivil`/`hasSocial` treated any filled field including `*_worker_date` as started; desk seed sets both civil and social dates from `visit_date`.
- **Rule:** A side is 「已開始」only on identity-bearing fields (role／name／national_id／phone)—**not date alone**. Still require at least one complete side; both sides OK when both intentional. Keep seeding both dates for convenience. Align TS + GAS validators.
- **Evidence:** `lib/domain/mohw-life-care-validation.ts` (`workerSideStarted`), `gas/src/utils/MohwLifeCareValidator.gs`, `lib/domain/mohw-desk-form-defaults.ts`.
- **Added on:** 2026-10-31

## Lesson: 社政身分官方四類；關懷表民政／社政至少一邊、兩邊可並存

- **Trigger:** 衛福匯入範本「社政訪查人-身分」僅社會局/處、社工、志工、其他；產品曾把「電話問安」放進社政職稱，且帶入訪員時會清空另一邊。
- **Cause:** Desk social titles mirrored extended registry labels; `applyVisitorToWorkerAnswers` cleared the opposite side for exclusive 擇一 UX.
- **Rule:** 關懷表 `社政訪查人-身分` 仍僅官方四類；名冊職稱「電話問安」民政／社政皆可選，社政帶入→其他＋說明「電話問安」。驗證維持「至少一邊」；帶入只覆寫本邊；開表依主填＋同行填空欄。
- **Evidence:** `lib/domain/visitor-registration-options.ts`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-31

## Lesson: Desk temp visitor create matches formal registration fields

- **Trigger:** 現場建檔／紙本 KEY「新增訪查員」只填姓名＋手機（`desk_minimal` 允許空身分證），與正式註冊必填落差大。
- **Cause:** Desk shortcut prioritized KEY speed over registry completeness; GAS skipped Taiwan ID when `desk_minimal`.
- **Rule:** Keep desk auto-approve (`status=已核准` + badge) for KEY ops, but **require** name／phone／email／valid Taiwan ID／job_title／volunteer_group／selfie. API validates via `lib/domain/desk-visitor-create.ts`; GAS always validates ID (no empty-id shortcut). Selfie: UI compresses JPEG → GAS uploads to Drive `_訪員註冊證件照` and stores Drive URL in `photo_url` (avoid raw data URL in Sheets cells). Gender／department via `ensureColumns` on 訪查員主檔. Edit no longer「可後補」for id/email. Deploy GAS after `VisitorModule` change.
- **Evidence:** `components/manage/quick-key-panel.tsx`, `care-form-desk-panel.tsx`, `desk-visitor-form-fields.tsx`, `app/api/manager/care-forms/visitors/route.ts`, `gas/src/modules/VisitorModule.gs`.
- **Added on:** 2026-10-31

## Lesson: Module-init const must not call later helpers (TDZ / Vercel build)

- **Trigger:** `npm run build` failed collecting `/api/exports/mohw/candidates` with `ReferenceError: Cannot access 'n' before initialization`.
- **Cause:** Added `UI_EXTRA_OPTIONS` / `withUiExtraOptions` between `mohwLifeCareSections` (module-level const that maps via `columnToMohwField`) and the helper bodies. Bundlers may rewrite `export function` to `const`, so call-order is not safely hoisted.
- **Rule:** Any exported `const` that runs at import time must sit **below** every function/`const` it touches. Prefer defining helpers first, then `mohwLifeCareSections`.
- **Evidence:** `lib/domain/mohw-life-care-ui.ts`, route `app/api/exports/mohw/candidates/route.ts`.
- **Added on:** 2026-10-30

## Lesson: Module-init consts used by hoisted builders must precede them

- **Trigger:** Vercel Production failed on `5bc177c`; local `next build` → `Cannot access 'n' before initialization` while collecting `/api/exports/mohw/candidates`.
- **Cause:** `UI_EXTRA_OPTIONS`（電話問安 UI extra）was declared **after** `mohwLifeCareSections`, which runs at module load via hoisted `columnToMohwField` → TDZ on the const.
- **Rule:** Anything a module-level initializer reads must be declared above it (or inlined). typecheck alone will not catch TDZ; run `npm run build` before push when touching mohw-life-care-ui init paths.
- **Evidence:** `lib/domain/mohw-life-care-ui.ts`.
- **Added on:** 2026-10-30

## Lesson: Desk visitor edit needs 職稱／身分別, not only 民政／社政

- **Trigger:** 紙本 KEY「編輯訪查員」只有民政／社政兩項；承辦無法標「電話問安」等細身分。
- **Cause:** Desk create/update only wrote `volunteer_group`（civil/social）；`job_title` 未進 Sheets slim list 與 UI。
- **Rule:** Keep 民政／社政 as worker group for 帶入欄位分流；另編輯 `job_title`。「電話問安」民政／社政皆可（民政帶入→公所人員；社政→其他／電話問安）。Persist via `visitors.update` `job_title`。Deploy GAS for `job_title` column.
- **Evidence:** `components/manage/care-form-desk-panel.tsx`, `app/api/manager/care-forms/visitors/route.ts`, `gas/src/modules/VisitorModule.gs`, `lib/domain/visitor-registration-options.ts`.
- **Added on:** 2026-10-30

## Lesson: Audit queue「進表修正」fixes CW2 in place

- **Trigger:** 稽核佇列 blocked on CW2（民政訪查人－身分證字號）but cards only had 核准／退回補件; no path to edit care form.
- **Cause:** Manager desk form did not load existing answers from audit; `careform.submit` always appended a new row → duplicate audits if resubmitted.
- **Rule:** Audit card「進表修正」→ `/manager/care-forms/[assignmentId]?return=/manager/audit`. Manager_desk stays editable, loads Sheets answers, skips local draft restore on audit return. GAS `careform.submit` **updates** latest 已提交／待補件／草稿 for that assignment (same `careform_id`) so pending audit re-validates. After save, return to `/manager/audit` and refresh. CW2 fix: re-pick 民政／社政 visitor (pulls `id_number`) or edit national id, then submit. Deploy GAS for upsert; Next alone only opens the form.
- **Evidence:** `components/audit/audit-queue-card.tsx`, `app/manager/care-forms/[assignmentId]/page.tsx`, `gas/src/modules/CareFormModule.gs`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-29

## Lesson: Disable test visitors via `visitors.update` status

- **Trigger:** Live `訪查員主檔` mixed real 永和區 staff with seeded test rows (測試／驗證／`@eldervisit.org`／known fake IDs).
- **Cause:** GAS has `visitors.create/update/approve` but **no delete**; hard Sheet wipes risk production rows.
- **Rule:** Inventory first (`visitors.list`); only disable clearly marked test rows with `visitors.update` → `status: "停用"` (+ tag). Leave TEMP desk clerks and unmarked real staff. Note: `accounts.*` has no disable API — login may still succeed for linked emails until account status is handled separately; attendance already rejects `停用`.
- **Evidence:** Live cleanup 2026-10-29, 15 rows; `gas/src/modules/VisitorModule.gs`, schema `待審/已核准/停用`.
- **Added on:** 2026-10-29

## Lesson: Desk paper KEY skips 未遇 photo／GPS

- **Trigger:** 公所代填紙本 KEY still looked like field 未遇 (photos + GPS), and client/`validateVisitSubmission` required 3 slot photos so one-slot desk papers (incl. 一鍵未遇) failed.
- **Cause:** Field rule「未遇 3–5 時段各一張＋定位」was applied to desk; API already wanted floor=1 for desk but shared validator still used `missedVisitMinSlots`.
- **Rule:** Desk (`isDeskEntry` / `deskEntry`): `minMissedPhotoSlots: 1` + `requireMissedGps: false`; keep time-slot chips only (synthetic `photoNames` labels); **hide** photo upload UI for desk 未遇. Field visitors unchanged (3–5 photos + GPS).
- **Evidence:** `lib/domain/visits.ts`, `components/visitor/visit-dialogue-form.tsx`, `app/api/visits/submit/route.ts`.
- **Added on:** 2026-10-29

## Lesson: MOHW export bulk-select by visit date and village

- **Trigger:** Managers need faster batch export by one day’s KEY papers or one village, or both.
- **Cause:** Export UI only had select-all ready / errors; no date or 區里 filter.
- **Rule:** Filter bar on `MohwExportPanel`: date + area dropdown (AND). Buttons「勾選符合條件・可匯出／全部」. Table shows filtered rows + 訪視日 column. Candidate payload includes `visit_date` from answers (fallback `submitted_at` for filter).
- **Evidence:** `components/export/mohw-export-panel.tsx`, `lib/domain/mohw-export-candidates.ts`, `gas/src/modules/ExportModule.gs`.
- **Added on:** 2026-10-28

## Lesson: Desk visitor pick list supports inline edit

- **Trigger:** While selecting 民政／社政 visitors for paper KEY, names/phones/groups were wrong with no fix path except leaving the page.
- **Cause:** Desk UI only had create + checkbox; `visitors.update` existed in GAS unused by this screen.
- **Rule:** Each row has「編輯」→ form (name/phone/group/id/email) → `POST /api/manager/care-forms/visitors` `action:update`. Keep selection/primary; moving civil↔social relocates the checkbox. Bump GAS `ReadCache` on create/update. Do not edit badge/status here.
- **Evidence:** `components/manage/care-form-desk-panel.tsx`, `app/api/manager/care-forms/visitors/route.ts`, `gas/src/modules/VisitorModule.gs`.
- **Added on:** 2026-10-28

## Lesson: Desk quick KEY — one-paper 未遇／住址不詳 with triple note

- **Trigger:** Paper KEY staff need one-tap for 未遇 and 住址不詳 without creating three papers.
- **Cause:** Old U2 expand-missed always spawned D-2／D-1 papers after first 未遇 submit.
- **Rule:** Top desk quick buttons「一鍵未遇」「一鍵住址不詳」: require date+start; write note `D-2 09:00；D-1 14:00；D+start` via `buildDeskOnePaperMissedNote` into **`living_address_other`（居住-其他說明）** and `visit_notes`（補充紀錄）; also set `living_address_type=查無此人`（該類型下其他說明必填）. Submit one paper (`visitResult=未遇`, 住址不詳 sets `visit_status=住址不詳`); `skipMissedExpand` + `closeAsMissedTriple`; advance continuous KEY. Manual 未遇 checkbox can still expand three papers. 「一鍵拒訪」: date+start; `visitResult=拒訪` / `visit_status=拒絕訪視`; fixed note `紙本拒訪`; **keep** on-screen 民政／社政訪查人; one paper + next. 「Pass（下次再 KEY）」: **不送出**；batch 標 `skipped`、進下一筆；清單顯示「下次再 KEY／補 KEY」，進表時 `revive` 回 `ready`。
- **Evidence:** `lib/domain/desk-care-batch.ts`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-28

## Lesson: Desk clerks KEY all villages (no village-admin scope)

- **Trigger:** TEMP staff need to KEY paper forms across villages; some names matched 里責任 and got a narrow village list, others got `mode: none` and could not select.
- **Cause:** `resolveDeskScope` only gave `mode: all` to workspace_owner/manager; desk_clerk fell through to person/org matching.
- **Rule:** `roleKey === "desk_clerk"` → `mode: "all"`（臨時登打（全部里））. Do not tie TEMP KEY to 里責任分配.
- **Evidence:** `lib/domain/village-admins.ts` `resolveDeskScope`.
- **Added on:** 2026-10-28

## Lesson: Append more TEMP clerks without resetting 01–20

- **Trigger:** Already issued TEMP-01～20 but need more staff mid-campaign.
- **Cause:**「重新產生」always rewrites TEMP-01～N passcodes; there was no append path.
- **Rule:** Use `action: append` /「增開並下載」— starts after max existing index (e.g. TEMP-21), leaves old codes intact, auto CSV. Cap TEMP-99. Do not tell managers to regenerate when they only need more seats.
- **Evidence:** `appendDeskClerks` in `lib/domain/desk-clerks.ts`, `components/workspace/desk-clerks-panel.tsx`.
- **Added on:** 2026-10-28

## Lesson: Desk clerk passcodes are one-shot; use regenerate + multi-select status

- **Trigger:** Manager lost the TEMP passcode CSV; also needed to re-enable many clerks after disable-all without clicking one-by-one.
- **Cause:** Passcodes are hashed at create time and never readable again. Status UI only had per-row toggles.
- **Rule:** Tell managers: cannot recover old codes—press「重新產生並下載」(auto CSV). Preserve `display_name` on upsert. Add checkbox multi-select + `deskClerks.setStatusBatch` for bulk active/disabled, plus「全部啟用」.
- **Evidence:** `components/workspace/desk-clerks-panel.tsx`, `app/api/manager/desk-clerks/route.ts`, `gas/src/modules/DeskClerkModule.gs`.
- **Added on:** 2026-10-28

## Lesson: Desk clerk self-serve Chinese display name

- **Trigger:** Temp KEY staff need their real Chinese name on welcome + left sidebar for piece-rate accountability.
- **Cause:** Login only stored `TEMP-xx` as `demo_name` until a name was saved.
- **Rule:** First login with empty `display_name` → `/temp-key/profile` to enter Chinese name; persist via `deskClerks.setStatus` + cookies. Block `/desk/care-forms` while name is missing or still `TEMP-xx`. AppShell welcome banner + sidebar/bottom「更多」show `demo_name` for `desk_clerk`.
- **Evidence:** `app/temp-key/profile/page.tsx`, `components/auth/desk-clerk-profile-panel.tsx`, `app/api/auth/desk-clerk/profile/route.ts`, `app/desk/care-forms/page.tsx`, `components/layout/app-shell.tsx`.
- **Added on:** 2026-10-27

## Lesson: Temporary desk clerks for paper KEY piece-rate

- **Trigger:** Need ~20 temp staff to KEY hundreds of paper care forms via `/yonghe`, then pay by piece and shut accounts when the campaign ends.
- **Cause:** Old shared `DESK_SHARED_PASSCODE` logged everyone in as one identity, so piece-rate attribution was impossible.
- **Rule:** Disable shared passcode. Issue `TEMP-01`…`TEMP-20` from 使用者→臨時登打（passcodes shown once). Role `desk_clerk` only sees 關懷表建檔. Each successful careform submit writes `紙本登打紀錄`; `counts_as_piece=1` except additional 未遇 papers for the same `case_id` count 0. Support manual disable + `valid_until` auto-block. Deploy GAS `DeskClerkModule` before using the UI. Keep logins split: `/yonghe` = manager Gmail only; `/temp-key` = TEMP clerks only (not under `/yonghe`, so temps do not open the manager page by mistake). Legacy `/yonghe/desk` redirects to `/temp-key`.
- **Evidence:** `gas/src/modules/DeskClerkModule.gs`, `lib/domain/desk-clerks.ts`, `app/api/auth/desk-clerk/route.ts`, `components/workspace/desk-clerks-panel.tsx`, `components/auth/manager-login-panel.tsx`, `components/auth/desk-clerk-login-panel.tsx`, `app/temp-key/page.tsx`.
- **Added on:** 2026-10-27

## Lesson: Desk continuous KEY uses per-case 1／5／10 duration chain

- **Trigger:** Paper KEY staff should not pre-assign every case end time; duration varies per paper.
- **Cause:** Old flow required batch end + `buildStaggeredVisitWindows` /「套用整批時段」before entering forms.
- **Rule:** Batch UI only stores visit date + first start. Care form desk shows duration chips 1／5／10 → end = start + N (end still editable). On submit, `chainDeskBatchAfterKeyed` writes keyed times and sets next ready start = end + `DESK_BATCH_TRAVEL_GAP_MINUTES` (5). Keep single-case「先填時間」modal. Do not change 未遇 D-2/D-1/D windows. `mergeDeskSeededVisitTimes`: start-only seed clears end so chips are required.
- **Evidence:** `lib/domain/desk-care-batch.ts`, `components/manage/care-form-desk-panel.tsx`, `components/visitor/visit-dialogue-form.tsx`, `lib/domain/mohw-desk-form-defaults.ts`.
- **Added on:** 2026-10-27

## Lesson: Desk batch KEY times must beat clock「當下」

- **Trigger:** 「套用整批時段」preview shows 09:00–09:10… but list stays「尚未套用時間」, or care form shows now instead of batch slot.
- **Cause:** (1) Stale `sessionStorage` ASG → `assignments.confirm` NOT_FOUND, local queue never updated. (2) `createMohwDeskInitialAnswers` / draft restore preferred `getDeskNowVisitClock()` over URL `date/start/end`.
- **Rule:** Continuous KEY seeds date/start into queue then opens form with query params. Form init + draft restore: `mergeDeskSeededVisitTimes` so URL/batch wins; never overwrite seeded times with clock. Stale ASG → `ASSIGNMENT_NOT_FOUND` + clear queue.
- **Evidence:** `components/manage/care-form-desk-panel.tsx`, `components/visitor/visit-dialogue-form.tsx`, `lib/domain/mohw-desk-form-defaults.ts`.
- **Added on:** 2026-10-27

## Lesson: Fresh desk KEY queue must not auto-clear on Sheets lag

- **Trigger:** After sheet wipe, user re-prepares → sees「已自動清除失效待 KEY 清單（曾見 ASG-…）」and cannot continue KEY even with cases re-selected.
- **Cause:** (1) `prepare` used `Promise.all` dispatch; concurrent GAS `appendRow` can return ASG ids whose rows never land. (2) Mount / apply `assignment-status` probe treated a single missing read as stale and wiped a brand-new `sessionStorage` queue.
- **Rule:** Prepare sequentially and verify each ASG with `assignments.get` before returning. Status endpoint retries missing ids once. Skip mount clear when `updatedAt` is within `DESK_BATCH_FRESH_MS` (2 min); apply/enter-form retry once for fresh batches. Before wipe, re-read sessionStorage so a newer prepare is not cleared by an in-flight stale probe. Deploy GAS lock+flush on `assignments.dispatch` when shipping that side.
- **Evidence:** `app/api/manager/care-forms/prepare/route.ts`, `assignment-status/route.ts`, `components/manage/care-form-desk-panel.tsx`, `lib/domain/desk-care-batch.ts`, `gas/src/modules/AssignmentModule.gs`.
- **Added on:** 2026-10-27

## Lesson: Desk 里別 codes come from Excel「里別 編碼」, not only 里責任分配

- **Trigger:** 關懷表建檔里別下拉部分里只有里名（中溪／中興／光明…），且未依六碼升冪。
- **Cause:** `villageCodeByName` 只掃 `里責任分配`；未指定 7 里匯入時 `village_code` 空白。Identity villages 又用里名 `localeCompare` 排序。
- **Rule:** Static map `lib/domain/yonghe-village-codes.ts` from `75歲以上待訪(線上).xlsx`「里別 編碼」(62 里). `mergeYongheVillageCodeByName` fills gaps; `sortYongheVillagesByCode` ascending; `formatYongheVillageSelectLabel` falls back to the map. Keep `value` as village name. Bump identities cache key (v5) when payload/sort changes. Do not invent codes.
- **Evidence:** `lib/domain/yonghe-village-codes.ts`, `lib/domain/village-admins.ts`, `app/api/manager/care-forms/options/route.ts`, `components/manage/care-form-desk-panel.tsx`.
- **Added on:** 2026-10-27

## Lesson: Desk 里別 select labels put code first for digit typeahead

- **Trigger:** 關懷表建檔「1. 選擇身份與里別」里別下拉只有里名，承辦要對紙本六碼時不好打字找里。
- **Cause:** `identityOptions.villages` 只有 name；`<option>` 顯示與 `value` 相同，且 native select typeahead 從字首比對，里名在前時無法用數字定位。
- **Rule:** Keep `value` as village **name** (case load / filters). Display with `formatYongheVillageSelectLabel` → `040045（新廍里）` (same paper shape as `formatDeskCasePaperLabel`). Join codes from identities payload `villageCodeByName` (Excel map + village_admins). Bump identities cache key when payload shape changes.
- **Evidence:** `lib/domain/village-admins.ts`, `app/api/manager/care-forms/options/route.ts`, `components/manage/care-form-desk-panel.tsx`.
- **Added on:** 2026-10-27

## Lesson: Desk 待 KEY stuck on `Assignment not found: ASG-…`

- **Trigger:** 關懷表建檔 modal「通過稽核並儲存時段」shows red `Assignment not found: ASG-a35128c2`; batch still「尚未套用時間」after restore.
- **Cause:** 待 KEY 清單 lives in browser `sessionStorage` (`elder-desk-care-batch-v1`). Confirm calls GAS `assignments.confirm` → `SheetHelper.updateByKey(派案紀錄)`. If that row was deleted (清測資 / re-init / spreadsheet switch) or the tab restored an old queue, the ASG id is valid-looking but missing. Not an ID-format bug; prepare still mints `ASG-` + 8 hex.
- **Rule:** Treat as stale client queue. On mount / apply / confirm / enter-form: probe `assignment-status`; if ANY ASG missing → `clearDeskBatchState` + `setBatch(null)` (unlock steps 1–3) + message「已自動清除失效待 KEY 清單…」+ CTA「重新準備派案（已解鎖）」. Never tell user to hunt「清空清單」after auto-clear already ran. Write staggered slots into sessionStorage only after confirm-time-batch succeeds.
- **Evidence:** `gas/src/modules/AssignmentModule.gs` `confirm`, `app/api/manager/care-forms/assignment-status/route.ts`, `confirm-time/route.ts`, `components/manage/care-form-desk-panel.tsx`, `lib/domain/desk-care-batch.ts`.
- **Added on:** 2026-10-27

## Lesson: Worker phone `9123456789` needs display+state leading-0 repair

- **Trigger:** Visitor「民政訪查人-電話」showed `9123456789` with red「請填含前導 0」even after domain normalize helpers were added.
- **Cause:** (1) Old `normalizeIndoorPhone` only fixed 9-digit `9xxxxxxxx`, not Sheets-eaten 10-digit `9123456789`. (2) `normalizeVisitorCareAnswers` skipped non-string phones. (3) Seed ran only for `formDefaults=desk`, so roster self-fill skipped. (4) Bad localStorage drafts under `desk_defaults_v3` could reload the bare number into UI state; validation could still fail while the input showed the raw value.
- **Rule:** Treat `9`+9 digits like mobile missing `0` (`→0912345678`). Coerce number phones in `normalizeVisitorCareAnswers`. Seed 社政／民政 from `selectedVisitor` for visitor login too. Bump care-form draft key when phone rules change. Phone inputs must display `normalizeIndoorPhone` and write the repaired value back into answers (layout effect / onChange), not only validate after export.
- **Evidence:** `lib/domain/phone.ts`, `lib/domain/mohw-life-care-export.ts`, `components/visitor/visit-dialogue-form.tsx` (`civil_worker_phone` / `social_worker_phone`).
- **Added on:** 2026-10-26

## Lesson: Visitor care form needs visitorDirectory for 社政／民政 search-fill

- **Trigger:** Logged-in visitor typing partial name in「社政訪查人-姓名」got validation for empty phone/date; expected search of 已建檔訪查員.
- **Cause:** `WorkerNamePicker` already existed for both 社政／民政 name fields, but only renders when `visitorDirectory?.length`. Manager desk passed the directory; `/visitor/visits/[schedule_id]` did not. Slim `visitors.list` also omitted `id_number`, so pick could not fill 身分證.
- **Rule:** Pass `visitorDirectory` (slim list + `mapDeskVisitor`) on visitor visit pages too. Keep slim payload with `id_number` + phone. On pick, merge via `applyVisitorToWorkerAnswers(current, …)` so `visit_date` seeds worker date; normalize phone with `normalizeTaiwanMobilePhone` / `normalizeIndoorPhone`.
- **Evidence:** `app/visitor/visits/[schedule_id]/page.tsx`, `components/visitor/visit-dialogue-form.tsx` (`WorkerNamePicker`), `gas/src/modules/VisitorModule.gs` slim2.
- **Added on:** 2026-10-26

## Lesson: Yonghe village codes are 040xxx (not left-padded 00xxxx)

- **Trigger:** Quick KEY showed 0 cases for input `004001` even though the village still had pending cases under `040001`.
- **Cause:** `formatYongheVillageCode` treated any 6-digit string as final, so typos like left-padded seq (`000051`) or transposed prefix (`004001`) never matched roster/`village_code` (`040xxx`).
- **Rule:** Normalize Yonghe codes to district prefix `040` + 3-digit village seq. Rewrite `00xxxx` six-digit mistakes to `040` + last three digits. Pending list excludes only `已完成`／`不訪`; visitor ownership does not hide rows (blocked cases still listed).
- **Evidence:** `lib/domain/village-admins.ts` (`formatYongheVillageCode`), `app/api/manager/care-forms/quick-pending/route.ts`.
- **Added on:** 2026-10-26

## Lesson: Quick KEY uses village code + pending list on one page

- **Trigger:** Field visitors need fast multi-case KEY; unregistered staff need on-site create then KEY.
- **Cause:** Full desk batch wizard is heavy; visitor tasks assume cases already assigned.
- **Rule:** `/visitor/quick-key` locks the logged-in visitor; `/desk/quick-key` allows search or desk_minimal create. Enter 6-digit `village_code`, load pending by `village_seq`, tap 確認 to dispatch (`訪員自領・實訪`) and open the care form; return to the same list for the next case. No separate「今日路線」page.
- **Evidence:** `components/manage/quick-key-panel.tsx`, `app/api/manager/care-forms/quick-pending/route.ts`, `app/api/visitor/quick-confirm/route.ts`.
- **Added on:** 2026-10-26

## Lesson: Desk continuous KEY + 未遇 U2 three papers

- **Trigger:** Paper KEY staff need start-continuous → first form, then auto-advance; 未遇 must become three dated papers (早／中／晚), not one form with three attempts.
- **Cause:** Old batch apply only wrote times and stayed on the list; desk 未遇 still asked for 3 slots on one paper.
- **Rule:** After「開始連續 KEY」, navigate to first ready with date+start. After desk submit, `chainDeskBatchAfterKeyed` then open next ready (or list + `batchDone=1`). On 未遇 submit: treat current as D 晚（第 3 次）, `POST expand-missed` creates D-2 早／D-1 中 with `allow_multi_active`, insert as ready before continuing; skip if case already has ≥3 desk papers. Desk 未遇 needs ≥1 MissedVisitTimeSlot (早→上午、中→中午、晚→夜間). Order desk `visitAttempt` by `due_date` when notes are 公所代填.
- **Evidence:** `lib/domain/desk-care-batch.ts`, `app/api/manager/care-forms/expand-missed/route.ts`, `components/manage/care-form-desk-panel.tsx`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-27

## Lesson: Desk batch KEY times use slot + 5-min travel gap

- **Trigger:** Paper KEY staff need auto-spaced visit windows between cases, not back-to-back slots.
- **Cause:** First stagger used start-to-start +10 with 10-min duration (adjacent, no travel buffer).
- **Rule:** Between cases add travel gap 5 minutes (`DESK_BATCH_TRAVEL_GAP_MINUTES`). Duration is chosen per case (1／5／10) in the care form; next start = previous end + 5. Example: 09:00–09:10 → next 09:15… Clock／快速 KEY 後備仍可用 `DESK_BATCH_SLOT_MINUTES` (10).
- **Evidence:** `lib/domain/desk-care-batch.ts` (`chainDeskBatchAfterKeyed`, `DESK_BATCH_TRAVEL_GAP_MINUTES`), `components/manage/care-form-desk-panel.tsx`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-26

## Lesson: Desk care-form defaults favor paper KEY safety values

- **Trigger:** Bulk paper KEY needed gender/birth from roster, 02/09 phone prefixes, and “none” questionnaire defaults.
- **Cause:** Old desk defaults copied the MOHW sample row (diseases present, medical yes, living address unknown).
- **Rule:** Desk init uses `createMohwDeskInitialAnswers`: gender from national-id digit 2, birth as ROC `yyy/MM/dd`, phone=`02` / mobile=`09` (blank→`0000000000`, refuse→`9999999999` on submit), living same as household, diseases/safety=`以上均無` with exclusive UI, medical/hearing/difficulties/worries/services = 否／無. Keep other sample fields until further product change.
- **Evidence:** `lib/domain/mohw-desk-form-defaults.ts`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-26

## Lesson: Desk case list follows Excel 里編號 (village_seq)

- **Trigger:** Paper KEY staff need the on-screen case list to match the village booklet order.
- **Cause:** Import stored global `編號` as `external_id`; per-village `里編號` was not persisted, so other villages would show wrong paper numbers if we displayed `external_id`.
- **Rule:** Persist Excel `里編號` as `village_seq`. Desk step-3 sorts by `village_seq` and shows `#N` before the name. Keep `external_id` as the workbook-wide `編號`.
- **Evidence:** `gas/src/modules/CaseModule.gs`, `lib/domain/manager-care-form-desk.ts`, `components/manage/care-form-desk-panel.tsx`, `scripts/import-village-desk-p0.mjs`.
- **Added on:** 2026-10-26

## Lesson: KEY UIs show paper对照 before system case code

- **Trigger:** Paper batch KEY and visitor self KEY both need on-screen labels that match the village booklet (里編碼＋里別＋里民序), not EV-/encoded_id first.
- **Cause:** Lists and form headers led with `caseCode` (encoded_id); `#N` alone was incomplete for paper对照.
- **Rule:** Use shared `formatDeskCasePaperLabel(...)` so primary is like `040051（上林里）#12 王小明` and system code is muted secondary. Apply on desk case checkboxes, 待 KEY queue, time modal, quick-key pending rows, visitor task card, and care-form KEY headers. Do not change encoded_id generation or export column order.
- **Evidence:** `lib/domain/manager-care-form-desk.ts`, `components/manage/care-form-desk-panel.tsx`, `components/manage/quick-key-panel.tsx`, `components/visitor/task-card.tsx`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-27

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

## Lesson: Excel 兩碼民國生日不可原樣寫入 Sheets

- **Trigger:** 關懷表顯示出生 `113/01/01`（西元 2024），與名冊長者不符。
- **Cause:** 來源 Excel 為民國兩碼 `24/01/01`；寫入 Google Sheets 後被當成西元兩碼年窗（00–29→20xx），讀回 ISO `2024-01-01` 再轉民國變成 113。
- **Rule:** 匯入前一律 `normalizeTaiwanBirthToRocText` 成 `yyy/MM/dd`；GAS `importBatch` 同樣正規化並將 `birth_date` 欄設為文字格式 `@`。修復用 `scripts/repair-case-birth-dates-from-xlsx.mjs`。
- **Evidence:** `lib/domain/taiwan-birth-date.ts`, `gas/src/modules/CaseModule.gs`, `scripts/import-village-desk-p0.mjs`
- **Added on:** 2026-10-27


## Lesson: Visitor KEY auto-shifts overlapping visit windows; desk stays strict

- **Trigger:** 訪查員 quick KEY / field_self forms seed “now +10m” (or clock) times that often overlap other same-day cases for the same visitor; a blocking conflict modal strand them.
- **Cause:** Desk `confirm-time` / batch audit correctly forbids overlap for 核銷, but visitor path had no confirm-time gate and no auto-resolve.
- **Rule:** Reuse the same overlap detection (`findOverlappingWindow` / `auditDeskVisitTime`). For **visitor** KEY only: `resolveNonOverlappingVisitSlot` + `auditDeskVisitTimeAutoResolve` shift the **current** case forward by duration + `DESK_BATCH_TRAVEL_GAP_MINUTES` (5), or next day `09:00` if past 24:00; persist via `/api/visitor/confirm-time` and soft-notice「時段與其他案衝突，已自動調整為 HH:mm–HH:mm」. Desk/manager paper KEY keeps strict 409 + blocking modal.
- **Evidence:** `lib/domain/desk-care-batch.ts`, `lib/domain/desk-visit-time-audit.ts`, `app/api/visitor/confirm-time/route.ts`, `components/visitor/visit-dialogue-form.tsx`.
- **Added on:** 2026-10-27

## Lesson: Desk care forms batch KEY with sticky visit team and time audit

- **Trigger:** Paper bulk KEY needs the same civil/social visit team across many cases without re-picking, and overlapping times break reimbursement.
- **Cause:** Old desk UI was single-case → single-visitor → immediate form; times were not audited across the team.
- **Rule:** Flow is identity/village → pick 民政/社政 visitors (at least one side; multi per side) + manual primary → multi-select cases → prepare many assignments → queue → apply batch times (then enter first) → continuous KEY with sessionStorage queue. Store companions/time in assignment `notes` (`公所代填・紙本｜主填:…｜同行:…｜時段:…`). Only 未遇 requires three sequential papers (U2 auto-creates the other two); completed/refused do not.
- **Evidence:** `components/manage/care-form-desk-panel.tsx`, `lib/domain/desk-care-batch.ts`, `lib/domain/desk-visit-time-audit.ts`, `app/api/manager/care-forms/prepare/route.ts`, `app/api/manager/care-forms/confirm-time/route.ts`, `app/api/manager/care-forms/expand-missed/route.ts`.
- **Added on:** 2026-10-26

## Lesson: Manager desk care forms reuse the visitor submit path

- **Trigger:** Office staff key paper care forms and must attach them to a visitor without a new export pipeline.
- **Cause:** Creating a separate desk table would drift from the 102-column gold export.
- **Rule:** Desk flow creates or reuses a case, dispatches `公所代填・紙本` to the chosen visitor, then submits through `careform.submit`. After status is submitted, the visitor page is read-only. Do not skip audit or invent a second MOHW path. `cases.create` must be deployed with GAS before live desk-create works. Current phase: **one paper = one visit**; each desk prepare creates assignment(s) with `allow_multi_active`. Three 未遇 papers KEY’d in sequence = three visit attempts = complete—do **not** pack three attempts into one form. Field visitor self-KEY still keeps unique active assignment.
- **Evidence:** `app/manager/care-forms/`, `app/api/manager/care-forms/prepare/route.ts`, `gas/src/modules/AssignmentModule.gs`, `gas/src/modules/CaseModule.gs`.
- **Added on:** 2026-10-24（紙本一張一次／2026-10-25；批次訪查組／2026-10-26）

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
- **Rule:** Approved-visitor correction may update name, mobile, headshot, 民政/社政 (`workerGroup`), and department（含「其他」）. Do not expose generic sheet updates. Keep old Drive photos. Sync 訪查員主檔 `volunteer_group`, 註冊 `profile_json`, and login display name together; rebuild display name when unit fields change.
- **Evidence:** `components/workspace/visitor-correction-dialog.tsx`, `gas/src/modules/UserAccountModule.gs` `patchApprovedVisitor`.
- **Added on:** 2026-10-22（單位／民政社政：2026-10-26）

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
