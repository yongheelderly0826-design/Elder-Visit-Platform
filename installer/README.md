# 客戶一鍵安裝包（Installer Kit）

## v2 · GitHub 私有倉庫

在 `.env.local` 設定：

```env
GH_TOKEN=ghp_xxxxxxxx
```

在 `client.config.json` 啟用：

```json
"github": {
  "enabled": true,
  "org": "yongheelderly0826-design",
  "templateRepo": "yongheelderly0826-design/Elder-Visit-Platform",
  "repoName": "elder-visit-banqiao-115",
  "private": true
}
```

> 樣板倉庫需在 GitHub Settings → 勾選 **Template repository**。

## v3 · Web 安裝精靈

```bash
# .env.local
INSTALLER_ENABLED=true
INSTALLER_RUNNER=local
GH_TOKEN=ghp_xxx

npm run dev
# 開啟 http://localhost:3000/installer
```

流程：填表 → 自動建 GitHub 私有 repo → GAS + 試算表 → 等待貼 GAS Web App URL → Vercel + 交接包。

## CLI（仍可用）

```bash
npm run install:client -- --config installer/clients/demo.json
```

詳見 [`docs/product/installer-kit.md`](../docs/product/installer-kit.md)。
