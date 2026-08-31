# 一鍵安裝包產品手冊（Installer Kit）

> **目標**：客戶有需求時，用標準設定檔 + 一條指令，快速完成 Google Sheet + GAS + Vercel 架站、收款、交接。

---

## 1. 產品定位

| 傳統做法 | 安裝包做法 |
|----------|------------|
| 每次從零手動建試算表、GAS、Vercel | 複製 `client.config.json` 改 10 個欄位 |
| 交接靠口頭／散亂截圖 | 自動產生 `handoff.md` + `credentials.json` |
| 架構說明每次重寫 | 共用 `system-architecture.md` / `system-operation-manual.md` |

**適用客戶**：各區公所、里辦、社福單位之獨居長者訪查、關懷訪視管理。

---

## 2. 標準交付流程（SOP）

```mermaid
flowchart LR
  A["① 簽約收款"] --> B["② 填 client.config"]
  B --> C["③ npm run install:client"]
  C --> D["④ GAS Web App 部署"]
  D --> E["⑤ --resume 完成 Vercel"]
  E --> F["⑥ 交付 handoff.md"]
  F --> G["⑦ 驗收簽收"]
```

| 階段 | 你做的事 | 耗時（估） |
|------|----------|------------|
| 簽約 | 確認行政區、年度、承辦 Gmail、網域偏好 | 商務 |
| 設定 | 複製 `installer/clients/<id>.json` | 10 分鐘 |
| 安裝 | `install:client` 自動建 Sheet + GAS | 15 分鐘 |
| Web App | 瀏覽器點 3 下部署 GAS | 5 分鐘 |
| 上線 | `--resume` 寫入 Vercel 環境變數 + 部署 | 10 分鐘 |
| 交接 | 寄 `handoff.md`、操作／架構說明書連結 | 5 分鐘 |

**合計技術時間：約 45 分鐘／案**（不含客戶提供 Gmail 帳號等待）。

---

## 3. 自動化 vs 需人工

| 步驟 | 自動 | 說明 |
|------|------|------|
| 建立試算表 12 Tab | ✅ | `bootstrapForClient` |
| 產生 API Token | ✅ | GAS Script Properties |
| 推送 GAS 程式碼 | ✅ | `clasp push` |
| GAS Web App 部署 | ⚠️ | Google 需瀏覽器授權，約 2 分鐘人工 |
| Vercel 環境變數 + 部署 | ✅ | 需先 `vercel login` |
| GitHub 私有倉庫 | 🔜 | 需 `GH_TOKEN`（Phase 2） |
| 交接文件 | ✅ | `handoff.md` |
| 收款／合約 | — | 商務流程 |

> **無法 100% 零點擊的原因**：Google OAuth、GAS Web App 首次部署需帳號持有人授權，這是 Google 安全政策，無法用腳本完全繞過。

---

## 4. 客戶設定檔欄位

複製 `installer/client.config.example.json`：

```json
{
  "clientId": "banqiao-115",
  "clientName": "新北市板橋區公所",
  "clientCode": "BQ",
  "district": "板橋區",
  "fiscalYear": "115",
  "workspaceId": "WS-BQ-115",
  "encodePrefix": "BQ-115",
  "spreadsheetName": "板橋區_115年_獨居長者訪查_主檔",
  "google": {
    "accountEmail": "client@gmail.com",
    "gasProjectTitle": "板橋區訪查平台 GAS"
  },
  "access": {
    "allowedEmails": ["承辦@gmail.com"],
    "ownerEmails": ["承辦@gmail.com"]
  },
  "vercel": {
    "enabled": true,
    "teamSlug": "your-vercel-team",
    "projectName": "banqiao-elder-visit",
    "productionUrl": "https://banqiao-elder-visit.vercel.app"
  },
  "handoff": {
    "contactName": "王承辦",
    "contactEmail": "承辦@gmail.com",
    "contractRef": "合約-2026-001",
    "supportUntil": "2026-12-31"
  }
}
```

---

## 5. 建議報價結構（參考）

| 項目 | 內容 | 參考價格帶 |
|------|------|------------|
| **建置費** | 一鍵架站 + 試算表 + 教育訓練 2hr | 一次性 |
| **年維護** | 小更新、GAS 修補、Vercel 監控 | 年費 |
| **加購** | 客製欄位、額外匯出格式、多工作區 | 專案報價 |

建置費應涵蓋：客戶 Google 帳號綁定、56+ 筆資料匯入協助、驗收簽收。

---

## 6. 交接清單（交付物）

每次安裝完成後，交付客戶：

1. **網站 URL**（Vercel Production）
2. **Google 試算表**連結（編輯權限）
3. **操作說明書** — `docs/system-operation-manual.md`
4. **架構說明書** — `docs/system-architecture.md`
5. **handoff.md** — 驗收打勾表
6. **credentials.json** — 僅透過加密管道（Signal／實體 USB），勿 Email 明文

---

## 7. 白標／多租戶擴展路線

| 階段 | 能力 |
|------|------|
| **v1** | 一客戶一組 Sheet + GAS + Vercel 專案 |
| **v2（已完成）** | `GH_TOKEN` 自動建立私有 GitHub 倉庫 |
| **v3（已完成）** | `/installer` Web 精靈填表 → 背景安裝 |
| **v4** | 多工作區 SaaS（單一 GAS，多 `workspace_id`） |

---

## 8. 指令參考

```bash
# 安裝（首次）
npm run install:client -- --config installer/clients/<id>.json

# 完成 GAS Web App 後續跑
npm run install:client -- --config installer/clients/<id>.json --resume

# 預覽步驟（不實際執行）
npm run install:client -- --config installer/clients/<id>.json --dry-run

# Web 安裝精靈（本機 npm run dev）
open http://localhost:3000/installer

# 環境變數（.env.local）
# GH_TOKEN=ghp_xxx          # v2 GitHub 私有倉庫
# INSTALLER_ENABLED=true    # 正式環境啟用精靈
# INSTALLER_RUNNER=local    # 允許背景 spawn（Vercel 請設 disabled）

# 僅更新 GAS
npm run gas:push && npm run gas:deploy

# 僅更新 Vercel
bash scripts/setup-vercel-ruby-env.sh
```

---

## 9. 風險與合規

1. **個資**：客戶 Gmail 帳號應為公所正式帳號，合約載明資料保存責任  
2. **帳號保管**：API Token 輪換 SOP 每 6–12 個月  
3. **原始碼**：建議每客戶私有 GitHub fork，勿混用 Token  
4. **收款**：建置完成並通過 handoff 驗收後收尾款  

---

## 修訂紀錄

| 日期 | 版本 |
|------|------|
| 2026-08-31 | 1.0 初版 Installer Kit |
