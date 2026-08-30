#!/usr/bin/env bash
# 永和區訪查平台 — Google 端一鍵設定指引
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GAS_DIR="$ROOT/gas"

echo "============================================"
echo " 永和區訪查平台 — Google Sheets + GAS 設定"
echo "============================================"
echo ""

# Step 1: clasp login
if ! npx clasp list &>/dev/null; then
  echo "【步驟 1】請先登入 Google（需 yongheelderly0826-design 綁定的 Gmail）"
  echo "  執行：cd $GAS_DIR && npx clasp login"
  echo ""
  echo "  登入後再執行本腳本。"
  echo ""
  read -rp "按 Enter 開啟 clasp login..." _
  cd "$GAS_DIR" && npx clasp login
else
  echo "✓ clasp 已登入 Google"
fi

# Step 2: create or link GAS project
cd "$GAS_DIR"
if [[ ! -f .clasp.json ]]; then
  echo ""
  echo "【步驟 2】建立 GAS 專案..."
  npx clasp create --type standalone --title "永和區訪查平台 GAS" --rootDir src
  echo "✓ GAS 專案已建立"
else
  echo "✓ GAS 專案已連結（.clasp.json 存在）"
fi

# Step 3: push code
echo ""
echo "【步驟 3】推送 GAS 原始碼..."
npx clasp push
echo "✓ 原始碼已推送"

# Step 4: bootstrap (create spreadsheet)
echo ""
echo "【步驟 4】建立試算表並初始化 Tab..."
echo "  執行 bootstrapPlatform()..."
RESULT=$(npx clasp run bootstrapPlatform 2>&1 || true)
echo "$RESULT"

# Step 5: deploy web app
echo ""
echo "【步驟 5】部署 Web App..."
echo "  請在 Apps Script 編輯器手動部署："
echo "  https://script.google.com → 開啟「永和區訪查平台 GAS」"
echo "  → 部署 → 新增部署 → Web App"
echo "  → 執行身分：我 ｜ 存取：任何人"
echo ""
echo "  或使用：npx clasp deploy --description 'v1.0.0'"
echo ""

# Step 6: env.local template
ENV_LOCAL="$ROOT/.env.local"
if [[ ! -f "$ENV_LOCAL" ]]; then
  cat > "$ENV_LOCAL" <<'EOF'
# GAS Backend
GAS_WEB_APP_URL=
GAS_API_TOKEN=
GAS_WORKSPACE_ID=WS-YH-115
EOF
  echo "✓ 已建立 .env.local 範本（請填入 Web App URL 與 API Token）"
fi

echo ""
echo "============================================"
echo " 完成！請查看上方 bootstrapPlatform 輸出："
echo "  - spreadsheet_url  → 試算表連結"
echo "  - api_token        → 填入 .env.local"
echo "============================================"
