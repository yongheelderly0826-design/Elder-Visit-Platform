#!/usr/bin/env bash
# 初始化 Google Sheets 結構（需先設定 gas/.clasp.json 與 Script Properties）
set -euo pipefail
cd "$(dirname "$0")/../gas"

if [[ ! -f .clasp.json ]]; then
  echo "Error: gas/.clasp.json not found."
  exit 1
fi

clasp run initSpreadsheet
echo "✓ Spreadsheet tabs initialized."
