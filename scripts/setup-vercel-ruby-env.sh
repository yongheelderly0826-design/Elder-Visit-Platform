#!/usr/bin/env bash
# 為 elder-visit-platform-ruby（yongheelderly0826 帳號）設定環境變數並部署
# 使用前：npx vercel login → 用 Google 登入 yongheelderly0826@gmail.com

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.local ]]; then
  echo "缺少 .env.local"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

VERCEL="npx --yes vercel@latest"
SCOPE="yongheelderly0826-design"
PROJECT="elder-visit-platform"
APP_URL="https://elder-visit-platform-ruby.vercel.app"

echo "=== Vercel 帳號 ==="
$VERCEL whoami

echo "=== 連結專案 $SCOPE/$PROJECT ==="
rm -rf .vercel
$VERCEL link --yes --scope "$SCOPE" --project "$PROJECT"

add_env() {
  local key="$1"
  local val="$2"
  for env in production preview development; do
    echo "  $key → $env"
    printf '%s' "$val" | $VERCEL env add "$key" "$env" --scope "$SCOPE" --yes 2>/dev/null || true
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

echo "=== 重新部署 ==="
$VERCEL --prod --yes --scope "$SCOPE"

echo ""
echo "完成：$APP_URL/login"
