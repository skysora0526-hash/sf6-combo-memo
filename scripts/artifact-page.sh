#!/usr/bin/env bash
# claude.ai の Artifact 用エントリーページを作る（<html>/<head> は公開時に付与されるため本文だけ）
# 使い方: scripts/artifact-page.sh <distDir> <title> <outFile>
set -euo pipefail
DIR=$1; TITLE=$2; OUT=$3
JS=$(cd "$DIR" && ls assets/index-*.js); CSS=$(cd "$DIR" && ls assets/index-*.css)
cat > "$DIR/$OUT" <<HTML
<title>$TITLE</title>
<meta name="theme-color" content="#0a0b0f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&display=swap">
<link rel="stylesheet" href="$CSS">
<style>:root{color-scheme:dark}body{background:#0a0b0f;color:#e9ecf2}</style>
<div id="root"></div>
<script type="module" src="$JS"></script>
HTML
