# Task Brief: 里責關懷表獨立填表入口 P0

## Goal

讓里責任管理員／組織承辦用**獨立網址**登入後，只看到自己負責里的待訪個案，手動 KEY 紙本關懷表；總承辦可看全部並代管。  
P0 先靠 Excel 匯入建立「個案 + 里責任對照」，**不做**完整「里責任分配管理畫面」（列 P2）。

## Scope

### In scope（P0）

1. 匯入 `75歲以上待訪(線上).xlsx` → GAS `個案名冊`（約 6,901 筆）
2. 匯入 `每人分配里別.xlsx` → 新建 GAS `里責任分配`（可多人／org／skip）
3. 獨立填表入口 `/desk/care-forms`（書籤友善；登入後依身份過濾里）
4. 填表時：搜尋勾選實際填表訪查員，或最小可行「新增訪查員」後再填
5. 沿用既有 `prepare` → 關懷表送出 → 稽核 → 既有 MOHW 匯出路（P0 只保證資料進得了匯出佇列）

### Out of scope（P0 不做）

- 完整「里責任分配管理畫面」UI（P2）
- 組織帳號拆成多位個人登入的完整帳號中心
- 衛福部匯出「依里分批」專用 UI 強化（可列 P1）
- 改動既有證件列印／訪查員外勤填報主流程

## 獨立網址與導覽

| 項目 | 規格 |
|------|------|
| 公開入口 | `/desk/care-forms`（未登入 → `/yonghe?next=/desk/care-forms`） |
| 既有後台 | `/manager/care-forms` 保留給總承辦；可 redirect 或並存同一元件、不同 scope |
| 導覽 | 里責／組織身份登入後主選單顯示「關懷表建檔」指向 `/desk/care-forms` |
| 用語 | 使用者文案用「訪查員」；「里責任管理員」僅指 KEY 身份 |

## 身份對應（Identity）

### 資料表 `里責任分配`（GAS）

一里多列（聯合管理員）：

| key | 說明 |
|-----|------|
| `village_code` | 表上里碼（如 51）＋正規化 `040051` 若有對照 |
| `village_name` | 上林里 |
| `admin_display_name` | 謝詩／民政課／永和紳士協會… |
| `admin_kind` | `person` \| `org` \| `skip` |
| `admin_account_key` | 登入對應鍵：email 小寫，或 org slug（見下） |
| `status` | `active` \| `inactive` |
| `notes` | 可空 |

Excel `&` 拆成多列。  
`都更(不用訪)` → `admin_kind=skip`，該里**不進**待 KEY 佇列。

### Org slug（P0 固定）

| Excel 顯示名 | `admin_account_key` | `admin_kind` |
|--------------|---------------------|--------------|
| 民政課 | `org:civil-affairs` | org |
| 永和紳士協會 | `org:gentlemen` | org |
| 送餐組志工 | `org:meal-volunteers` | org |
| 都更(不用訪) | `org:urban-renewal-skip` | skip |

### 登入身份如何對到分配

P0 採「**白名單帳號 → 綁定 admin_account_key / 顯示名**」：

1. **總承辦／owner**（現有 Google 允許名單 + owner）：`scope=all`，可看全部里；可篩選某里／某組織代管。
2. **個人里責**：帳號 profile 上掛 `desk_admin_name`（或 email 對照表）= Excel 人名（謝詩）；匹配 `admin_display_name` 且 `kind=person`。
3. **組織帳號**：白名單 email 綁定一個 org slug（如紳士協會共用信箱 → `org:gentlemen`）；匹配該 org 負責的所有里。
4. 同一人若 Excel 有多里，登入後聯集所有里。
5. 匹配不到任何里：進入頁面顯示「尚未指派負責里，請聯絡總承辦」，不可 KEY。

> P0 實作可用：環境變數或 GAS `_設定`／小型「填表帳號對照」表  
> `email → admin_account_key | display_name | role_scope(all|villages|org)`  
> 第一波人工維護對照即可，不要求自助註冊。

## 組織帳號怎麼登入

| 方式 | P0 決定 |
|------|---------|
| 登入通道 | 與現況相同：`/yonghe` Google 管理者登入（或既有允許的 manager session） |
| 組織 | **一個組織一個（或少數）共用允許 Email**，登入後 session 帶 org slug |
| 個人里責 | 每人一個允許 Email，對到顯示名 |
| 不做 | P0 不做「組織內再選子帳號」；不做訪客免登入公開填表 |

上線前總承辦需提供：個人姓名 ↔ Email、組織 ↔ Email 清單，寫入對照後才能測。

## 未指定 7 里暫管規則

Excel 目前空白：`中溪里、中興里、光明里、協和里、忠義里、前溪里、勵行里`。

| 規則 | P0 |
|------|-----|
| 個案仍匯入 | 是（依戶籍里進名冊） |
| 一般里責／組織 | **看不到**這 7 里 |
| 總承辦 `scope=all` | 看得到；清單標「未指定責任」 |
| 暫管 | 預設掛 `org:civil-affairs`（民政課）為 **暫管**，`notes=未指定·P0暫管`；總承辦可改（P2 管理畫面） |
| KEY | 僅總承辦與民政課 org 帳號可 KEY 這 7 里（P0） |

