#!/usr/bin/env bash
# 推送 GAS 原始碼至 Google Apps Script
set -euo pipefail
cd "$(dirname "$0")/../gas"

if [[ ! -f .clasp.json ]]; then
  echo "Error: gas/.clasp.json not found. Copy from .clasp.json.example and set scriptId."
  exit 1
fi

npx clasp push
# 預設更新 .env.local 正在使用的 Web App deployment（若存在）
LIVE_DEPLOYMENT="${GAS_LIVE_DEPLOYMENT_ID:-AKfycbzbzfRQxCldIjA_oZeBlNfo3hutvTtBgAwX89ERCRuJfq7jozGipwLkkvyd6bRbq-LX}"
npx clasp deploy -i "$LIVE_DEPLOYMENT" -d "deploy-$(date +%Y%m%d-%H%M)"
echo "✓ GAS pushed + redeployed $LIVE_DEPLOYMENT"
