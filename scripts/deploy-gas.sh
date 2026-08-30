#!/usr/bin/env bash
# 推送 GAS 原始碼至 Google Apps Script
set -euo pipefail
cd "$(dirname "$0")/../gas"

if [[ ! -f .clasp.json ]]; then
  echo "Error: gas/.clasp.json not found. Copy from .clasp.json.example and set scriptId."
  exit 1
fi

clasp push
echo "✓ GAS pushed. Redeploy Web App in Apps Script if entry points changed."
