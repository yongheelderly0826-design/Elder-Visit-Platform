# Task Brief: 同案關懷表時段衝突防呆

## 繁體中文說明

這份文件用來在任務開始前先把方向講清楚，避免還沒定義目標就直接進入開發。
請先補完目標、範圍、風險、驗收條件，再決定哪些 Agent 需要參與。

## Goal

未遇關懷表之後若再新增／KEY 第二張（含成功），輸入訪視時間時即比對同案其他關懷表；日期＋起迄相同或重疊時立刻提醒並阻擋確認／送出，避免兩張表撞同一時段。

## Scope

### In scope

- 同案（同 `case_id`）eligible 關懷表／派案 notes 時段比對（**不要求同訪查員**）
- Desk `confirm-time`／批次、訪員 `confirm-time`：輸入／確認時阻擋
- 訪員 KEY：**同案衝突不自動順延**，改硬擋＋提示
- GAS `careform.submit` 後備檢查
- 衝突文案清楚標「同案另一張關懷表」

### Out of scope

- 異人兩邊都發費用引擎
- 未遇三次戳記與成功表起迄的細比（本期只比表頭 visit_date／start／end）
- 自動作廢舊未遇表

## Relevant References

- Product policy discussion（未遇後可再 KEY 成功；兩張時間不可相同）
- `lib/domain/desk-visit-time-audit.ts`、`lib/domain/desk-care-batch.ts`
- `LESSONS.md` 同訪查員時段衝突／未遇戳記

## Likely Files

- `lib/domain/desk-care-batch.ts`
- `lib/domain/desk-visit-time-audit.ts`
- `lib/gas-client.ts`
- `gas/src/modules/CareFormModule.gs`、`gas/src/ApiRouter.gs`
- `app/api/manager/care-forms/confirm-time*.ts`、`app/api/visitor/confirm-time/route.ts`
- `components/manage/care-form-desk-panel.tsx`（衝突 modal 文案）
- `components/visitor/visit-dialogue-form.tsx`（錯誤提示）

## Risks / Ambiguities

- 既有 `windowsOverlap` 要求訪查員 ID 交集 → 同案異人會漏；需「只比時間」函式
- 同人 reuse 覆寫原表：必須 exclude 本 assignment／careform，避免自己擋自己
- 需部署 GAS 後 submit 後備才生效；Next 端 confirm-time 可先上

## User-Facing Impact

- Visible UI impact expected（衝突提示／阻擋）

## Workstreams

| Owner | Task | Write Scope | Expected Output |
| --- | --- | --- | --- |
| Planner / Lead | Frame goal, scope, risks, and acceptance criteria | Planning docs | Approved task brief |
| Builder | Implement same-case time guard | domain + API + GAS + copy | Working change |
| Design / UX Agent | Review conflict copy clarity | Visible UI only | Design review notes / corrections |
| Reviewer / QA | Edge: same visitor reuse, different visitor, adjacent slots | Diff + smoke | Review findings |
| Release / Ops | GAS clasp deploy for submit guard | Release path | Deploy note |

## Acceptance Criteria

- 同案已有表使用 D 日 T1–T2，第二張填相同或重疊時段 → confirm-time／送出失敗並提示「同案」
- 不同日相同鐘點 → 不擋
- 緊接相鄰（上案結束＝下案開始）→ 不擋
- 編輯／reuse 同一張表 → 不因自己的時段擋自己
- 同訪查員跨案衝突行為不變；同案衝突不走訪員自動順延

## Verification

- [x] `npm run typecheck`
- [x] `npm run lint`（0 errors；既有 warnings）
- [x] smoke：同案時間重疊偵測（`scripts/same-case-visit-time-smoke.ts`）
- [x] Design / UX review completed（衝突文案：同案紅底 alert／desk modal）

## Lessons to Capture

- 同案第二張表：時段防呆必須忽略訪查員 ID 交集；與「同組訪查員跨案不可重疊」分開判斷。

## Completion Notes

- What changed: 同案時段衝突偵測（忽略訪查員）、confirm-time／表內提示＋阻擋、GAS submit 後備、desk modal 文案。
- What was verified: `same-case-visit-time-smoke`；`npm run typecheck`；`npm run lint`（既有 warnings）。
- What remains undecided: 費用「異人兩邊都發」未做；需 `bash scripts/deploy-gas.sh` 後 submit 後備才上線。
- Live deployment: Next 可先上；GAS 需另 deploy。
