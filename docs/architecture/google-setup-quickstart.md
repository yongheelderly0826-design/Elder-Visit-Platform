# Google 試算表 + GAS 快速設定（5 步驟）

> 使用 `yongheelderly0826-design` 綁定的 **Google 帳號**登入

---

## 步驟 1：啟用 Apps Script API

1. 開啟：https://script.google.com/home/usersettings  
2. 開啟 **Google Apps Script API**  
3. 儲存

---

## 步驟 2：本機登入 Google（只需做一次）

在終端機執行：

```bash
cd /Users/apple/Documents/Elder-Visit-Platform
npm run gas:login
```

瀏覽器會跳出，請用 **yongheelderly0826-design 的 Gmail** 登入並授權。

---

## 步驟 3：一鍵建置（建立 GAS + 試算表）

```bash
npm run setup:google
```

此腳本會自動：
- 建立 GAS 專案「永和區訪查平台 GAS」
- 推送所有 `gas/src/` 原始碼
- 執行 `bootstrapPlatform()` → **自動建立試算表** `永和區_115年_獨居長者訪查_主檔`
- 初始化 12 個 Tab（訪查員主檔、個案名冊、派案…）
- 產生 API Token

完成後終端機會顯示：
```
spreadsheet_url: https://docs.google.com/spreadsheets/d/xxxxx/edit
api_token: xxxxxxxxx
```

**請記下這兩個值。**

---

## 步驟 4：部署 Web App

1. 開啟：https://script.google.com  
2. 點「永和區訪查平台 GAS」專案  
3. 右上角 **部署** → **新增部署**  
4. 類型：**網頁應用程式**  
5. 設定：
   - 執行身分：**我**
   - 存取：**任何人**（API 有 Token 保護）
6. 按 **部署**，複製 **Web App URL**

或使用指令：

```bash
npm run gas:deploy
```

---

## 步驟 5：設定 Next.js 環境變數

編輯 `.env.local`：

```env
GAS_WEB_APP_URL=https://script.google.com/macros/s/xxxxx/exec
GAS_API_TOKEN=（步驟 3 顯示的 api_token）
GAS_WORKSPACE_ID=WS-YH-115
```

啟動前端：

```bash
npm run dev
```

---

## 驗證

試算表應有這些 Tab：

| Tab | 說明 |
|-----|------|
| `_設定` | 工作區參數 |
| `訪查員主檔` | 訪查員資料 |
| `個案名冊` | 獨老/中老 |
| `派案紀錄` | 派案 |
| `簽到退紀錄` | 簽到退 |
| `關懷表登打` | 表單答案 |
| `空訪紀錄` | 未遇 |
| `稽核佇列` | 覆核 |
| `車馬費核銷` | 費用 |
| `匯出紀錄` | 衛福部匯出 |
| `報表快照` | KPI |
| `_操作日誌` | 系統 log |

測試 API：

```bash
curl "GAS_WEB_APP_URL?action=reports.kpi&token=你的API_TOKEN"
```

---

## 手動方式（不用 clasp）

若 clasp 無法使用，可在 Apps Script 編輯器手動操作：

1. https://script.google.com → **新增專案**  
2. 將 `gas/src/` 所有 `.gs` 檔案內容貼入  
3. 選函式 `bootstrapPlatform` → **執行**  
4. 首次執行需授權 Google 帳號  
5. 查看 **執行紀錄**，取得 `spreadsheet_url` 和 `api_token`  
6. 依步驟 4 部署 Web App
