# GitHub + Google Sheets + GAS 管理架構詳細設計

## 1. 為什麼選這個架構

| 需求 | GitHub | Google Sheets | GAS |
|------|--------|---------------|-----|
| 區公所承辦可直接看資料 | — | ✅ 試算表介面熟悉 | — |
| 低建置成本、快速上線 | — | ✅ 免費額度 | ✅ 免費額度 |
| 版本控管與協作開發 | ✅ PR / Issue | — | ✅ clasp 同步 |
| 衛福部 xlsx 匯出 | 範本存 repo | — | ✅ 程式產檔 |
| 訪查員手機操作 | — | — | API → Next.js PWA |
| 去識別化編碼 | 規格文件 | 編碼對照表 | ✅ 自動產生 |

本架構以 **Google Sheets 為營運資料庫（Operational DB）**，**GAS 為應用伺服器**，**GitHub 為規格與程式碼倉庫**。Next.js 前端保留作為訪查員與管理員的操作介面，透過 GAS Web App API 讀寫 Sheets。

---

## 2. 三層職責分工

### 2.1 GitHub（規格與原始碼層）

**帳號**：`yongheelderly0826-design`  
**倉庫**：`Elder-Visit-Platform`

存放內容：
- GAS 原始碼（`gas/`）
- 試算表欄位定義（`docs/sheets/`、`sheets/templates/`）
- 產品規格（`docs/spec-v2.4-extracted.md`）
- Next.js 前端（`app/`）
- 部署腳本（`scripts/deploy-gas.sh`）
- 環境設定範本（`.env.example`、`.clasp.json.example`）

工作流程：
```
Issue → Branch → 開發 → PR Review → merge main → clasp push → GAS 部署
```

### 2.2 Google Sheets（資料層）

**定位**：Single Source of Truth for operational data

原則：
1. 每個業務實體一個工作表（Tab）
2. 第一列為英文欄位 key（供 GAS 讀取），第二列為中文標題（供承辦人閱讀）
3. 主鍵欄位不可重複（`visitor_id`、`case_id`、`assignment_id` 等）
4. 敏感欄位（身分證）僅存於 `個案名冊`，關懷表登打使用去識別化編碼
5. `_操作日誌` 由 GAS 自動追加，人工不可刪改

### 2.3 Google Apps Script（邏輯層）

**定位**：Backend-as-a-Service

職責：
- RESTful Web App API（供 Next.js 呼叫）
- 表單提交檢核（必填、格式、邏輯）
- 去識別化編碼產生與對照
- 衛福部「生活關懷表」.xlsx 匯出
- 定時觸發（報表快照、逾期提醒）
- onEdit 觸發（狀態連動）

---

## 3. 與既有 Next.js / Supabase 的關係

```
現況（v2.4）                    目標（永和區落地）
─────────────────────────────────────────────────
Next.js PWA          ────────►  保留，改接 GAS API
Supabase PostgreSQL  ────────►  Phase 2 遷移（選用）
Mock data            ────────►  改讀 Google Sheets
```

**Phase 1（本階段）**：Sheets + GAS 為主，Next.js 透過 `lib/gas-client.ts` 呼叫 GAS。  
**Phase 2（選用）**：高流量或複雜查詢遷移至 Supabase，GAS 作為同步橋接。

詳見 [`data-flow.md`](./data-flow.md)。

---

## 4. 工作區（Workspace）模型

永和區公所第一個 Workspace：

| 欄位 | 值 |
|------|-----|
| workspace_id | `WS-YH-115` |
| 名稱 | 115年永和區獨居長者訪查 |
| 行政區 | 新北市永和區 |
| 年度 | 115 |
| 主工作簿 ID | （部署後填入 `_設定` 表） |
| GAS Web App URL | （部署後填入 `.env.local`） |

---

## 5. 安全與合規

1. **個資最小化**：關懷表登打表僅存編碼，不存姓名/身分證
2. **試算表共用**：僅加公所承辦與必要訪查員，不公開連結
3. **GAS 部署**：Web App 設「執行身分：本人」，存取「僅限本人」或 Token 驗證
4. **GitHub**：`.clasp.json`、Service Account 金鑰不入庫（`.gitignore`）
5. **操作日誌**：所有寫入操作記錄至 `_操作日誌`

---

## 6. 開發環境需求

| 工具 | 用途 |
|------|------|
| Node.js 20+ | Next.js 開發 |
| `@google/clasp` | GAS 本地開發與部署 |
| Google 帳號 | Sheets + GAS 部署 |
| GitHub CLI (`gh`) | PR / Issue 管理 |

初始化步驟見 [`deployment.md`](./deployment.md)。
