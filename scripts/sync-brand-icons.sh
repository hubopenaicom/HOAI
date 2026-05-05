#!/usr/bin/env bash
# 在 chat 目录下由 build.sh 调用：同步品牌图标，避免只改 public 却未改打包用 assets
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$ROOT/chat/public"
AST="$ROOT/chat/src/assets"
if [[ -f "$PUB/favicon.ico" ]]; then
  cp -f "$PUB/favicon.ico" "$AST/favicon.ico"
fi
