# 客戶一鍵安裝包（Installer Kit）

> 把「Gmail → Google Sheet + GAS → Vercel → 交接」做成可複製的標準產品流程。

## 快速開始

```bash
# 1. 複製客戶設定檔
cp installer/client.config.example.json installer/clients/新北某區-115.json
# 編輯 clientName、district、allowedEmails、vercel 等欄位

# 2. 一次性登入
npm run gas:login
npx vercel login    # 若需自動部署 Vercel

# 3. 執行安裝
npm run install:client -- --config installer/clients/新北某區-115.json

# 4. 依畫面完成 GAS Web App 部署後
npm run install:client -- --config installer/clients/新北某區-115.json --resume
```

## 產出物

| 檔案 | 說明 |
|------|------|
| `installer/output/<clientId>/handoff.md` | 交付客戶的交接清單 |
| `installer/output/<clientId>/credentials.json` | 機密（Token、試算表 ID）— 勿 commit |
| `.env.local` | 本機／部署用環境變數 |

## 目錄

```
installer/
├── client.config.example.json   # 客戶設定範本
├── clients/                     # 各客戶設定（*.json，可 gitignore 敏感欄位）
└── output/                      # 安裝產出（已 gitignore）
```

詳細商業流程見 [`docs/product/installer-kit.md`](../docs/product/installer-kit.md)。
