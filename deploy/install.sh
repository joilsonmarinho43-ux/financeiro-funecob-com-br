#!/usr/bin/env bash
# =====================================================================
# FUNecob — INSTALAÇÃO AUTOMÁTICA E IDEMPOTENTE EM VPS COMPARTILHADA
#
#   git clone <REPO> funecob && cd funecob
#   ./deploy/install.sh            # instalação completa (gera os segredos)
#   ./deploy/install.sh --check    # apenas valida, sem alterar nada

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

# --check = valida tudo SEM criar/alterar containers, volumes ou redes
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check|--dry-run) CHECK_ONLY=1 ;;
    -h|--help) echo "uso: ./deploy/install.sh [--check]"; exit 0 ;;
    *) echo "opção desconhecida: $arg" >&2; exit 2 ;;
  esac
done


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
  chmod 600 "$ENV_FILE"
  warn ".env criado a partir de .env.example"
else
  ok ".env já existe — segredos válidos serão preservados"
fi
chmod 600 "$ENV_FILE"

# Remove comentários inline / espaços herdados de .env antigos (ex.: "54320  # web")
normalize_env_file
ok "Valores do .env normalizados (sem comentários inline)"



# --- segredos: gerados automaticamente APENAS quando ausentes/vazios ---
JWT_S="$(env_get JWT_SECRET)"
if [ -z "$JWT_S" ] || [ ${#JWT_S} -lt 32 ]; then
  JWT_S="$(gen_hex 32)"; env_set JWT_SECRET "$JWT_S"
  # JWTs precisam ser reassinados com o novo segredo
  env_set ANON_KEY ""; env_set SERVICE_ROLE_KEY ""
  ok "JWT_SECRET gerado"
fi
AK="$(env_get ANON_KEY)"; SK="$(env_get SERVICE_ROLE_KEY)"
if [ -z "$AK" ] || ! jwt_matches_secret "$AK" "$JWT_S"; then
  env_set ANON_KEY "$(sign_jwt anon "$JWT_S")"; ok "ANON_KEY gerada/realinhada ao JWT_SECRET"
fi
if [ -z "$SK" ] || ! jwt_matches_secret "$SK" "$JWT_S"; then
  env_set SERVICE_ROLE_KEY "$(sign_jwt service_role "$JWT_S")"; ok "SERVICE_ROLE_KEY gerada/realinhada ao JWT_SECRET"
fi

for pair in "POSTGRES_PASSWORD:24" "REALTIME_SECRET_KEY_BASE:32" \
            "EVOLUTION_WEBHOOK_SECRET:32" "BIP_API_KEY:32"; do
  k="${pair%%:*}"; n="${pair##*:}"
  [ -n "$(env_get "$k")" ] || { env_set "$k" "$(gen_hex "$n")"; ok "$k gerado"; }
done
# REALTIME_ENC_KEY precisa ter exatamente 32 caracteres
RK="$(env_get REALTIME_ENC_KEY)"
[ ${#RK} -eq 32 ] || { env_set REALTIME_ENC_KEY "$(gen_hex 16)"; ok "REALTIME_ENC_KEY gerado"; }
# frontend usa sempre a ANON_KEY vigente
env_set VITE_SUPABASE_PUBLISHABLE_KEY "$(env_get ANON_KEY)"
env_set VITE_SUPABASE_URL   "$(env_get SUPABASE_PUBLIC_URL)"
env_set VITE_PORTAL_BASE_URL "$(env_get PORTAL_BASE_URL)"

# --- Evolution API existente: chave NUNCA é regenerada ---
if [ -z "$(env_get EVOLUTION_API_KEY)" ]; then
  if EVK="$(detect_evolution_key)"; then
    env_set EVOLUTION_API_KEY "$EVK"
    ok "EVOLUTION_API_KEY detectada no container existente (não foi alterada)"
  elif [ "${CHECK_ONLY:-0}" = "1" ] || [ ! -t 0 ]; then
    die "EVOLUTION_API_KEY ausente no .env e não foi possível detectá-la automaticamente."
  else
    echo
    warn "Único dado obrigatório: a chave da Evolution API JÁ EXISTENTE (não será alterada)."
    read -rsp "EVOLUTION_API_KEY: " EVK; echo
    [ -n "$EVK" ] || die "EVOLUTION_API_KEY é obrigatória."
    env_set EVOLUTION_API_KEY "$EVK"
  fi
fi

require_env
add ".env .......................... OK"

# ------------------------------------------------------ 4. Validação
title "4/15 Validação da configuração"
missing=()
for v in APP_DOMAIN API_DOMAIN SUPABASE_PUBLIC_URL ANON_KEY SERVICE_ROLE_KEY \
         POSTGRES_PASSWORD JWT_SECRET REALTIME_ENC_KEY REALTIME_SECRET_KEY_BASE \
         BIP_API_KEY EVOLUTION_API_URL EVOLUTION_API_KEY; do
  [ -z "${!v:-}" ] && missing+=("$v")
done
[ ${#missing[@]} -gt 0 ] && die "Variáveis obrigatórias vazias no .env: ${missing[*]}"
[ ${#JWT_SECRET} -ge 32 ] || die "JWT_SECRET precisa ter no mínimo 32 caracteres"

# Placeholders nunca podem chegar à produção
case "${ACME_EMAIL:-}" in
  ""|seu-email@*|*example.com)
    if [ "${USE_OWN_PROXY:-false}" = "true" ]; then
      die "ACME_EMAIL é um placeholder — obrigatório quando USE_OWN_PROXY=true"
    else
      warn "ACME_EMAIL é placeholder (irrelevante com USE_OWN_PROXY=false)"
    fi ;;
esac
for d in "$APP_DOMAIN" "$API_DOMAIN"; do
  echo "$d" | grep -qE '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' \
    || die "Domínio inválido: $d"
done
for pv in "WEB_HTTP_PORT:${WEB_HTTP_PORT:-54320}" "KONG_HTTP_PORT:${KONG_HTTP_PORT:-54321}" \
          "POSTGRES_PORT:${POSTGRES_PORT:-54322}"; do
  pname="${pv%%:*}"; p="${pv#*:}"
  echo "$p" | grep -qE '^[0-9]{2,5}$' \
    || die "Porta inválida em ${pname}: '${p}'. Use SOMENTE números (ex.: ${pname}=54320), sem comentário na mesma linha."
  [ "$p" -ge 1 ] && [ "$p" -le 65535 ] || die "Porta fora da faixa em ${pname}: ${p}"
done
for nv in "CRON_TICK_SECONDS:${CRON_TICK_SECONDS:-120}" "BILLING_CRON_HOUR:${BILLING_CRON_HOUR:-08}" \
          "SMTP_PORT:${SMTP_PORT:-587}" "JWT_EXPIRY:${JWT_EXPIRY:-3600}" \
          "STORAGE_FILE_SIZE_LIMIT:${STORAGE_FILE_SIZE_LIMIT:-52428800}"; do
  nname="${nv%%:*}"; n="${nv#*:}"
  echo "$n" | grep -qE '^[0-9]+$' || die "Valor numérico inválido em ${nname}: '${n}'"
done
[ "${BILLING_CRON_HOUR:-08}" -ge 0 ] && [ "${BILLING_CRON_HOUR:-08}" -le 23 ] \
  || die "BILLING_CRON_HOUR deve estar entre 00 e 23"
case "${USE_OWN_PROXY:-false}" in true|false) ;; *) die "USE_OWN_PROXY deve ser true ou false (atual: '${USE_OWN_PROXY}')" ;; esac


# Nenhuma variável pode apontar para outro projeto da VPS
for v in SUPABASE_PUBLIC_URL SITE_URL PORTAL_BASE_URL VITE_SUPABASE_URL EVOLUTION_API_URL; do
  val="${!v:-}"
  case "$val" in
    *nexus33*|*supabase.co*|*lovableproject*|*lovable.app*)
      die "$v aponta para infraestrutura externa/antiga: $val" ;;
  esac
done
case "${EVOLUTION_API_URL}" in
  http://localhost:*|http://127.0.0.1:*|https://localhost:*|https://127.0.0.1:*)
    die "EVOLUTION_API_URL não pode ser localhost: dentro do Docker isso é o próprio container.
     Use http://host.docker.internal:8080 (padrão) ou o IP do host / domínio público." ;;
  http://*|https://*) ;;
  *) die "EVOLUTION_API_URL inválida: ${EVOLUTION_API_URL}" ;;
esac
ok "Variáveis válidas e sem referência a outros projetos"
add "Variáveis de ambiente ........ OK"

log "Validando docker-compose.yml..."
dc config >/dev/null || die "docker-compose.yml inválido"
ok "docker-compose.yml válido"

log "Validando template declarativo do Kong..."
grep -q 'SUPABASE_ANON_KEY' deploy/kong/kong.yml \
  && grep -q 'SUPABASE_SERVICE_KEY' deploy/kong/kong.yml \
  || die "deploy/kong/kong.yml não contém os placeholders esperados"
RENDER="$(mktemp)"
render_kong_config deploy/kong/kong.yml "$RENDER" "$ANON_KEY" "$SERVICE_ROLE_KEY" \
  || { rm -f "$RENDER"; die "Kong: falha ao renderizar a configuração declarativa"; }
# a renderização não pode destruir a estrutura YAML (aspas/listas)
grep -q 'origins: \["\*"\]' "$RENDER" || { rm -f "$RENDER"; die "Kong: YAML corrompido na renderização"; }
for r in /auth/v1/ /rest/v1/ /graphql/v1 /realtime/v1/ /storage/v1/ /functions/v1/; do
  grep -qF "$r" "$RENDER" || { rm -f "$RENDER"; die "Kong: rota ausente no template: $r"; }
done
rm -f "$RENDER"
ok "Kong renderiza ANON_KEY/SERVICE_ROLE_KEY reais e todas as rotas"
add "Kong (config declarativa) .... OK"


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
# Diagnóstico somente-leitura (serve também ao modo --check)
if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  _ln="$(network_label 'com.docker.compose.network')"
  _lp="$(network_label 'com.docker.compose.project')"
  _uc="$(network_containers)"
  if [ "$_ln" = "$NETWORK_NAME" ] && [ "$_lp" = "$COMPOSE_PROJECT" ]; then
    ok "Rede ${NETWORK_NAME} existente e gerenciada pelo Compose"
  elif [ -n "$_lp" ] && [ "$_lp" != "$COMPOSE_PROJECT" ]; then
    die "Rede ${NETWORK_NAME} pertence ao projeto '${_lp}' — nada será alterado."
  else
    warn "Rede ${NETWORK_NAME} existente SEM labels do Compose (órfã)"
    [ -n "${_uc// /}" ] && log "  containers conectados: ${_uc}"
  fi
else
  ok "Rede ${NETWORK_NAME} inexistente — o Compose a criará"
fi

if [ "$CHECK_ONLY" = "1" ]; then
  title "MODO --check"
  printf '%s\n' "${REPORT[@]}"
  ok "Validação concluída. Nenhum container, volume ou rede foi criado/alterado."
  exit 0
fi
# Corrige apenas o estado órfão do próprio FUNecob; o Compose cria a rede.
ensure_network
add "Rede funecob_network ......... OK (gerenciada pelo Compose)"


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
verify_network_managed || die "Rede ${NETWORK_NAME} não ficou sob gestão do Compose"
wait_healthy funecob-db 60 || die "funecob-db não subiu"
add "PostgreSQL próprio ........... OK"

# ------------------------------------------------------ 11. Bootstrap do banco
title "11/15 Bootstrap idempotente do PostgreSQL"
# Volumes já existentes NÃO reexecutam /docker-entrypoint-initdb.d; por isso o
# bootstrap (schemas auth/storage/_realtime, roles, extensões e funções auth.*)
# é sempre aplicado aqui, de forma idempotente e não destrutiva.
./deploy/bootstrap-db.sh || die "Bootstrap do PostgreSQL falhou"
add "Bootstrap do PostgreSQL ...... OK"

# ------------------------------------------------------ 12. Validação do banco
title "12/15 Validação de schemas, roles, funções e extensões"
./deploy/bootstrap-db.sh --verify \
  || die "Infraestrutura do banco incompleta — migrations não executadas"
add "Infraestrutura do banco ...... OK"

# ------------------------------------------------------ 13. Migrations
title "13/15 Migrations"
./deploy/migrate.sh || die "Migrations interrompidas — veja a migration indicada acima"
add "Migrations ................... OK"

# ------------------------------------------------------ 14. Serviços
title "14/15 Subindo os serviços do FUNecob"
if [ "${USE_OWN_PROXY:-false}" = "true" ]; then
  COMPOSE_PROFILES=proxy dc --profile proxy up -d
else
  dc up -d
fi
for s in funecob-auth funecob-rest funecob-storage funecob-realtime \
         funecob-edge-functions funecob-kong funecob-web funecob-cron; do
  wait_healthy "$s" 40 || true
done

# Buckets de Storage (idempotente)
./deploy/seed-storage.sh || warn "Não foi possível criar os buckets agora — rode ./deploy/seed-storage.sh depois"

# ------------------------------------------------------ 15. Healthcheck
title "15/15 Verificação geral e relatório"
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
