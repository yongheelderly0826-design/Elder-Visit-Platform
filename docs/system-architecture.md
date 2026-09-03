# 永和區獨居長者訪查管理平台 — 運作架構說明書

> **版本**：115 年度試運行版  
> **帳號**：GitHub `yongheelderly0826-design` · Google `yongheelderly0826@gmail.com`  
> **相關文件**：[`system-operation-manual.md`](./system-operation-manual.md)（操作手冊）

---

## 1. 架構總覽

本平台採 **GitHub + Google Apps Script + Google Sheets + Next.js（Vercel）** 四層架構。  
營運資料以 **Google 試算表為唯一主檔**；網站透過 **GAS Web App API** 讀寫試算表。

```mermaid
flowchart TB
  subgraph Users["使用者"]
    MGR["承辦管理者<br/>yongheelderly0826@gmail.com"]
    VIS["訪查員<br/>Email 密碼登入"]
    VOL["外勤志工<br/>身分證登入＋掃 QR"]
    KSK["公所內勤<br/>刷身分證條碼"]
  end

  subgraph Frontend["前端層 · Vercel"]
    PWA["Next.js PWA<br/>elder-visit-platform-ruby.vercel.app"]
    API["Next.js API Routes<br/>/api/*"]
  end

  subgraph Backend["邏輯層 · Google Apps Script"]
    GAS["GAS Web App<br/>doGet / doPost + Token 驗證"]
    MOD["業務模組<br/>Case · Assignment · Attendance · Audit · Export …"]
  end

  subgraph Data["資料層 · Google Sheets"]
    SS[("永和區_115年_獨居長者訪查_主檔<br/>12 個工作表 Tab")]
  end

  subgraph DevOps["開發與版控 · GitHub"]
    GH["yongheelderly0826-design<br/>Elder-Visit-Platform"]
    CLASP["clasp push"]
  end

  MGR --> PWA
  VIS --> PWA
  VOL --> PWA
  KSK --> PWA
  PWA --> API
  API --> GAS
  GAS --> MOD
  MOD --> SS
  GH --> CLASP --> GAS
  MGR -.->|可直接編輯| SS
```

---

## 2. 正式環境部署拓撲

```mermaid
flowchart LR
  subgraph Internet
    U["瀏覽器 / 手機"]
  end

  subgraph Vercel["Vercel（yongheelderly0826-design）"]
    RUBY["elder-visit-platform-ruby.vercel.app<br/>Production"]
    ENV["環境變數<br/>GAS_WEB_APP_URL<br/>GAS_API_TOKEN<br/>GOOGLE_ALLOWED_EMAILS"]
  end

  subgraph Google["Google 雲端（yongheelderly0826@gmail.com）"]
    GASURL["script.google.com/.../exec"]
    SHEET["試算表 ID<br/>17obWeUCT6HXSBD59Hnb2fsrCZdXHzZE0cT0jykjuquY"]
  end

  subgraph GitHub["GitHub"]
    REPO["Elder-Visit-Platform<br/>main 分支"]
  end

  U --> RUBY
  RUBY --> ENV
  RUBY -->|HTTPS + token 參數| GASURL
  GASURL --> SHEET
  REPO -->|git push / CI| RUBY
```

| 元件 | 網址／識別 |
|------|------------|
| 正式網站 | https://elder-visit-platform-ruby.vercel.app |
| 試算表主檔 | https://docs.google.com/spreadsheets/d/17obWeUCT6HXSBD59Hnb2fsrCZdXHzZE0cT0jykjuquY/edit |
| 程式倉庫 | https://github.com/yongheelderly0826-design/Elder-Visit-Platform |
| 工作區 ID | `WS-YH-115` |
| 去識別化前綴 | `YH-115` |

---

## 3. 四層職責分工

