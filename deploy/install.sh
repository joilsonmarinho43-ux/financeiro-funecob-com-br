#!/usr/bin/env bash
# =====================================================================
# FUNecob — INSTALAÇÃO AUTOMÁTICA E IDEMPOTENTE EM VPS COMPARTILHADA
#
#   git clone <REPO> funecob && cd funecob
#   cp .env.example .env && nano .env
#   ./deploy/install.sh
#
# Regras absolutas deste script:
#   * NUNCA executa prune / rm -f / volume rm / network rm
#   * NUNCA toca em containers, redes ou volumes de outros projetos
#   * NUNCA cria uma segunda Evolution API nem um segundo MongoDB
#   * Reutiliza a Evolution API JÁ EXISTENTE via EVOLUTION_API_URL
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

cd "$FUNECOB_ROOT"
REPORT=()
add() { REPORT+=("$1"); }

echo -e "${C_BOLD}"
cat <<'BANNER'
  ______ _   _ _   _        _
 |  ____| | | | \ | |      | |
 | |__  | | | |  \| | ___  | |__
 |  __| | | | | . ` |/ _ \ | '_ \
 | |    | |_| | |\  |  __/ | |_) |
 |_|     \___/|_| \_|\___| |_.__/   FUNecob — instalação independente
BANNER
echo -e "${C_RESET}"

# ------------------------------------------------------ 1. Pré-requisitos
title "1/15 Docker e Docker Compose"
require_tools
ok "Docker, Docker Compose e OpenSSL presentes"
add "Docker/Compose ............... OK"

# ------------------------------------------------------ 2. Diretórios
title "2/15 Diretórios"
mkdir -p "$BACKUP_DIR" deploy/db/init deploy/kong
ok "Estrutura de diretórios pronta"

# ------------------------------------------------------ 3. .env
title "3/15 Configuração (.env)"
if [ ! -f "$ENV_FILE" ]; then
  cp "${FUNECOB_ROOT}/.env.example" "$ENV_FILE"
  warn ".env criado a partir de .env.example"
  log "Gerando segredos automaticamente..."
  TMPKEYS="$(mktemp)"; ./deploy/genkeys.sh > "$TMPKEYS"
  while IFS='=' read -r k v; do
    [ -z "$k" ] && continue
    if grep -qE "^${k}=" "$ENV_FILE"; then
      python3 - "$ENV_FILE" "$k" "$v" <<'PY'
import sys
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines()
out = [f"{key}={val}" if l.startswith(key + "=") else l for l in lines]
open(path, "w").write("\n".join(out) + "\n")
PY
    else
      echo "${k}=${v}" >> "$ENV_FILE"
    fi
  done < "$TMPKEYS"
  rm -f "$TMPKEYS"
  ANONV="$(grep -E '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)"
  sed -i "s|^VITE_SUPABASE_PUBLISHABLE_KEY=.*|VITE_SUPABASE_PUBLISHABLE_KEY=${ANONV}|" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Segredos gerados e gravados em .env (permissão 600)"
  echo
  warn "AJUSTE: APP_DOMAIN, API_DOMAIN, ACME_EMAIL, EVOLUTION_API_URL, EVOLUTION_API_KEY"
  read -rp "Abrir o .env agora para edição? [S/n] " r
  [[ "${r:-S}" =~ ^[SsYy]?$ ]] && "${EDITOR:-nano}" "$ENV_FILE"
else
  ok ".env já existe — preservado (nada foi sobrescrito)"
fi
require_env
add ".env .......................... OK"

# ------------------------------------------------------ 4. Validação
title "4/15 Validação da configuração"
missing=()
for v in APP_DOMAIN API_DOMAIN ACME_EMAIL SUPABASE_PUBLIC_URL ANON_KEY SERVICE_ROLE_KEY \
         POSTGRES_PASSWORD JWT_SECRET REALTIME_ENC_KEY REALTIME_SECRET_KEY_BASE \
         EVOLUTION_API_URL EVOLUTION_API_KEY; do
  [ -z "${!v:-}" ] && missing+=("$v")
done
[ ${#missing[@]} -gt 0 ] && die "Variáveis obrigatórias vazias no .env: ${missing[*]}"
[ ${#JWT_SECRET} -ge 32 ] || die "JWT_SECRET precisa ter no mínimo 32 caracteres"

# Nenhuma variável pode apontar para outro projeto da VPS
for v in SUPABASE_PUBLIC_URL SITE_URL PORTAL_BASE_URL VITE_SUPABASE_URL EVOLUTION_API_URL; do
  val="${!v:-}"
  case "$val" in
    *nexus33*|*supabase.co*|*lovableproject*|*lovable.app*)
      die "$v aponta para infraestrutura externa/antiga: $val" ;;
  esac
done
case "${EVOLUTION_API_URL}" in
  http://localhost:*|http://127.0.0.1:*)
    die "EVOLUTION_API_URL não pode ser localhost: dentro do Docker isso é o próprio container.
     Use http://host.docker.internal:8080 (padrão) ou o IP do host / domínio público." ;;
esac
ok "Variáveis válidas e sem referência a outros projetos"
add "Variáveis de ambiente ........ OK"

log "Validando docker-compose.yml..."
dc config >/dev/null || die "docker-compose.yml inválido"
ok "docker-compose.yml válido"

# ------------------------------------------------------ 5. Portas
title "5/15 Portas do host"
PORT_CONFLICT=0
check_port "${POSTGRES_PORT:-54322}" "PostgreSQL FUNecob (loopback)"  || PORT_CONFLICT=1
check_port "${KONG_HTTP_PORT:-54321}" "Kong/API FUNecob (loopback)"   || PORT_CONFLICT=1
check_port "${WEB_HTTP_PORT:-54320}"  "Frontend FUNecob (loopback)"   || PORT_CONFLICT=1
if [ "${USE_OWN_PROXY:-false}" = "true" ]; then
  check_port "${CADDY_HTTP_PORT:-80}"  "Caddy FUNecob HTTP"  || PORT_CONFLICT=1
  check_port "${CADDY_HTTPS_PORT:-443}" "Caddy FUNecob HTTPS" || PORT_CONFLICT=1
else
  log "USE_OWN_PROXY=false — 80/443 permanecem com o proxy já existente na VPS"
fi
if [ "$PORT_CONFLICT" -ne 0 ]; then
  die "Conflito de portas. Ajuste as variáveis *_PORT no .env e rode novamente.
     Nenhum serviço existente foi parado ou alterado."
fi
ok "Nenhum conflito de portas"
add "Portas ....................... OK"

# ------------------------------------------------------ 6. Evolution existente
title "6/15 Evolution API já existente (NÃO será recriada)"
detect_existing_infra
if evolution_reachable; then
  ok "Evolution API respondeu em ${EVOLUTION_API_URL}"
  add "Evolution API existente ...... OK (reutilizada)"
else
  warn "Não foi possível validar ${EVOLUTION_API_URL} a partir do host."
  warn "Isso pode ser normal se a Evolution só aceitar conexões internas."
  add "Evolution API existente ...... AVISO (verifique EVOLUTION_API_URL)"
fi

# ------------------------------------------------------ 7. Rede
title "7/15 Rede Docker exclusiva"
ensure_network
add "Rede funecob_network ......... OK"

# ------------------------------------------------------ 8. Volumes
title "8/15 Volumes exclusivos"
for v in funecob_db_data funecob_storage_data funecob_caddy_data funecob_caddy_config; do
  if docker volume inspect "$v" >/dev/null 2>&1; then
    ok "volume $v já existe — preservado"
  else
    docker volume create "$v" >/dev/null && ok "volume $v criado"
  fi
done
add "Volumes funecob_* ............ OK"

# ------------------------------------------------------ 9. Build
title "9/15 Build do frontend"
dc build funecob-web
ok "Imagem funecob/web:latest construída"

# ------------------------------------------------------ 10. Banco
title "10/15 PostgreSQL do FUNecob"
dc up -d funecob-db
wait_healthy funecob-db 60 || die "funecob-db não subiu"
add "PostgreSQL próprio ........... OK"

# ------------------------------------------------------ 11. Migrations
title "11/15 Migrations"
./deploy/migrate.sh
add "Migrations ................... OK"

# ------------------------------------------------------ 12. Serviços
title "12/15 Subindo os serviços do FUNecob"
if [ "${USE_OWN_PROXY:-false}" = "true" ]; then
  COMPOSE_PROFILES=proxy dc --profile proxy up -d
else
  dc up -d
fi
for s in funecob-auth funecob-rest funecob-storage funecob-realtime \
         funecob-edge-functions funecob-kong funecob-web; do
  wait_healthy "$s" 40 || true
done

# ------------------------------------------------------ 13. Buckets
title "13/15 Storage (buckets)"
./deploy/seed-storage.sh || warn "Não foi possível criar os buckets agora — rode ./deploy/seed-storage.sh depois"

# ------------------------------------------------------ 14. Healthcheck
title "14/15 Verificação geral"
if ./deploy/healthcheck.sh; then
  add "Healthcheck .................. OK"
else
  warn "Alguns serviços ainda não responderam — aguarde o DNS/HTTPS e rode ./deploy/healthcheck.sh"
  add "Healthcheck .................. PARCIAL"
fi

# ------------------------------------------------------ 15. Relatório
title "15/15 Relatório final"
printf '%s\n' "${REPORT[@]}"
cat <<EOF

  Frontend .......... https://${APP_DOMAIN}
  API (Supabase) .... https://${API_DOMAIN}
  Evolution API ..... ${EVOLUTION_API_URL}  (existente — NÃO recriada)

  Proxy dedicado .... ${USE_OWN_PROXY:-false}
  Frontend interno .. http://127.0.0.1:${WEB_HTTP_PORT:-54320}
  API interna ....... http://127.0.0.1:${KONG_HTTP_PORT:-54321}

  Status ............ docker compose -p funecob ps
  Logs .............. docker compose -p funecob logs -f <serviço>
  Atualizar ......... ./deploy/update.sh
  Backup ............ ./deploy/backup.sh
  Restore ........... ./deploy/restore.sh <pasta-do-backup>
  Healthcheck ....... ./deploy/healthcheck.sh

  Primeiro acesso: crie a conta administradora na tela de cadastro do app
  e promova-a a admin (veja DEPLOY.md, seção "Primeiro acesso").

EOF
ok "FUNecob instalado — nenhum serviço existente da VPS foi alterado."