`永成里`（都更不用訪）：個案可匯入但標記 `visit_status`／notes 為不訪；**所有填表身份預設佇列排除**；總承辦搜尋時可看到並標「不訪」。

## 填表流程（獨立頁）

1. 登入 → 解析負責里集合 `allowedVillages`
2. 列出該里、`待訪`（或尚未有已送出關懷表）個案；可搜姓名／地址／身分證末幾碼
3. 選個案 → **搜尋訪查員姓名帶入**（已核准優先）或 **新增訪查員（最小欄位：姓名、電話、Email 可選）**
4. 填訪視日／時段 → `prepare` → 進既有 manager desk 關懷表 UI
5. 送出後進稽核；訪查員端若看到該派案則維持唯讀（與現況 desk 一致）

## 匯入規格摘要

### 個案（`75歲以上待訪(線上).xlsx` / `75歲以上-6901人`）

- 鍵：身分證號去重；已存在則更新地址／里，不另開重複案
- 對應：姓名、出生、身分證、戶籍縣市區里、地址
- 預設：`visit_district=永和區`、`case_type=獨老`、`visit_status=待訪`
- 來源註記：`contact_note` 或等效欄位標 `75歲以上待訪(線上)·匯入`

### 里分配（`每人分配里別.xlsx` / `分配表`）

- 解析 D 欄 `&`／`＆` 為多管理員
- 寫入 `里責任分配`；重匯採 **合併策略**：同里同 admin_key 更新；P0 提供「全量覆寫」僅總承辦、需確認

## Likely Files

- `app/desk/care-forms/`（新入口）
- `components/manage/care-form-desk-panel.tsx`（加 scope／訪員搜尋新增）
- `app/api/manager/care-forms/options|prepare`
- `lib/domain/manager-care-form-desk.ts`、新 `lib/domain/village-admins.ts`
- `gas/src/modules/CaseModule.gs`、新 VillageAdmin 模組或設定表 API
- `lib/domain/navigation.ts`、auth／session 擴充（desk scope）
- 匯入 script 或 `/manager/import` 擴充

## Risks / Ambiguities

- 人名與系統帳號對不到 → 必須先收 Email 對照表
- 組織共用帳號的操作稽核較粗 → P1 再拆個人
- 6,901 匯入效能／GAS 逾時 → 需分批 import
- 戶籍里名與系統村里主檔一字之差 → 匯入前做村里白名單校對

## Acceptance Criteria

- [x] 獨立網址 `/desk/care-forms` 未登入會導向登入並帶回原網址
- [x] 個人里責只看到自己里；組織看到該組織所有里；總承辦可看全部（程式已接；組織需 `DESK_ORG_EMAILS`）
- [x] 未指定 7 里僅總承辦＋民政課暫管可見可 KEY
- [x] 都更不用訪里不出現在一般待 KEY 清單
- [x] 可搜尋訪查員帶入；可最小新增訪查員後開始代填
- [ ] 代填送出後走既有稽核／可被既有 MOHW 匯出候選撿到（沿用既有 prepare；待人工冒煙）
- [x] Excel 兩份可重跑匯入；身分證不重複建案（6901＝6699 新＋202 更新；分配 69 列）
- [x] `npm run typecheck` / `lint` / `build` 通過
- [x] Design / UX：入口文案清楚「我負責的里／待 KEY」

## Verification

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build`
- [ ] 本機用總承辦、一個個人里責、一個組織帳號各測一輪過濾與送出
- [x] Design / UX review completed

## Workstreams（確認後開工）

| Owner | Task | Expected Output |
| --- | --- | --- |
| Planner / Lead | 本簡報確認＋Email 對照表蒐集 | 同意開工 |
| Builder | 匯入＋分配資料＋`/desk/care-forms`＋訪員搜尋／新增 | 可 KEY |
| Design / UX | 獨立入口資訊層級、空狀態、未指派提示 | UX 通過 |
| Reviewer / QA | 過濾／暫管／不訪／重匯入 | 驗收勾選 |
| Release / Ops | 推正式站＋必要時 GAS deploy | 與本機分開標示 |

## Completion Notes

- What changed:
  - GAS `里責任分配` + `villageAdmins.list|replaceAll`；`cases.import` upsert＋`appendRows` 批次寫入
  - `/desk/care-forms`＋`CareFormDeskPanel` scope／訪查員搜尋與 desk_minimal 新增
  - `resolveDeskScope`：owner=all／`DESK_ORG_EMAILS`／訪查員 email・姓名對人名
  - 匯入腳本 `scripts/import-village-desk-p0.mjs`（個案＋分配；可 `--admins-only`／`--cases-only`）
- What was verified:
  - GAS deploy @87；`villageAdmins` 寫入 69 列（person 34／org 34／skip 1；matched_visitor_id 26）
  - 個案匯入 6901（新 6699／更新 202）；永成里標不訪
  - 未對到訪查員主檔人名（屆時 desk 新建）：洪麗美、曾美雲、呂芬玲、催麗嬌、陳佩岑、陶其坤、黃淑貞
  - `npm run typecheck`／`lint`／`build` 通過
- What remains undecided: 組織拆個人帳號；MOHW 依里分批 UI；正式站 `DESK_ORG_EMAILS` 清單；三身份人工冒煙
- P2 done: `/manager/village-admins` 列表／新增／編輯／停用；GAS `upsert`／`setStatus`