```mermaid
flowchart TB
  L1["① GitHub<br/>規格 · 原始碼 · 文件 · 版本控管"]
  L2["② Google Apps Script<br/>API · 檢核 · 匯出 · 自動化"]
  L3["③ Google Sheets<br/>營運資料庫 · 承辦可直接管理"]
  L4["④ Next.js PWA<br/>訪查員行動端 + 管理後台 UI"]

  L1 -->|clasp push| L2
  L2 -->|SpreadsheetApp| L3
  L4 -->|fetch GAS API| L2
```

| 層級 | 工具 | 職責 | 目錄 |
|------|------|------|------|
| 版本與規格 | GitHub | PR、Issue、欄位定義、部署腳本 | `docs/`、`scripts/` |
| 業務邏輯 | GAS | REST API、衛福部 xlsx、編碼、觸發器 | `gas/src/` |
| 營運資料 | Google Sheets | 個案、派案、訪查、稽核、核銷 | 雲端試算表 12 Tab |
| 使用者介面 | Next.js | 登入、名冊、派案、訪查 PWA | `app/`、`lib/gas-client.ts` |

---

## 4. 請求資料流（讀寫個案）

```mermaid
sequenceDiagram
  participant U as 承辦人瀏覽器
  participant N as Next.js（Vercel）
  participant G as GAS Web App
  participant S as Google Sheets

  U->>N: GET /manager/cases
  N->>N: 檢查登入 Cookie + 權限
  N->>G: GET ?action=cases.list&token=***
  G->>G: 驗證 API Token
  G->>S: 讀取「個案名冊」
  S-->>G: 56 筆資料
  G-->>N: JSON { ok, data }
  N-->>U: 渲染名冊頁面
```

**Repository 模式**：Next.js 依環境變數決定資料來源。

| `dataMode` | 條件 | 資料來源 |
|------------|------|----------|
| `gas_ready` | 已設定 `GAS_WEB_APP_URL` + `GAS_API_TOKEN` | GAS → Sheets（**正式環境**） |
| `mock` | 未設定 GAS 變數 | 內建假資料（僅開發／誤設時） |
| `supabase_ready` | 已設定 Supabase（Phase 2） | PostgreSQL |

---

## 5. 業務流程架構

平台有兩條並行業務線：

### 5.1 獨居長者訪查

```mermaid
flowchart LR
  A["訪查員建檔／發證"] --> B["個案匯入／名冊"]
  B --> C["派案"]
  C --> D["關懷表登打<br/>或空訪"]
  D --> E["稽核"]
  E --> F["衛福部 xlsx 匯出"]
  F --> G["車馬費核銷"]
```

### 5.2 12 組志工出勤

```mermaid
flowchart LR
  R["志工名冊建檔<br/>身分證＋組別"] --> P["列印集合點 QR"]
  P --> F1["外勤：手機掃 QR"]
  P --> F2["公所：刷身分證條碼"]
  F1 --> S["簽到退紀錄<br/>時戳＋組別＋地點"]
  F2 --> S
  S --> X["月結 Excel"]
  X --> Y["匯入既有出勤系統"]
```

```mermaid
sequenceDiagram
  participant V as 外勤志工手機
  participant N as Next.js
  participant G as GAS AttendanceModule
  participant S as 簽到退紀錄 Sheet

  V->>N: 身分證 identify
  N->>G: attendance.identify
  G->>S: 讀訪查員主檔
  G-->>N: 姓名＋組別
  N-->>V: 設定出勤 Cookie
  V->>N: 掃 QR 後 clock（site_id）
  N->>G: attendance.clock
  alt 當日尚無未簽退
    G->>S: append 簽到
  else 已有未簽退
    G->>S: update 簽退＋時數
  end
  G-->>N: action + record
  N-->>V: 顯示簽到／簽退成功
```

