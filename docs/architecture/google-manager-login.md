# 永和區管理者登入（不需 OAuth、不需 Vercel）

兩位同事都使用同一組帳號：

- GitHub：`yongheelderly0826-design`
- Google／登入：`yongheelderly0826@gmail.com`

營運資料只有一份（Google 試算表）；網站各自本機跑。完整步驟見：  
[`shared-local-team.md`](./shared-local-team.md)

---

## 管理者怎麼用

1. 本機執行 `npm run dev`
2. 開啟 http://localhost:3000/login
3. 輸入 `yongheelderly0826@gmail.com` → **以管理者進入**
4. 進入 `/dashboard` 管理個案、派案、匯入、報表

同一 Google 帳號也可直接開啟試算表：  
https://docs.google.com/spreadsheets/d/17obWeUCT6HXSBD59Hnb2fsrCZdXHzZE0cT0jykjuquY/edit

---

## 允許登入的帳號

`.env.local`：

```env
GOOGLE_ALLOWED_EMAILS=yongheelderly0826@gmail.com
GOOGLE_OWNER_EMAILS=yongheelderly0826@gmail.com
```

兩人共用同一帳號時，不必再加其他 Gmail。

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
