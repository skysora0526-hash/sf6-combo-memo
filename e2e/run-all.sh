#!/usr/bin/env bash
# ビルド（一般向け + 開発者向け）→ プレビュー起動 → Phase 1〜5 の E2E
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-4173}
SPORT=${STUDIO_PORT:-4174}
npm run build >/dev/null
npm run build:studio >/dev/null
npx vite preview --port "$PORT" --strictPort >/dev/null 2>&1 &
S1=$!
npx vite preview --outDir dist-studio --port "$SPORT" --strictPort >/dev/null 2>&1 &
S2=$!
trap 'kill $S1 $S2 2>/dev/null' EXIT
for p in "$PORT" "$SPORT"; do for _ in $(seq 1 40); do curl -sf "http://localhost:$p/" >/dev/null && break; sleep 0.25; done; done
mkdir -p e2e/screenshots
for f in e2e/phase1.cjs e2e/phase2.cjs e2e/phase3.cjs e2e/phase4.cjs; do
  echo "▶ $f"
  node "$f" "http://localhost:$PORT/"
done
echo "▶ e2e/phase5.cjs"
node e2e/phase5.cjs "http://localhost:$PORT/" "http://localhost:$SPORT/" dist
