#!/bin/sh
# PNGs da marca a partir dos SVGs, pelo Chrome sem janela (fundo transparente).
cd "$(dirname "$0")"
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
png() { "$C" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --force-device-scale-factor="$4" --window-size="$2,$3" --screenshot="$PWD/png/${1%.svg}.png" "file://$PWD/$1" >/dev/null 2>&1; }
rm -rf png && mkdir -p png
png topete-mascote.svg 512 512 2
png topete-icone-app.svg 512 512 2
png topete-selo-perfil.svg 1080 1080 1
png topete-logo-escuro.svg 1000 300 2
png topete-logo-claro.svg 1000 300 2
png topete-logo-escuro-transparente.svg 1000 300 2
