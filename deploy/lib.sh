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

# Carregamento SEGURO do .env — nunca executa o conteúdo como shell.
# Aceita apenas linhas KEY=VALUE; aspas externas são removidas; o valor é
# atribuído literalmente (URLs, senhas, espaços e '*' não são interpretados).
load_env_file() {
  local file="$1" line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|'#'*) continue ;;
    esac
    [ "${line#export }" != "$line" ] && line="${line#export }"
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    # chave precisa ser um identificador válido
    case "$key" in
      [A-Za-z_][A-Za-z0-9_]*) ;;
      *) continue ;;
    esac
    # remove aspas externas
    if [ "${val#\"}" != "$val" ] && [ "${val%\"}" != "$val" ]; then
      val="${val#\"}"; val="${val%\"}"
    elif [ "${val#\'}" != "$val" ] && [ "${val%\'}" != "$val" ]; then
      val="${val#\'}"; val="${val%\'}"
    fi
    printf -v "$key" '%s' "$val"
    export "${key?}"
  done < "$file"
}

require_env() {
  [ -f "$ENV_FILE" ] || die ".env não encontrado. Rode ./deploy/install.sh primeiro."
  load_env_file "$ENV_FILE"
}

# Lê um valor do .env sem exportar (sem executar nada)
env_get() {
  local key="$1"
  sed -n "s/^[[:space:]]*${key}=//p" "$ENV_FILE" 2>/dev/null | head -1 \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# Define/atualiza uma variável no .env preservando o restante do arquivo
env_set() {
  local key="$1" val="$2"
  [ -f "$ENV_FILE" ] || : > "$ENV_FILE"
  if grep -qE "^[[:space:]]*${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$val" '
      $0 ~ "^[[:space:]]*"k"=" && !done { print k"="v; done=1; next } { print }
    ' "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
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

# ---------------------------------------------------------------------
# VPS COMPARTILHADA — utilidades de detecção (somente leitura).
# Nenhuma destas funções altera, para ou remove qualquer recurso.
# ---------------------------------------------------------------------

# check_port <porta> <descrição> — falha se a porta já estiver ocupada
# por algo que NÃO seja o próprio FUNecob.
check_port() {
  local port="$1" desc="${2:-}" owner=""
  owner="$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null \
            | grep -E "(:|\.)${port}->" | awk '{print $1}' | head -1 || true)"
  if [ -n "$owner" ]; then
    case "$owner" in
      funecob-*) ok "porta ${port} (${desc}) já usada pelo próprio ${owner}"; return 0 ;;
      *) err "porta ${port} (${desc}) ocupada pelo container '${owner}' — NÃO será alterado"; return 1 ;;
    esac
  fi
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -qE "[:.]${port}[[:space:]]"; then
    err "porta ${port} (${desc}) já está em uso no host"; return 1
  fi
  ok "porta ${port} livre (${desc})"
  return 0
}

# Mostra a infraestrutura já existente que o FUNecob apenas REUTILIZA.
detect_existing_infra() {
  local ev mg
  ev="$(docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -iE '^evolution' || true)"
  mg="$(docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -iE '^mongodb' || true)"
  if [ -n "$ev" ]; then
    ok "Evolution API existente detectada: $(echo "$ev" | tr '\t' ' ')"
    log "  -> NÃO será recriada, substituída nem reiniciada."
  else
    warn "Nenhum container 'evolution' em execução neste host."
    log "  -> Se a Evolution roda em outro servidor, aponte EVOLUTION_API_URL para a URL pública."
  fi
  [ -n "$mg" ] && { ok "MongoDB existente detectado: $(echo "$mg" | tr '\t' ' ')"; \
                    log "  -> Pertence à Evolution existente. O FUNecob não cria MongoDB."; }
  return 0
}

# Testa a Evolution reutilizada a partir do host (traduzindo host.docker.internal).
evolution_reachable() {
  local url="${EVOLUTION_API_URL:-}"
  [ -n "$url" ] || return 1
  url="${url//host.docker.internal/127.0.0.1}"
  curl -fsS -o /dev/null --max-time 8 -H "apikey: ${EVOLUTION_API_KEY:-}" "${url%/}/" 2>/dev/null
}
