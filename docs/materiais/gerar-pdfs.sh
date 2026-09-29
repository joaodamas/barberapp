#!/bin/sh
# PDFs dos materiais do Topete, pelo Chrome sem janela. Saem nesta pasta.
cd "$(dirname "$0")"
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for f in "$@"; do
  "$C" --headless=new --disable-gpu --allow-file-access-from-files --no-pdf-header-footer \
    --virtual-time-budget=4000 --print-to-pdf="$PWD/${f%.html}.pdf" "file://$PWD/$f" >/dev/null 2>&1
  echo "$f → ${f%.html}.pdf"
done
