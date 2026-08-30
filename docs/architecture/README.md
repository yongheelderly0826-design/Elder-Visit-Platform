# 永和區獨居長者訪查管理平台 — 開發架構總覽

> **GitHub 帳號**：[`yongheelderly0826-design`](https://github.com/yongheelderly0826-design)  
> **專案倉庫**：[`Elder-Visit-Platform`](https://github.com/yongheelderly0826-design/Elder-Visit-Platform)  
> **第一落地場景**：新北市永和區公所 · 115 年獨居長者訪查

---

## 一、管理架構三層

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub（yongheelderly0826-design）                             │
│  規格書 · 架構文件 · GAS 原始碼 · 試算表欄位定義 · 版本控管        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ clasp push / PR review
┌───────────────────────────▼─────────────────────────────────────┐
│  Google Apps Script（GAS）                                       │
│  Web App API · 觸發器 · 匯入匯出 · 檢核邏輯 · 去識別化編碼        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ SpreadsheetApp / DriveApp
┌───────────────────────────▼─────────────────────────────────────┐
│  Google Sheets（營運資料庫）                                      │
│  訪查員主檔 · 個案名冊 · 派案 · 簽到退 · 關懷表 · 稽核 · 報表     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ fetch API（選用）
┌───────────────────────────▼─────────────────────────────────────┐
│  Next.js PWA（app/）— 訪查員行動端 + 管理後台 UI                  │
└─────────────────────────────────────────────────────────────────┘
```

| 層級 | 工具 | 職責 |
|------|------|------|
| **版本與規格** | GitHub | 原始碼、文件、欄位定義、部署腳本、Issue/PR 追蹤 |
| **業務邏輯** | Google Apps Script | API、自動化、衛福部 xlsx 匯出、檢核、編碼 |
| **營運資料** | Google Sheets | 主檔、交易紀錄、報表來源、承辦人可直接檢視 |
| **使用者介面** | Next.js PWA | 訪查員現場操作、管理後台、離線草稿 |

---

## 二、業務流程對應

```
訪查員建檔／發證
    → 派案（志願區域／確認／發放編碼名單）
        → 到場視訊或表單簽到
            → 在宅登打關懷表 ／ 空訪拍照註記
                → 簽退
                    → 關懷表檢核
                        → 匯出衛福部 xlsx ＋ 區內報表
                            → 車馬費核銷
```

| 流程節點 | Sheet 工作表 | GAS 模組 | 前端路由 |
|----------|-------------|----------|----------|
| 訪查員建檔 | `訪查員主檔` | `VisitorModule` | `/workspace/users` |
| 個案名冊 | `個案名冊` | `CaseModule` | `/manager/cases` |
| 派案 | `派案紀錄` | `AssignmentModule` | `/manager/assignments` |
| 簽到退 | `簽到退紀錄` | `AttendanceModule` | `/visitor/tasks` |
| 關懷表 | `關懷表登打` | `CareFormModule` | `/visitor/visits/[id]` |
| 稽核 | `稽核佇列` | `AuditModule` | `/manager/audit` |
| 衛福部匯出 | — | `ExportModule` | `/manager/exports` |
| 報表/KPI | `報表快照` | `ReportModule` | `/manager/kpi` |
| 車馬費 | `車馬費核銷` | `PaymentModule` | `/manager/pricing` |

---

## 三、Google Sheets 工作簿結構

建議建立 **一個主工作簿**（永和區 115 年訪查），以分頁（Tab）區分：

```
永和區_115年_獨居長者訪查_主檔.gsheet
├── _設定          ← 工作區參數、編碼前綴、衛福部帳號（遮罩）
├── 訪查員主檔      ← 訪查員基本資料、證件、服務區域
├── 個案名冊        ← 獨老/中老、戶籍里、訪視里、電話
├── 派案紀錄        ← 派案批次、訪查員、編碼名單
├── 簽到退紀錄      ← 簽到/簽退時間、GPS、視訊連結
├── 關懷表登打      ← 去識別化編碼對應之表單答案
├── 空訪紀錄        ← 未遇拍照、備註
├── 稽核佇列        ← 待覆核、退回、通過
├── 車馬費核銷      ← 時數、金額、鎖定狀態
├── 匯出紀錄        ← 衛福部 xlsx 匯出 log
├── 報表快照        ← KPI 快取（每日觸發更新）
└── _操作日誌       ← 自動寫入（GAS 觸發）
```

詳細欄位定義見 [`../sheets/schema-overview.md`](../sheets/schema-overview.md)。

---

## 四、GAS 模組地圖

```
gas/src/
├── Main.gs              ← doGet / doPost 入口
├── Config.gs            ← 工作簿 ID、環境常數
├── ApiRouter.gs         ← REST 路由分派
├── auth/
│   └── SessionAuth.gs   ← Google 帳號 / Token 驗證
├── modules/
│   ├── VisitorModule.gs
│   ├── CaseModule.gs
│   ├── AssignmentModule.gs
│   ├── AttendanceModule.gs
│   ├── CareFormModule.gs
│   ├── AuditModule.gs
│   ├── ExportModule.gs   ← 衛福部生活關懷表 .xlsx
│   ├── ReportModule.gs
│   └── PaymentModule.gs
├── utils/
│   ├── SheetHelper.gs
│   ├── IdEncoder.gs      ← 去識別化編碼
│   └── Validation.gs
└── triggers/
    └── OnEditTriggers.gs
```

API 路由規格見 [`gas-api.md`](./gas-api.md)。

---

## 五、GitHub 倉庫目錄

```
Elder-Visit-Platform/
├── README.md
├── AGENTS.md
├── docs/
│   ├── architecture/          ← 本目錄：架構總覽
│   ├── sheets/                ← 試算表欄位定義
│   ├── spec-v2.4-extracted.md ← 產品規格（治理平台）
│   └── tasks/                 ← 開發任務 brief
├── gas/                       ← GAS 原始碼（clasp 部署）
├── sheets/                    ← 試算表範本與欄位 CSV
├── app/                       ← Next.js 前端（連 GAS API）
├── components/
├── lib/
│   └── gas-client.ts          ← 前端呼叫 GAS Web App
├── scripts/
│   ├── deploy-gas.sh          ← clasp push 腳本
│   └── init-sheets.sh         ← 初始化試算表結構
└── supabase/                  ← 選用：長期遷移路徑
```

---

## 六、帳號與權限

| 角色 | Google 帳號 | GitHub | Sheets 權限 | GAS |
|------|------------|--------|------------|-----|
| **平台管理** | `yongheelderly0826-design` 綁定之 Google 帳號 | Owner | 編輯者 | 部署者 |
| **區公所承辦** | 公所指定 Gmail | — | 編輯者 | 執行者 |
| **訪查員** | 個人 Gmail | — | 檢視（編碼名單） | API 讀取 |
| **督導/稽核** | 公所 Gmail | — | 編輯者 | 覆核 API |

> 正式環境請將 GAS Web App 設為「僅限組織內」或 Token 驗證，詳見 [`deployment.md`](./deployment.md)。

---

## 七、相關文件

| 文件 | 說明 |
|------|------|
| [`github-sheets-gas-stack.md`](./github-sheets-gas-stack.md) | 三層架構詳細設計 |
| [`data-flow.md`](./data-flow.md) | 資料流與同步策略 |
| [`gas-api.md`](./gas-api.md) | GAS Web App API 規格 |
| [`deployment.md`](./deployment.md) | clasp 部署與環境設定 |
| [`../sheets/schema-overview.md`](../sheets/schema-overview.md) | 試算表完整欄位 |
| [`../new-taipei-care-form-workflow.md`](../new-taipei-care-form-workflow.md) | 關懷表操作流程 |
