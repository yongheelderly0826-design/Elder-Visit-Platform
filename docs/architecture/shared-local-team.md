# 永和兩人共用（不需 Vercel）

兩位同事都使用同一組帳號：

| 用途 | 帳號 |
|------|------|
| GitHub 程式碼 | `yongheelderly0826-design` |
| Google 試算表／GAS | `yongheelderly0826@gmail.com` |
| 網站登入 | `yongheelderly0826@gmail.com` |

**公開入口（GitHub Pages）**  
https://yongheelderly0826-design.github.io/Elder-Visit-Platform/

**資料只有一份**：Google 試算表  
**完整後台**：各自電腦本機跑 `npm run dev`（不部署 Vercel）

```
同事 A 本機 npm run dev  ──┐
                            ├──→ 同一組 GAS API ──→ 同一份 Google Sheet
同事 B 本機 npm run dev  ──┘
```

---

## 每人電腦第一次設定（約 10 分鐘）

### 1. 登入同一個 GitHub 帳號並下載程式

```bash
gh auth login
# 選 yongheelderly0826-design

git clone https://github.com/yongheelderly0826-design/Elder-Visit-Platform.git
cd Elder-Visit-Platform
npm install
```

### 2. 建立 `.env.local`（兩人內容相同）

複製範本後填入（跟開發機相同的 GAS 設定）：

```env
GAS_WEB_APP_URL=（開發機 .env.local 同一組）
GAS_API_TOKEN=（開發機 .env.local 同一組）
GAS_WORKSPACE_ID=WS-YH-115
GAS_SPREADSHEET_ID=17obWeUCT6HXSBD59Hnb2fsrCZdXHzZE0cT0jykjuquY

GOOGLE_ALLOWED_EMAILS=yongheelderly0826@gmail.com
GOOGLE_OWNER_EMAILS=yongheelderly0826@gmail.com
```

> `.env.local` 不要推上 GitHub。用內部訊息／共用資料夾傳給第二位同事即可。

### 3. 啟動網站

```bash
npm run dev
```

瀏覽器開：http://localhost:3000/login  
輸入：`yongheelderly0826@gmail.com` → **以管理者進入**

### 4. 直接看／改資料（可選）

用同一個 Google 帳號開試算表：  
https://docs.google.com/spreadsheets/d/17obWeUCT6HXSBD59Hnb2fsrCZdXHzZE0cT0jykjuquY/edit

---

## 之後如何同步更新

開發者改完程式並 `git push` 後，兩位同事在各自電腦執行：

```bash
cd Elder-Visit-Platform
git pull
npm install
npm run dev
```

試算表與 GAS **不用換**，兩邊立刻共用最新資料。

---

## 注意事項

1. **不要**把 `localhost` 網址傳給對方當「線上網站」——只能在自己電腦開。
2. 兩人可同時開網站；寫入都進同一份試算表，請避免同時改同一列。
3. 登入是允許清單制（同一 Gmail），不是真正 Google OAuth；請保管好帳號與 `.env.local`。
4. 若之後需要「不開電腦也能上網開」，再另選 Cloudflare 等方案；目前依需求採本機雙人模式。
