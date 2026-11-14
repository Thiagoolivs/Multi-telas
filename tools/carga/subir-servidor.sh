#!/usr/bin/env bash
# tools/carga/subir-servidor.sh — sobe o servidor de medida, LOCAL, numa porta.
#
#   tools/carga/subir-servidor.sh <porta> <pasta-de-dados> [url-do-postgres]
#
# Sem URL: o driver local (SQLite em <pasta>). Com URL: Postgres. A sonda
# (sonda.cjs) grava <pasta>/sonda.jsonl; o log vai para <pasta>/servidor.log.
# Nada sai para a rede: sem chave de IA, sem e-mail, sem a busca do APK.
set -euo pipefail
PORTA="$1"; PASTA="$2"; PG="${3:-}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$PASTA/media"
cd "$RAIZ"
export PORT="$PORTA" STORAGE=local DATA_DIR="$PASTA" MEDIA_DIR="$PASTA/media"
export SKIP_VERIFY=1 AI_PROVIDER=dev MT_APK_REPO=desligado ALERTA_OFFLINE=0
# TRUST_PROXY=1: o gerador manda X-Forwarded-For para simular escritórios (IPs) diferentes.
export TRUST_PROXY="${TRUST_PROXY:-1}" RAILWAY_ENVIRONMENT= NODE_ENV=
export SONDA_ARQ="$PASTA/sonda.jsonl"
unset ANTHROPIC_API_KEY OPENAI_API_KEY RESEND_API_KEY BREVO_API_KEY ASAAS_API_KEY PIXABAY_API_KEY GITHUB_TOKEN || true
if [ -n "$PG" ]; then export DATABASE_URL="$PG" PGSSL=disable; else export DATABASE_URL=; fi
exec node --require ./tools/carga/sonda.cjs server.js >> "$PASTA/servidor.log" 2>&1
