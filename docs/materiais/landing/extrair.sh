#!/bin/sh
# Telas e vídeos REAIS da landing (02/10/2026), extraídos das gravações do app com a
# barbearia fictícia "Navalha" (workflow tour-demo, PR #111) e dos vídeos do Topete.
# Fontes (fora do repo, na Mesa do dono):
#   ~/Desktop/Topete/app-real/tour-demo/scripts/tour-demo/saida/  (celular 780×1328, computador 2880×1800)
#   ~/Desktop/Topete/videos/TOUR-v2-computador-e-celular.mp4
#   ~/Desktop/Topete/cartoons/antes-zona-segura/K{3,6}-*.mp4 e cartoons/K1-*.mp4
# Saída: web/src/assets/landing/*.jpg (next/image gera os tamanhos) e web/public/landing/*.mp4|webp
set -e
cd "$(dirname "$0")/../../.."
SRC="$HOME/Desktop/Topete/app-real/tour-demo/scripts/tour-demo/saida"
IMG=web/src/assets/landing; PUB=web/public/landing
mkdir -p "$IMG" "$PUB"
q() { # quadro <arquivo> <segundos> <saída> <largura>
  ffmpeg -nostdin -v error -y -ss "$2" -i "$SRC/$1.mp4" -frames:v 1 -vf "scale=$4:-2:flags=lanczos" -q:v 3 "$IMG/$3.jpg"
}
# Celular (cliente e barbeiro)
q celular__agendar 4.5 cel-agendar-servicos 780
q celular__agendar 11.6 cel-agendar-horario 780
q celular__encaixe 2.5 cel-encaixe-pedido 780
q celular__encaixe 5.0 cel-encaixe-aprovado 780
q celular__concluir-atendimento 9.5 cel-pagamento 780
q celular__hoje 0.8 cel-hoje 780
q celular__mensalistas 0.8 cel-mensalistas 780
q celular__dre 0.8 cel-quanto-sobrou 780
q celular__projecao 0.8 cel-projecao 780
q celular__avisos 0.8 cel-avisos 780
# Computador (painel do dono), 1440×900 em 2x → 1800 de largura basta
q computador__agenda 0.8 pc-agenda 1800
q computador__hoje 0.8 pc-hoje 1800
q computador__mensalistas 0.8 pc-mensalistas 1800
q computador__dre 0.8 pc-quanto-sobrou 1800
q computador__projecao 0.8 pc-projecao 1800
# Tour narrado 16:9 (55 s, com som) — 720p, faststart
ffmpeg -nostdin -v error -y -i "$HOME/Desktop/Topete/videos/TOUR-v2-computador-e-celular.mp4" -vf "scale=1280:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -profile:v high -crf 25 -preset slow -c:a aac -b:a 96k -movflags +faststart "$PUB/tour.mp4"
ffmpeg -nostdin -v error -y -ss 1.5 -i "$PUB/tour.mp4" -frames:v 1 -q:v 4 "$PUB/tour-capa.jpg"
# Cartoons "Sem × Com Topete" — 540×960, com a narração
# K1 só existe na versão já ajustada à zona segura do Reels; K3 e K6 na versão original (cena maior).
for k in K1-whatsapp-que-nao-para K3-fim-do-dia K6-da-pra-pagar-o-aluguel; do
  ORIG="$HOME/Desktop/Topete/cartoons/antes-zona-segura/$k.mp4"; [ -f "$ORIG" ] || ORIG="$HOME/Desktop/Topete/cartoons/$k.mp4"
  ffmpeg -nostdin -v error -y -i "$ORIG" -vf "scale=540:-2:flags=lanczos,format=yuv420p" \
    -c:v libx264 -profile:v high -crf 27 -preset slow -c:a aac -b:a 80k -movflags +faststart "$PUB/${k%%-*}.mp4"
  ffmpeg -nostdin -v error -y -ss 0.3 -i "$PUB/${k%%-*}.mp4" -frames:v 1 -q:v 4 "$PUB/${k%%-*}-capa.jpg"
done
du -sh "$IMG" "$PUB"
