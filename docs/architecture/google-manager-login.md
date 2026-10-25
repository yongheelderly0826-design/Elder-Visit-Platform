# 永和區管理者登入（不需 OAuth、不需 Vercel）

兩位同事都使用同一組帳號：

- GitHub：`yongheelderly0826-design`
- Google／登入：`yongheelderly0826@gmail.com`

營運資料只有一份（Google 試算表）；網站各自本機跑。完整步驟見：  
[`shared-local-team.md`](./shared-local-team.md)

---

## 管理者怎麼用

1. 本機執行 `npm run dev`
2. 開啟 http://localhost:3000/yonghe（此頁不公開顯示於首頁／訪員登入）
3. **紙本 KEY（多人）**：輸入 `DESK_SHARED_PASSCODE` → 進 `/desk/care-forms`（不必個人 Gmail）
4. **完整後台**：輸入授權 Gmail → **以管理者進入** → `/dashboard`

正式站：https://elder-visit-platform-ruby.vercel.app/yonghe

同一 Google 帳號也可直接開啟試算表：  
https://docs.google.com/spreadsheets/d/17obWeUCT6HXSBD59Hnb2fsrCZdXHzZE0cT0jykjuquY/edit

---

## 允許登入的帳號

`.env.local`／Vercel Environment Variables：

```env
GOOGLE_ALLOWED_EMAILS=yongheelderly0826@gmail.com
GOOGLE_OWNER_EMAILS=yongheelderly0826@gmail.com
DESK_SHARED_PASSCODE=（請自訂；里責輪班 KEY 單用）
```

- 完整後台：可多人輪流用同一組授權 Gmail（不必每人一組）。
- 紙本建檔：設好通行碼後，多人開同一 `/yonghe` 輸入通行碼即可，不必登入 Gmail。

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
