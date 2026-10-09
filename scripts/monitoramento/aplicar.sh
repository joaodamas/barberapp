#!/usr/bin/env bash
# Aplica o monitoramento do Topete num projeto do Google Cloud (Cloud Monitoring).
#
#   scripts/monitoramento/aplicar.sh --project axon-barber \
#       --email <seu-email> --dominio osiqueira.jpproject.com.br
#
# O que faz (idempotente: pode rodar de novo, ele reaproveita ou atualiza):
#   1. canal de notificação por e-mail (reaproveita se já existir, pelo nome);
#   2. três políticas de alerta baseadas em log (erro nas functions, erro no
#      site, alerta da plataforma);
#   3. verificação de disponibilidade de https://<dominio>/api/health, de 5 em
#      5 minutos, e a política que avisa quando falha em 2 ou mais regiões.
#
# Quem roda precisa de permissão de editor de Monitoring no projeto
# (roles/monitoring.editor) e do gcloud autenticado. Veja docs/MONITORAMENTO.md.
# Com --dry-run, só mostra o que mudaria (as consultas de leitura ainda rodam).
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJETO=""
EMAIL=""
DOMINIO=""
SECO=0

NOME_CANAL="Topete · e-mail de alertas"
NOME_UPTIME_PREFIXO="Topete · /api/health"

uso() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJETO="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --dominio) DOMINIO="${2:-}"; shift 2 ;;
    --dry-run) SECO=1; shift ;;
    -h|--help) uso 0 ;;
    *) echo "argumento desconhecido: $1" >&2; uso 2 ;;
  esac
done

[ -n "$PROJETO" ] || { echo "faltou --project" >&2; uso 2; }
[ -n "$EMAIL" ] || { echo "faltou --email" >&2; uso 2; }
[ -n "$DOMINIO" ] || { echo "faltou --dominio (ex.: osiqueira.jpproject.com.br)" >&2; uso 2; }
command -v gcloud >/dev/null || { echo "gcloud não encontrado no PATH" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl não encontrado no PATH" >&2; exit 1; }

FEITO=()
anotar() { FEITO+=("$1"); echo "• $1"; }

# Executa (ou só mostra, no --dry-run) um comando que ALTERA algo.
alterar() {
  if [ "$SECO" = 1 ]; then echo "  [dry-run] $*" >&2; return 0; fi
  "$@"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Projeto: $PROJETO · domínio: $DOMINIO$([ "$SECO" = 1 ] && echo ' (dry-run)')"

# ── 0. APIs ──────────────────────────────────────────────────────────────
alterar gcloud services enable monitoring.googleapis.com logging.googleapis.com --project "$PROJETO" --quiet
anotar "APIs de Monitoring e Logging ativas"

# ── 1. Canal de e-mail ───────────────────────────────────────────────────
CANAL="$(gcloud beta monitoring channels list --project "$PROJETO" \
  --filter="displayName=\"$NOME_CANAL\" AND type=\"email\"" --format="value(name)" | head -n1 | tr -d '\r')"
if [ -n "$CANAL" ]; then
  # Reaproveita, mas garante que o endereço é o pedido.
  alterar gcloud beta monitoring channels update "$CANAL" --project "$PROJETO" \
    --channel-labels="email_address=$EMAIL" --quiet >/dev/null
  anotar "canal de e-mail reaproveitado: $CANAL"
else
  if [ "$SECO" = 1 ]; then
    CANAL="projects/$PROJETO/notificationChannels/ID-DO-DRY-RUN"
    echo "  [dry-run] gcloud beta monitoring channels create ..." >&2
  else
    CANAL="$(gcloud beta monitoring channels create --project "$PROJETO" \
      --display-name="$NOME_CANAL" --type=email \
      --channel-labels="email_address=$EMAIL" --format="value(name)" | tr -d '\r')"
  fi
  anotar "canal de e-mail criado: $CANAL"
fi

# ── Políticas ────────────────────────────────────────────────────────────
# $1 = arquivo-modelo, $2 = nome exibido (displayName), $3 = ID da verificação (opcional)
aplicar_politica() {
  local modelo="$1" nome="$2" check_id="${3:-}"
  local saida="$TMP/$(basename "$modelo")"
  sed -e "s|__CANAL__|$CANAL|g" -e "s|__DOMINIO__|$DOMINIO|g" -e "s|__CHECK_ID__|$check_id|g" "$modelo" > "$saida"

  local existente
  existente="$(gcloud alpha monitoring policies list --project "$PROJETO" \
    --filter="displayName=\"$nome\"" --format="value(name)" | head -n1 | tr -d '\r')"
  if [ -n "$existente" ]; then
    alterar gcloud alpha monitoring policies update "$existente" --project "$PROJETO" \
      --policy-from-file="$saida" --quiet >/dev/null
    anotar "política atualizada: $nome"
  else
    alterar gcloud alpha monitoring policies create --project "$PROJETO" \
      --policy-from-file="$saida" --quiet >/dev/null
    anotar "política criada: $nome"
  fi
}