| 流程節點 | 試算表 Tab | GAS 模組 | 前端路徑 |
|----------|-----------|----------|----------|
| 訪查員／志工建檔 | `訪查員主檔`（含 `volunteer_group`） | `VisitorModule` | `/workspace/users`、`/manager/attendance` |
| 個案名冊 | `個案名冊` | `CaseModule` | `/manager/cases` |
| 派案 | `派案紀錄` | `AssignmentModule` | `/manager/assignments` |
| 志工出勤簽到退 | `簽到退紀錄` | `AttendanceModule` | `/volunteer/clock`、`/office/kiosk` |
| 關懷表 | `關懷表登打` | `CareFormModule` | `/visitor/visits/[id]` |
| 稽核 | `稽核佇列` | `AuditModule` | `/manager/audit` |
| 衛福部匯出 | `匯出紀錄` | `ExportModule` | `/manager/exports` |
| 出勤月結 | Drive「志工出勤月結」＋本機 xlsx | `AttendanceModule.monthlyExport` | `/manager/attendance` |
| KPI | `報表快照` | `ReportModule` | `/manager/kpi` |
| 車馬費 | `車馬費核銷` | `PaymentModule` | `/manager/pricing` |

---

## 6. Google 試算表結構

```mermaid
flowchart TB
  WB["永和區_115年_獨居長者訪查_主檔"]

  WB --> T0["_設定"]
  WB --> T1["訪查員主檔"]
  WB --> T2["個案名冊"]
  WB --> T3["派案紀錄"]
  WB --> T4["簽到退紀錄"]
  WB --> T5["關懷表登打"]
  WB --> T6["空訪紀錄"]
  WB --> T7["稽核佇列"]
  WB --> T8["車馬費核銷"]
  WB --> T9["匯出紀錄"]
  WB --> T10["報表快照"]
  WB --> T11["_操作日誌"]
```

詳細欄位見 [`sheets/schema-overview.md`](./sheets/schema-overview.md)。

---

## 7. GAS 後端模組地圖

```mermaid
flowchart TB
  ENTRY["Main.gs<br/>doGet / doPost"]
  ROUTER["ApiRouter.gs"]
  AUTH["SessionAuth.gs<br/>Token 驗證"]

  ENTRY --> ROUTER
  ROUTER --> AUTH
  AUTH --> VM["VisitorModule"]
  AUTH --> CM["CaseModule"]
  AUTH --> AM["AssignmentModule"]
  AUTH --> AT["AttendanceModule<br/>identify · clock · monthlyExport"]
  AUTH --> CF["CareFormModule"]
  AUTH --> AU["AuditModule"]
  AUTH --> EX["ExportModule"]
  AUTH --> RP["ReportModule"]
  AUTH --> PM["PaymentModule"]

  VM & CM & AM & AT & CF & AU & EX & RP & PM --> SH["SheetHelper.gs"]
  AT --> CAT["VolunteerAttendanceCatalog.gs<br/>12 組＋集合點"]
  SH --> SS[("Google Sheets")]
```

原始碼路徑：`gas/src/` · API 規格：[`architecture/gas-api.md`](./architecture/gas-api.md)

---

## 8. 登入與權限架構

```mermaid
flowchart TB
  LOGIN["/login"]

  LOGIN --> MGR["承辦管理者<br/>輸入 Gmail"]
  LOGIN --> VIS["訪員<br/>Email + 密碼"]
  LOGIN --> VOL["外勤出勤<br/>/volunteer/clock<br/>身分證 identify"]

  MGR --> ALLOW{"GOOGLE_ALLOWED_EMAILS<br/>允許清單？"}
  ALLOW -->|是| ROLE{"GOOGLE_OWNER_EMAILS<br/>擁有者清單？"}
  ROLE -->|是| OWNER["workspace_owner"]
  ROLE -->|否| MANAGER["workspace_manager<br/>含 attendance.manage"]
  ALLOW -->|否| DENY["拒絕登入"]

  VIS --> SUPA["訪員帳號驗證<br/>（註冊審核後）"]
  VOL --> COOKIE["volunteer_clock Cookie<br/>＋ attendance.clock"]
```

