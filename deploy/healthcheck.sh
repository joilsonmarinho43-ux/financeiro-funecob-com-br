#!/usr/bin/env bash
# =====================================================================
# FUNecob — HEALTHCHECK
#   ./deploy/healthcheck.sh
# Verifica somente os serviços do FUNecob.
# =====================================================================
set -uo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
set +e
require_env

FAILED=0
check() { # nome, comando
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf "${C_GREEN}[OK]${C_RESET}    %s\n" "$name"
  else
    printf "${C_RED}[FALHA]${C_RESET} %s\n" "$name"
    FAILED=$((FAILED+1))
  fi
}

KONG="http://127.0.0.1:${KONG_HTTP_PORT:-54321}"

echo
echo "=============== FUNecob — status dos serviços ==============="
check "PostgreSQL"        dc exec -T funecob-db pg_isready -U "${POSTGRES_USER:-postgres}"
check "Supabase Auth"     dc exec -T funecob-kong curl -fsS "http://funecob-auth:9999/health"
check "Supabase REST"     curl -fsS -H "apikey: ${ANON_KEY}" "${KONG}/rest/v1/"
check "Realtime"          dc exec -T funecob-kong curl -fsS "http://funecob-realtime:4000/api/tenants/funecob/health"
check "Storage"           dc exec -T funecob-kong curl -fsS "http://funecob-storage:5000/status"
check "Edge Functions"    dc exec -T funecob-kong curl -fsS -o /dev/null "http://funecob-edge-functions:9000/client-portal"
check "Kong (API GW)"     curl -fsS -o /dev/null "${KONG}/auth/v1/health"
check "MongoDB"           dc exec -T funecob-mongodb mongosh --quiet --eval "db.adminCommand('ping')"
check "Evolution API"     dc exec -T funecob-kong curl -fsS -o /dev/null "http://funecob-evolution:8080/"
check "FUNecob Web"       dc exec -T funecob-web curl -fsS "http://localhost:8080/healthz"
check "Caddy"             dc exec -T funecob-caddy caddy version
check "HTTPS (${APP_DOMAIN})" curl -fsS -o /dev/null --max-time 15 "https://${APP_DOMAIN}/healthz"
check "HTTPS (${API_DOMAIN})" curl -fsS -o /dev/null --max-time 15 "https://${API_DOMAIN}/auth/v1/health"

echo "-------------------------------------------------------------"
if [ "$FAILED" -eq 0 ]; then
  printf "${C_GREEN}Todos os serviços do FUNecob estão saudáveis.${C_RESET}\n\n"
  exit 0
fi
printf "${C_YEL}%s verificação(ões) falharam.${C_RESET}\n" "$FAILED"
echo "Logs: docker compose -p funecob logs -f <serviço>"
echo
exit 1