aplicar_politica "$AQUI/politica-erro-functions.json" "Topete · erro nas functions"
aplicar_politica "$AQUI/politica-erro-site.json" "Topete · erro no site"
aplicar_politica "$AQUI/politica-alerta-plataforma.json" "Topete · alerta da plataforma"

# ── 3. Verificação de disponibilidade (API REST: o gcloud não cobre bem) ─
NOME_UPTIME="$NOME_UPTIME_PREFIXO ($DOMINIO)"
TOKEN="$(gcloud auth print-access-token | tr -d '\r')"
API="https://monitoring.googleapis.com/v3"

# A API devolve JSON formatado, um campo por linha: o `name` vem antes do
# `displayName` de cada verificação. Sem depender de jq/python.
LISTA="$(curl -sS -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJETO" \
  "$API/projects/$PROJETO/uptimeCheckConfigs")"
UPTIME="$(printf '%s\n' "$LISTA" | awk -v alvo="$NOME_UPTIME" '
  /^ *"name":/ { n=$0; sub(/^ *"name": *"/, "", n); sub(/",? *$/, "", n) }
  /^ *"displayName":/ { d=$0; sub(/^ *"displayName": *"/, "", d); sub(/",? *$/, "", d); if (d == alvo) { print n; exit } }
')"

if [ -n "$UPTIME" ]; then
  anotar "verificação de disponibilidade reaproveitada: $UPTIME"
else
  CORPO="{\"displayName\":\"$NOME_UPTIME\",\"monitoredResource\":{\"type\":\"uptime_url\",\"labels\":{\"project_id\":\"$PROJETO\",\"host\":\"$DOMINIO\"}},\"httpCheck\":{\"path\":\"/api/health\",\"port\":443,\"useSsl\":true,\"validateSsl\":true,\"requestMethod\":\"GET\",\"acceptedResponseStatusCodes\":[{\"statusClass\":\"STATUS_CLASS_2XX\"}]},\"period\":\"300s\",\"timeout\":\"20s\"}"
  if [ "$SECO" = 1 ]; then
    echo "  [dry-run] POST $API/projects/$PROJETO/uptimeCheckConfigs" >&2
    UPTIME="projects/$PROJETO/uptimeCheckConfigs/ID-DO-DRY-RUN"
  else
    RESP="$(curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJETO" \
      -H "Content-Type: application/json" -d "$CORPO" "$API/projects/$PROJETO/uptimeCheckConfigs")"
    UPTIME="$(printf '%s\n' "$RESP" | awk '/^ *"name":/ { n=$0; sub(/^ *"name": *"/, "", n); sub(/",? *$/, "", n); print n; exit }')"
    if [ -z "$UPTIME" ]; then
      echo "falha ao criar a verificação de disponibilidade:" >&2
      printf '%s\n' "$RESP" >&2
      exit 1
    fi
  fi
  anotar "verificação de disponibilidade criada: $UPTIME"
fi

CHECK_ID="${UPTIME##*/}"
aplicar_politica "$AQUI/politica-site-fora-do-ar.json" "Topete · site fora do ar" "$CHECK_ID"

# ── Resumo ───────────────────────────────────────────────────────────────
echo
echo "Pronto$([ "$SECO" = 1 ] && echo ' (dry-run: nada foi alterado)'). Resumo:"
for linha in "${FEITO[@]}"; do echo "  - $linha"; done
echo
echo "Para testar: docs/MONITORAMENTO.md, seção \"Como testar\"."
