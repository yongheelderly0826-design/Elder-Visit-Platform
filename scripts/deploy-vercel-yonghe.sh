#!/usr/bin/env bash
# 用 yongheelderly0826@gmail.com 帳號部署到 Vercel
# 使用前請先執行：npx vercel login  （選 Google，登入 yongheelderly0826@gmail.com）

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.local ]]; then
  echo "缺少 .env.local，請先建立 GAS 環境變數檔"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

VERCEL="npx --yes vercel@latest"
PROJECT="elder-visit-platform"
APP_URL="https://${PROJECT}.vercel.app"

echo "=== 確認 Vercel 帳號 ==="
$VERCEL whoami

echo "=== 解除舊專案連結（若存在）==="
rm -rf .vercel

echo "=== 連結新 Vercel 專案 ==="
$VERCEL link --yes --project "$PROJECT" 2>&1 || $VERCEL link --yes

add_env() {
  local key="$1"
  local val="$2"
  for env in production preview development; do
    printf '%s' "$val" | $VERCEL env add "$key" "$env" --yes 2>/dev/null || true
  done
}

echo "=== 設定環境變數 ==="
add_env "GAS_WEB_APP_URL" "$GAS_WEB_APP_URL"
add_env "GAS_API_TOKEN" "$GAS_API_TOKEN"
add_env "GAS_WORKSPACE_ID" "$GAS_WORKSPACE_ID"
add_env "GAS_SPREADSHEET_ID" "$GAS_SPREADSHEET_ID"
add_env "GOOGLE_ALLOWED_EMAILS" "$GOOGLE_ALLOWED_EMAILS"
add_env "GOOGLE_OWNER_EMAILS" "$GOOGLE_OWNER_EMAILS"
add_env "NEXT_PUBLIC_APP_URL" "$APP_URL"

echo "=== 部署到 Production ==="
$VERCEL --prod --yes

echo ""
echo "完成！請開啟：$APP_URL/login"
