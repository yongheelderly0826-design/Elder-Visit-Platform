# 部署指南 — GitHub + clasp + Google Sheets

## 1. 前置準備

### 1.1 Google 帳號

使用 `yongheelderly0826-design` 綁定之 Google 帳號：
1. 建立 Google Cloud 專案（選用，企業版）
2. 啟用 Apps Script API：https://script.google.com/home/usersettings
3. 建立主工作簿：`永和區_115年_獨居長者訪查_主檔`

### 1.2 本機工具

```bash
npm install -g @google/clasp
clasp login
```

### 1.3 GitHub

```bash
git clone https://github.com/yongheelderly0826-design/Elder-Visit-Platform.git
cd Elder-Visit-Platform
npm install
```

---

## 2. 初始化 GAS 專案

```bash
cd gas
cp .clasp.json.example .clasp.json
# 編輯 .clasp.json，填入 scriptId（clasp create 或既有專案 ID）

clasp create --type webapp --title "永和區訪查平台 GAS" --rootDir src
# 或 clasp clone <scriptId>

clasp push
```

### 2.1 設定 Script Properties

在 Apps Script 編輯器 → 專案設定 → Script properties：

| Key | 值 |
|-----|-----|
| `SPREADSHEET_ID` | 主工作簿 ID |
| `WORKSPACE_ID` | `WS-YH-115` |
| `API_TOKEN` | 隨機 32 字元 token |
| `ENCODE_PREFIX` | `YH-115` |

### 2.2 部署 Web App

1. Apps Script → 部署 → 新增部署
2. 類型：Web App
3. 執行身分：我
4. 存取：僅限本人（開發）/ 任何人（正式，需 Token 驗證）
5. 複製 Web App URL → 填入 `.env.local`：

```env
GAS_WEB_APP_URL=https://script.google.com/macros/s/xxx/exec
GAS_API_TOKEN=your-token-here
GAS_WORKSPACE_ID=WS-YH-115
```

---

## 3. 初始化試算表結構

```bash
# 方式 A：手動依 docs/sheets/schema-overview.md 建立各 Tab
# 方式 B：執行 GAS 初始化函式
clasp run initSpreadsheet
```

或：

```bash
bash scripts/init-sheets.sh
```

---

## 4. 部署流程（日常）

```bash
# 1. 開發完成，本地驗證
npm run typecheck
npm run lint

# 2. 推送 GAS
bash scripts/deploy-gas.sh

# 3. Git 提交
git add .
git commit -m "feat: ..."
git push origin main
```

`scripts/deploy-gas.sh` 內容：
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../gas"
clasp push
echo "GAS pushed. Redeploy Web App if needed."
```

---

## 5. Next.js 環境變數

`.env.local`（不入庫）：

```env
# GAS Backend（主要）
GAS_WEB_APP_URL=
GAS_API_TOKEN=
GAS_WORKSPACE_ID=WS-YH-115

# Supabase（選用，Phase 2）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 6. 檢查清單

- [ ] 主工作簿已建立，各 Tab 欄位與 schema 一致
- [ ] GAS Script Properties 已設定
- [ ] Web App 已部署，URL 可 curl 測試
- [ ] `.env.local` 已設定 GAS 變數
- [ ] Next.js `npm run dev` 可連線 GAS
- [ ] 測試帳號可完成：登入 → 派案 → 簽到 → 提交 → 匯出

---

## 7. 帳號管理

| 項目 | 帳號 |
|------|------|
| GitHub Owner | `yongheelderly0826-design` |
| Google 部署 | 同上綁定之 Google 帳號 |
| 衛福部 SFAA 測試 | `charles831904`（測試用，正式前請換） |

GitHub repo 設定建議：
- Branch protection on `main`
- Required review for PRs
- Secrets: `CLASP_TOKEN`（CI 自動部署用，選用）
