# Elder Visit Platform — 永和區獨居長者訪查管理平台

> **GitHub**：[`yongheelderly0826-design/Elder-Visit-Platform`](https://github.com/yongheelderly0826-design/Elder-Visit-Platform)  
> **第一落地**：新北市永和區公所 · 115 年獨居長者訪查

---

## 管理架構

本專案以 **GitHub + Google Sheets + Google Apps Script（GAS）** 為核心管理架構：

```
GitHub（規格 · 原始碼 · 版本控管）
    ↓ clasp push
Google Apps Script（API · 檢核 · 匯出 · 自動化）
    ↓ SpreadsheetApp
Google Sheets（營運資料庫 · 承辦可直接管理）
    ↓ fetch API
Next.js PWA（訪查員行動端 + 管理後台）
```

| 層級 | 目錄 | 說明 |
|------|------|------|
| **操作說明書** | [`docs/系統操作說明書.md`](docs/系統操作說明書.md) | 承辦／訪員日常操作（私有倉庫） |
| 架構文件 | [`docs/architecture/`](docs/architecture/README.md) | 三層架構、API、部署 |
| 試算表定義 | [`docs/sheets/`](docs/sheets/schema-overview.md) | 12 個工作表欄位 |
| GAS 後端 | [`gas/`](gas/README.md) | Web App API 原始碼 |
| 試算表範本 | [`sheets/templates/`](sheets/templates/) | CSV 欄位範本 |
| 前端 | [`app/`](app/) | Next.js PWA |

---

## 業務流程

```
訪查員建檔／發證 → 派案 → 簽到 → 關懷表登打／空訪 → 簽退
    → 稽核 → 匯出衛福部 xlsx → 車馬費核銷
```

---

## 登入入口

| 入口 | 網址 |
|------|------|
| **GitHub Pages（給兩位同事）** | https://yongheelderly0826-design.github.io/Elder-Visit-Platform/ |
| 本機完整後台 | http://localhost:3000/login |

Pages 是靜態入口，經 GAS 讀同一份試算表。第一次請貼上 `GAS_API_TOKEN`。

---

### 1. 前端開發

```bash
npm install
cp .env.example .env.local
# 填入 GAS_WEB_APP_URL、GAS_API_TOKEN
npm run dev
```

### 2. GAS 部署

```bash
npm install -g @google/clasp
cd gas && cp .clasp.json.example .clasp.json
# 編輯 scriptId → clasp login → clasp push
bash scripts/deploy-gas.sh
```

詳見 [`docs/architecture/deployment.md`](docs/architecture/deployment.md)。

### 3. 初始化試算表

```bash
bash scripts/init-sheets.sh
```

---

## Stack

| 元件 | 技術 |
|------|------|
| 版本控管 | GitHub (`yongheelderly0826-design`) |
| 營運資料 | Google Sheets |
| 業務邏輯 | Google Apps Script |
| 前端 | Next.js App Router + TypeScript + Tailwind |
| 選用 DB | Supabase PostgreSQL（Phase 2） |

---

## 專案文件

| 文件 | 說明 |
|------|------|
| [`docs/architecture/README.md`](docs/architecture/README.md) | 架構總覽 |
| [`docs/spec-v2.4-extracted.md`](docs/spec-v2.4-extracted.md) | 產品規格 v2.4 |
| [`docs/new-taipei-care-form-workflow.md`](docs/new-taipei-care-form-workflow.md) | 關懷表流程 |
| [`AGENTS.md`](AGENTS.md) | AI 協作開發手冊 |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Vercel 部署 |

---

## 開發任務

```bash
npm run task:new -- --title "任務標題" --slug task-slug --ui
npm run task:orchestrate -- --file docs/tasks/YYYY-MM-DD-task-slug.md
npm run task:close -- --file docs/tasks/YYYY-MM-DD-task-slug.md
```

---

## 帳號

| 用途 | 帳號 |
|------|------|
| GitHub 管理 | `yongheelderly0826-design` |
| Google 部署 | 同上綁定之 Google 帳號 |
| 衛福部 SFAA 測試 | 區公所指定（測試後請換密碼） |
