#!/usr/bin/env bash
# ビルド → プレビューサーバー起動 → Phase 1〜3 の E2E を実行
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-4173}
npm run build >/dev/null
npx vite preview --port "$PORT" --strictPort >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for _ in $(seq 1 40); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.25; done
mkdir -p e2e/screenshots
for f in e2e/phase1.cjs e2e/phase2.cjs e2e/phase3.cjs e2e/phase4.cjs; do
  echo "▶ $f"
  node "$f" "http://localhost:$PORT/"
done
