# 永和區管理者 Google 登入設定

永和區承辦人可用 **Google 帳號**登入管理後台，資料實際存放在 Google 試算表，由 GAS 提供 API。

---

## 1. 建立 OAuth 用戶端

1. 開啟 [Google Cloud Console → 憑證](https://console.cloud.google.com/apis/credentials)
2. **建立憑證** → **OAuth 用戶端 ID**
3. 應用程式類型：**網頁應用程式**
4. 名稱：`永和區訪查平台`
5. 已授權的重新導向 URI：
   - `http://localhost:3000/api/auth/google/callback`
   - `https://你的正式網域/api/auth/google/callback`
6. 複製 **用戶端 ID** 與 **用戶端密鑰**

---

## 2. 設定 `.env.local`

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_ALLOWED_EMAILS=yongheelderly0826@gmail.com,承辦人@gmail.com
GOOGLE_OWNER_EMAILS=yongheelderly0826@gmail.com
```

| 變數 | 說明 |
|------|------|
| `GOOGLE_ALLOWED_EMAILS` | 允許登入的 Gmail（逗號分隔） |
| `GOOGLE_OWNER_EMAILS` | 工作區 Owner 權限（其餘為 Manager） |

---

## 3. 管理者使用方式

1. 開啟 `/login`
2. 按 **使用 Google 帳號登入**
3. 選擇公所指定 Gmail
4. 進入 `/dashboard` 管理個案、派案、匯出

登入後可管理：
- `/manager/cases` — 個案名冊（讀寫 Google 試算表）
- `/manager/assignments` — 派案
- `/manager/import` — 匯入 CSV
- `/manager/exports` — 衛福部匯出
- `/manager/kpi` — 報表

---

## 4. 新增承辦人

在 `.env.local` 的 `GOOGLE_ALLOWED_EMAILS` 加入新 Gmail，重新部署即可。  
未來可改由試算表 `_設定` 表的 `allowed_managers` 欄位動態管理。

---

## 5. 資料存放位置

| 項目 | 位置 |
|------|------|
| 營運資料 | Google 試算表 `永和區_115年_獨居長者訪查_主檔` |
| 業務邏輯 | GAS `永和區訪查平台 GAS` |
| 管理 UI | Next.js `/manager/*` |
| 原始碼 | GitHub `yongheelderly0826-design/Elder-Visit-Platform` |

管理者直接用 **同一 Google 帳號** 也可開啟試算表檢視/編輯原始資料。
