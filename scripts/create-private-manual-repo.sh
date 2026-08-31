#!/usr/bin/env bash
# 在 yongheelderly0826-design 建立「私有」操作說明書倉庫
# 使用前：gh auth login → 登入 yongheelderly0826-design 帳號

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$ROOT/docs/系統操作說明書.md" "$TMP/README.md"
cd "$TMP"
git init -b main
git add README.md
git commit -m "永和區獨居長者訪查管理平台 — 系統操作說明書"

REPO="yongheelderly0826-design/Elder-Visit-操作說明書"
gh repo create "$REPO" \
  --private \
  --description "永和區獨居長者訪查管理平台 — 系統操作說明書（不公開）" \
  --source . \
  --remote origin \
  --push

echo ""
echo "完成（私有）：https://github.com/$REPO"
