# Task Brief: Temporary public passbook submission

## 繁體中文說明

這份文件用來在任務開始前先把方向講清楚，避免還沒定義目標就直接進入開發。
請先補完目標、範圍、風險、驗收條件，再決定哪些 Agent 需要參與。

> **狀態**：決策已鎖定（2026-11-22）；MVP 已實作。GAS 已 `deploy-gas`；Next 需本機／Vercel 部署後才有公開頁。

## Goal

提供一個**暫時、可分享的公開網址**，讓已建檔但尚未登入／不會用系統的訪查員或志工，補齊車馬費匯款所需的**帳戶名稱、帳戶號碼、銀行名稱／代碼、存摺照片**；身分以姓名＋身分證＋手機末四碼核對後再填寫，承辦可在後台／Sheets 審核。

## Locked decisions（2026-11-22）

| # | 議題 | 決策 |
| --- | --- | --- |
| 1 | 截止日 | **2026-12-30** 台北時間（Asia/Taipei）當日結束後通道關閉 |
| 2 | 活動碼 | **共用活動碼** OK（不做每人 magic link） |
| 3 | 第三因子 | **手機末四碼**（對主檔／註冊手機）；不用生日 |
| 4 | 帳戶號碼 | Sheets **存完整帳號**＋存摺照片（照片供複核） |
| 5 | 對象 | **已核准** 與 **待審** 訪查員主檔列（含出勤志工／待審人口，以姓名＋身分證＋手機末四碼匹配）；停用／駁回不可 |
| 6 | 銀行 | **銀行名稱／代碼必填**，autocomplete／auto-match（台灣銀行代碼靜態表） |
| 7 | 雙寫 | MVP **Sheets 為準**；不強制 sync Supabase `visitor_profiles` |
| 8 | 退回通知 | MVP 僅後台／Sheets 狀態，人工通知 |
| 9 | TEMP／desk_clerk | **不可**審核存摺補件 |

## 現況對齊（探索結論）

| 現有能力 | 位置 | 與本需求關係 |
| --- | --- | --- |
| 已登入訪員補匯款＋存摺 | `/visitor/profile` → `PATCH /api/visitor/profile` | 正式路徑；本任務是給**不會登入**的人用的暫時公開補件；**不可破壞** |
| 存摺壓縮上傳 | `components/visitor/visitor-profile-panel.tsx`（黑白 JPEG） | 抽出 `lib/client/passbook-image.ts` 重用 |
| 證件照 Drive | GAS `_訪員註冊證件照` | 公開補件照片仿此建 `_訪員存摺補件` |
| 公開／弱驗證入口 | `/register`、`/volunteer/clock`、`/badge/claim/[token]` | 參考 token／身分核對＋短時 cookie |
| `/yonghe` | 承辦 Gmail 登入 | **不適合**當公開補件路徑 |

## Recommended URL

**`/volunteer/passbook`**（可選：`/volunteer/passbook/[code]` 或 `?k=`）

首頁／註冊頁**不要**放明顯入口；由承辦用 LINE／簡訊發連結。

## Auth model

1. 活動碼（路徑／query／表單）＋截止日（`PASSBOOK_DEADLINE=2026-12-30`）
2. 身分核對：姓名＋身分證＋手機末四碼；失敗訊息一律泛化
3. 核對成功 → HttpOnly cookie（約 20 分，綁 visitor_id）
4. 填帳戶＋上傳存摺 → 寫入 `存摺補件`（待審）
5. 速率限制／泛化錯誤，避免身分證枚舉

## Data model

**`存摺補件`**：submission_id、visitor_id、name_snapshot、id_masked、account_name、account_number、bank_name、bank_code、passbook_drive_url、status（待審／已確認／退回）、submitted_at、reviewed_at、reviewed_by、review_note、source=`public_passbook`、campaign_code

**確認後回寫** `訪查員主檔.bank_account`（及 bank_name／bank_code／bank_account_name 若欄位存在）。

## Acceptance Criteria

- [x] 持有有效活動碼的人，可用身分核對後送出戶名、完整帳號、銀行、存摺照片，並在 `存摺補件` 看到「待審」
- [x] 無碼／過期／核對失敗者無法進入填寫或上傳
- [x] 存摺壓縮後進 Drive；Sheets 無巨大 data URL
- [x] 承辦（owner／manager）可確認回寫主檔；退回不覆寫；TEMP／desk_clerk 不可審
- [x] `/visitor/profile` 行為不變
- [x] 手機直向可完成；文案繁中、訪查員用語
- [x] `npm run typecheck` / lint（build 未強制）
- [x] GAS `deploy-gas` 已推上（Next 正式站另部）

## Likely Files

- `app/volunteer/passbook/page.tsx`、`[code]/page.tsx`
- `components/volunteer/passbook-submit-panel.tsx`
- `lib/client/passbook-image.ts`、`lib/domain/taiwan-banks.ts`
- `app/api/volunteer/passbook/{verify,submit,me}/route.ts`
- `app/api/manager/passbook-submissions/route.ts`
- `app/manager/passbook/page.tsx`（最小審核清單）
- `gas/src/modules/PassbookModule.gs`＋Config／SheetHelper／ApiRouter
- `lib/gas-client.ts`、`docs/sheets/schema-overview.md`

## Settings

- Env 或 `_設定`／Script Properties：`PASSBOOK_CAMPAIGN_CODE`、`PASSBOOK_DEADLINE=2026-12-30`
- Next 亦可設同名 env；GAS 為權威驗證來源之一

## Risks

- 公開通道被轉傳後的濫用／枚舉 → 活動碼＋截止日＋泛化錯誤＋失敗次數限制
- 完整帳號敏感性 → 佇列表＋Drive 私有、確認後才回寫主檔
- 「暫時」若未關截止日會變永久暴露面 → 已鎖定 2026-12-30

## Product Language

- 文案用「訪查員」；關懷／平穩語氣
- 存摺為「匯款確認用」
- 不向一般使用者顯示 Supabase／GAS／API 名稱

## Lessons to Capture

- 公開補件通道必須有活動碼＋截止日；敏感匯款附件不可給 TEMP 審核。
- 存摺補件用獨立佇列表，確認後才回寫主檔。
- `/yonghe` 不放公開表單。
- 第三因子用手機末四碼（主檔無生日）。

## Completion Notes

- What changed:
  - 公開頁 `/volunteer/passbook`（及 `/[code]`、`/passbook` 別名）
  - API：verify／me／submit；承辦 `/manager/passbook`＋review API（owner／manager only）
  - GAS `PassbookModule`：`存摺補件`、Drive `_訪員存摺補件`、確認回寫主檔
  - 台灣銀行代碼 autocomplete、存摺壓縮共用 helper
- What was verified:
  - `npm run typecheck` 通過
  - `bash scripts/deploy-gas.sh` 成功（PassbookModule 已推上）
  - 本機未 commit／未 push
- Remaining gaps:
  - 需在 GAS `_設定` 或 Script Properties 設 `PASSBOOK_CAMPAIGN_CODE`（及確認 `PASSBOOK_DEADLINE=2026-12-30`）
  - Next `.env`／Vercel 建議同步 `PASSBOOK_CAMPAIGN_CODE`、`PASSBOOK_DEADLINE`（可選；GAS 為權威）
  - Next 前端尚未 push／部署到正式站
  - `npm run lint`／`build` 視時間補跑；未做 OCR／magic link／自動通知
  - 首次使用會自動建 `存摺補件` sheet；亦可手動跑 `initSpreadsheet`
