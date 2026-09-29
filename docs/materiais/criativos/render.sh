#!/bin/sh
# PNG de cada criativo no tamanho exato (lido do style do body).
cd "$(dirname "$0")"
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEST="${1:-$HOME/Desktop/Topete/criativos}"; mkdir -p "$DEST"
for f in 0*.html; do
  w=$(grep -o 'width:[0-9]*px' "$f" | head -1 | tr -dc 0-9); h=$(grep -o 'height:[0-9]*px' "$f" | head -1 | tr -dc 0-9)
  "$C" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
    --window-size="$w,$h" --virtual-time-budget=3000 --screenshot="$DEST/${f%.html}.png" "file://$PWD/$f" >/dev/null 2>&1
  echo "${f%.html}.png ${w}x${h}"
done
