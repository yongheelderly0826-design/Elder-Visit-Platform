# Google Apps Script — 永和區訪查平台後端

## 目錄

```
gas/
├── appsscript.json       ← GAS 專案設定
├── .clasp.json.example   ← clasp 設定範本（複製為 .clasp.json）
├── README.md
└── src/
    ├── Main.gs           ← Web App 入口
    ├── Config.gs         ← 環境常數
    ├── ApiRouter.gs      ← 路由分派
    ├── auth/
    │   └── SessionAuth.gs
    ├── modules/          ← 業務模組
    ├── utils/            ← 工具函式
    └── triggers/         ← 觸發器
```

## 快速開始

```bash
npm install -g @google/clasp
cd gas
cp .clasp.json.example .clasp.json
# 編輯 scriptId
clasp login
clasp push
clasp deploy --description "v1.0.0"
```

詳見 [`../docs/architecture/deployment.md`](../docs/architecture/deployment.md)。

## 模組說明

| 模組 | 檔案 | 職責 |
|------|------|------|
| 訪查員 | `VisitorModule.gs` | CRUD、核准 |
| 個案 | `CaseModule.gs` | 名冊、匯入 |
| 派案 | `AssignmentModule.gs` | 派案、接案 |
| 簽到退 | `AttendanceModule.gs` | 簽到/簽退 |
| 關懷表 | `CareFormModule.gs` | 草稿、提交、檢核 |
| 稽核 | `AuditModule.gs` | 覆核佇列 |
| 匯出 | `ExportModule.gs` | 衛福部 xlsx |
| 報表 | `ReportModule.gs` | KPI |
| 車馬費 | `PaymentModule.gs` | 計算、鎖定 |

## API

見 [`../docs/architecture/gas-api.md`](../docs/architecture/gas-api.md)。