| 角色 | 權限範圍 |
|------|----------|
| `workspace_owner` | 全部功能（成員、權限、設定） |
| `workspace_manager` | 名冊、派案、匯入、稽核、匯出、志工出勤月結／刷證 |
| `supervisor` | 稽核覆核、出勤月結查閱 |
| `visitor` | 任務、關懷表、外勤掃 QR 簽到退（`attendance.clock`） |

---

## 9. 開發與部署流程

```mermaid
flowchart LR
  DEV["本機開發<br/>npm run dev"]
  GIT["git commit / push"]
  GH["GitHub main"]
  VERCEL["Vercel 自動部署"]
  CLASP["clasp push"]
  GAS["GAS 雲端更新"]

  DEV --> GIT --> GH
  GH --> VERCEL
  GH --> CLASP --> GAS
```

| 變更類型 | 部署方式 |
|----------|----------|
| 前端 UI / API Route | `git push` → Vercel Production |
| GAS 後端邏輯 | `clasp push` 或 `scripts/deploy-gas.sh` |
| 試算表欄位 | 手動或 `scripts/init-sheets.sh` / GAS `bootstrapPlatform()` |
| 環境變數 | Vercel Dashboard → Redeploy |

---

## 10. 安全架構要點

```mermaid
flowchart TB
  subgraph Public["對外"]
    WEB["Vercel HTTPS"]
  end

  subgraph Secrets["機密（不入 Git）"]
    TOK["GAS_API_TOKEN"]
    ENV[".env.local"]
  end

  subgraph Google["Google 端"]
    GAS2["GAS Web App<br/>Token query param 驗證"]
    SS2["試算表<br/>僅授權承辦編輯"]
  end

  WEB --> GAS2
  ENV --> WEB
  TOK --> GAS2
  GAS2 --> SS2
```

1. **GAS Token** 僅存於 Vercel 環境變數與本機 `.env.local`，不提交 GitHub。  
2. **個資最小化**：關懷表使用去識別化編碼（`YH-115-A001`）；出勤月結含身分證，僅承辦下載。  
3. **試算表共用** 僅授予必要 Gmail 編輯權限。  
4. **操作日誌** 由 GAS 自動寫入 `_操作日誌`，人工不可刪改。  
5. **公所刷證** 需承辦登入；外勤僅能對自己身分證 identify 後打卡。

---

## 11. Phase 2 選用路徑（Supabase）

```mermaid
flowchart LR
  SHEETS[("Google Sheets<br/>Master")]
  GAS3["GAS SyncJob"]
  SB[("Supabase PostgreSQL<br/>Read Replica")]

  SHEETS <-->|每 15 min| GAS3
  GAS3 <--> SB
  NEXT["Next.js"] --> SB
```

目前永和試運行以 **Sheets + GAS** 為主；Supabase 為未來高流量或複雜查詢之選用遷移路徑。

---

## 12. 相關文件索引

| 文件 | 說明 |
|------|------|
| [`system-operation-manual.md`](./system-operation-manual.md) | 日常操作手冊 |
| [`architecture/README.md`](./architecture/README.md) | 架構總覽（開發者版） |
| [`architecture/github-sheets-gas-stack.md`](./architecture/github-sheets-gas-stack.md) | 三層架構詳細設計 |
| [`architecture/data-flow.md`](./architecture/data-flow.md) | 資料流與同步策略 |
| [`architecture/deployment.md`](./architecture/deployment.md) | clasp / Vercel 部署 |
| [`architecture/gas-api.md`](./architecture/gas-api.md) | GAS API 規格 |
| [`sheets/schema-overview.md`](./sheets/schema-overview.md) | 試算表欄位定義 |

---

## 修訂紀錄

| 日期 | 版本 | 說明 |
|------|------|------|
| 2026-08-31 | 1.0 | 初版：四層架構、正式環境拓撲、資料流與業務流程圖 |
| 2026-09-03 | 1.1 | 新增 12 組志工出勤架構圖、AttendanceModule 與權限 |
