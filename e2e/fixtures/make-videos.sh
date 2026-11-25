#!/usr/bin/env bash
# E2E 用の合成動画を作る（要 ffmpeg）。
#   combo.webm   … 評価用: 1.0s 横移動 / 3.0s 斜め移動 / 5.0s 縦移動
#   train-a/b    … 学習用: 同じ 3 種類の動きを、位置・速さ・背景を変えて収録
set -euo pipefail
cd "$(dirname "$0")"
make() { # name bg x0 speed
  local name=$1 bg=$2 x0=$3 sp=$4
  ffmpeg -loglevel error -y -f lavfi -i "color=c=$bg:s=1280x720:d=7:r=30" \
    -f lavfi -i color=c=0xd05050:s=120x260:d=7:r=30 -f lavfi -i color=c=0x5080d0:s=120x260:d=7:r=30 \
    -filter_complex "[0][1]overlay=x='if(between(t,1,1.5),$x0+(t-1)*$sp,if(between(t,3,3.6),$x0+(t-3)*$sp*0.8,$x0))':y='if(between(t,3,3.6),380-(t-3)*300,if(between(t,5,5.4),380-(t-5)*600,380))'[a];[a][2]overlay=x=800:y=380,drawbox=x=0:y=0:w=1280:h=80:color=0x303848:t=fill" \
    -c:v libvpx -b:v 1M -t 7 "$name.webm"
}
make combo 0x1a2030 350 500
make train-a 0x1c1f2a 300 560
make train-b 0x20242c 400 450
