#!/usr/bin/env bash
# =====================================================================
# FUNecob — funções compartilhadas pelos scripts de deploy.
# Escopo EXCLUSIVO do FUNecob (projeto compose "funecob").
# =====================================================================
set -euo pipefail

FUNECOB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_PROJECT="funecob"
COMPOSE_FILE="${FUNECOB_ROOT}/docker-compose.yml"
ENV_FILE="${FUNECOB_ROOT}/.env"
NETWORK_NAME="funecob_network"
BACKUP_DIR="${FUNECOB_ROOT}/backups"

C_RESET='\033[0m'; C_RED='\033[0;31m'; C_GREEN='\033[0;32m'
C_YEL='\033[0;33m'; C_BLUE='\033[0;34m'; C_BOLD='\033[1m'

log()  { echo -e "${C_BLUE}[funecob]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}[OK]${C_RESET}   $*"; }
warn() { echo -e "${C_YEL}[AVISO]${C_RESET} $*"; }
err()  { echo -e "${C_RED}[ERRO]${C_RESET} $*" >&2; }
die()  { err "$*"; exit 1; }
title(){ echo -e "\n${C_BOLD}== $* ==${C_RESET}"; }

# Todo comando docker compose passa por aqui: sempre o projeto "funecob".
dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

require_tools() {
  command -v docker >/dev/null 2>&1 || die "Docker não encontrado. Instale: https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 não encontrado (plugin 'docker compose')."
  command -v git >/dev/null 2>&1 || warn "Git não encontrado (necessário apenas para 'git pull' nas atualizações)."
  command -v openssl >/dev/null 2>&1 || die "openssl não encontrado (necessário para gerar chaves)."
  docker info >/dev/null 2>&1 || die "Docker não está em execução ou o usuário não tem permissão."
}

require_env() {
  [ -f "$ENV_FILE" ] || die ".env não encontrado. Rode ./deploy/install.sh primeiro."
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
}

ensure_network() {
  if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    log "Criando rede Docker ${NETWORK_NAME}..."
    docker network create "$NETWORK_NAME" >/dev/null
  fi
  ok "Rede ${NETWORK_NAME} disponível"
}

# Aguarda um serviço ficar healthy (ou apenas running quando não há healthcheck)
wait_healthy() {
  local svc="$1" tries="${2:-60}" cid state health
  for ((i=1; i<=tries; i++)); do
    cid="$(dc ps -q "$svc" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      state="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo unknown)"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo none)"
      [ "$health" = "healthy" ] && { ok "$svc healthy"; return 0; }
      [ "$health" = "none" ] && [ "$state" = "running" ] && { ok "$svc running"; return 0; }
    fi
    sleep 3
  done
  warn "$svc não ficou pronto a tempo (veja: docker compose -p funecob logs $svc)"
  return 1
}

psql_root() {
  dc exec -T funecob-db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" "$@"
}
