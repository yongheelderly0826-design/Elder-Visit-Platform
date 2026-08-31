# 客戶一鍵安裝包（懶人包）

## 最快用法（一次到位）

第一次在這台電腦：

```bash
npm run gas:login
npx vercel login
```

`.env.local` 放好 `GH_TOKEN`。之後每案只要：

```bash
npm run install:oneclick -- --district 板橋區 --email office@gmail.com
```

或開 Web 精靈（只需行政區 + Gmail）：

```bash
npm run dev
# http://localhost:3000/installer
```

會自動完成：私有 GitHub 倉庫、試算表、GAS Web App、Vercel、交接包。

## v2 · GitHub 私有倉庫

`.env.local`：

```env
GH_TOKEN=ghp_xxxxxxxx
```

樣板倉庫請勾選 **Template repository**。

詳見 [`docs/product/installer-kit.md`](../docs/product/installer-kit.md)。
