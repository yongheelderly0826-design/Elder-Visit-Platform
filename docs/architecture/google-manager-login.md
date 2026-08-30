# 永和區管理者登入（不需 OAuth）

永和區承辦人用 **指定 Google 帳號（Gmail）** 進入管理後台。  
營運資料存在同一 Google 帳號的試算表，**不需要** Google Cloud OAuth Client ID / Secret。

---

## 管理者怎麼用

1. 開啟 `/login`
2. 在「永和區管理者登入」輸入允許的 Gmail（預設 `yongheelderly0826@gmail.com`）
3. 按 **以管理者進入**
4. 進入 `/dashboard` 管理個案、派案、匯入、報表

同一 Google 帳號也可直接開啟試算表檢視／編輯：  
https://docs.google.com/spreadsheets/d/17obWeUCT6HXSBD59Hnb2fsrCZdXHzZE0cT0jykjuquY/edit

---

## 允許登入的帳號

`.env.local`：

```env
GOOGLE_ALLOWED_EMAILS=yongheelderly0826@gmail.com
GOOGLE_OWNER_EMAILS=yongheelderly0826@gmail.com
```

新增承辦人：在 `GOOGLE_ALLOWED_EMAILS` 用逗號加上其 Gmail，重新啟動即可。

---

## 登入後可管理

| 功能 | 路徑 |
|------|------|
| 個案名冊 | `/manager/cases` |
| 派案 | `/manager/assignments` |
| CSV 匯入 | `/manager/import` |
| 衛福部匯出 | `/manager/exports` |
| KPI 報表 | `/manager/kpi` |

資料來源：GAS → Google Sheets（`GAS_WEB_APP_URL`）。
