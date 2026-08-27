#!/usr/bin/env bash
# =====================================================================
# FUNecob — HEALTHCHECK
#   ./deploy/healthcheck.sh
# Verifica SOMENTE os serviços do FUNecob + a conectividade com a
# Evolution API já existente (que não é gerenciada por este projeto).
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
    printf "${C_RED}[ERRO]${C_RESET}  %s\n" "$name"
    FAILED=$((FAILED+1))
  fi
}

KONG="http://127.0.0.1:${KONG_HTTP_PORT:-54321}"
EV_HOST_URL="${EVOLUTION_API_URL//host.docker.internal/127.0.0.1}"

echo
echo "=============== FUNecob — status dos serviços ==============="
check "PostgreSQL"        dc exec -T funecob-db pg_isready -U "${POSTGRES_USER:-postgres}"
check "Supabase Auth"     dc exec -T funecob-kong curl -fsS "http://funecob-auth:9999/health"
check "Supabase REST"     curl -fsS -H "apikey: ${ANON_KEY}" "${KONG}/rest/v1/"
check "Realtime"          dc exec -T funecob-kong curl -fsS "http://funecob-realtime:4000/api/tenants/funecob/health"
check "Storage"           dc exec -T funecob-kong curl -fsS "http://funecob-storage:5000/status"
check "Edge Functions"    dc exec -T funecob-kong curl -fsS -o /dev/null "http://funecob-edge-functions:9000/client-portal"
check "Cron (agendador)"  dc exec -T funecob-cron sh -c "test -f /opt/funecob-cron.sh"
check "Kong (API GW)"     curl -fsS -o /dev/null "${KONG}/auth/v1/health"
check "FUNecob Web"       dc exec -T funecob-web curl -fsS "http://localhost:8080/healthz"
check "Frontend (host)"   curl -fsS -o /dev/null "http://127.0.0.1:${WEB_HTTP_PORT:-54320}/healthz"

echo "-------------- Kong: autenticação por apikey (real) ----------"
# O Kong não é considerado saudável só por estar "running": as credenciais
# precisam ter sido realmente carregadas a partir do template declarativo.
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }

CODE_VALID="$(http_code -H "apikey: ${ANON_KEY}" "${KONG}/rest/v1/")"
CODE_NONE="$(http_code "${KONG}/rest/v1/")"
CODE_BAD="$(http_code -H "apikey: chave-invalida-funecob" "${KONG}/rest/v1/")"

check "REST aceita ANON_KEY válida (2xx)"      sh -c "case '${CODE_VALID}' in 2*) exit 0;; *) exit 1;; esac"
check "REST rejeita sem apikey (401)"          test "$CODE_NONE" = "401"
check "REST rejeita apikey inválida (401)"     test "$CODE_BAD" = "401"
check "SERVICE_ROLE_KEY registrada no Kong" \
  sh -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'apikey: ${SERVICE_ROLE_KEY}' '${KONG}/rest/v1/')\" != '401'"
check "Nenhum placeholder \$SUPABASE_* carregado no Kong" \
  sh -c "! docker exec funecob-kong grep -q 'SUPABASE_ANON_KEY\|SUPABASE_SERVICE_KEY' /home/kong/kong.generated.yml"
check "YAML do Kong íntegro (aspas preservadas)" \
  sh -c "docker exec funecob-kong grep -q 'origins: \[\"\*\"\]' /home/kong/kong.generated.yml"

echo "-------------- Kong: rotas publicadas ------------------------"
check "/auth/v1/health" sh -c "case \"\$(http_code '${KONG}/auth/v1/health')\" in 2*) exit 0;; *) exit 1;; esac"
check "/rest/v1/ (apikey)" sh -c "case \"\$(http_code -H 'apikey: ${ANON_KEY}' '${KONG}/rest/v1/')\" in 2*) exit 0;; *) exit 1;; esac"
check "/graphql/v1 (roteada)" \
  sh -c "test \"\$(http_code -X POST -H 'apikey: ${ANON_KEY}' -H 'Content-Type: application/json' -d '{\"query\":\"{__typename}\"}' '${KONG}/graphql/v1')\" != '404'"
check "/storage/v1/ (roteada)" \
  sh -c "test \"\$(http_code -H 'apikey: ${ANON_KEY}' '${KONG}/storage/v1/bucket')\" != '404'"
check "/functions/v1/ (roteada)" \
  sh -c "test \"\$(http_code -H 'apikey: ${ANON_KEY}' '${KONG}/functions/v1/client-portal')\" != '404'"
check "/realtime/v1/ (roteada)" \
  sh -c "test \"\$(http_code -H 'apikey: ${ANON_KEY}' '${KONG}/realtime/v1/websocket')\" != '404'"



echo "---------------- infraestrutura reutilizada ------------------"
check "Evolution API (existente)" curl -fsS -o /dev/null --max-time 8 \
      -H "apikey: ${EVOLUTION_API_KEY}" "${EV_HOST_URL%/}/"
check "Evolution a partir do container" dc exec -T funecob-edge-functions \
      curl -fsS -o /dev/null --max-time 8 -H "apikey: ${EVOLUTION_API_KEY}" "${EVOLUTION_API_URL%/}/"

echo "------------------- isolamento de rede ----------------------"
for c in funecob-db funecob-auth funecob-rest funecob-realtime funecob-storage \
         funecob-edge-functions funecob-kong funecob-web funecob-cron; do
  nets="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$c" 2>/dev/null)"
  if [ -z "$nets" ]; then
    printf "${C_YEL}[--]${C_RESET}    %s não está em execução\n" "$c"
    continue
  fi
  extra="$(echo "$nets" | tr ' ' '\n' | grep -v '^funecob_network$' | grep -v '^$' | tr '\n' ' ')"
  if [ -z "$extra" ]; then
    printf "${C_GREEN}[OK]${C_RESET}    %s — somente funecob_network\n" "$c"
  else
    printf "${C_RED}[ERRO]${C_RESET}  %s conectado a rede(s) de terceiros: %s\n" "$c" "$extra"
    FAILED=$((FAILED+1))
  fi
done

echo "----------------------- DNS e HTTPS -------------------------"

check "DNS ${APP_DOMAIN}"  getent hosts "${APP_DOMAIN}"
check "DNS ${API_DOMAIN}"  getent hosts "${API_DOMAIN}"
if [ "${USE_OWN_PROXY:-false}" = "true" ]; then
  check "Caddy FUNecob"    dc exec -T funecob-caddy caddy version
fi
check "HTTPS (${APP_DOMAIN})" curl -fsS -o /dev/null --max-time 15 "https://${APP_DOMAIN}/healthz"
check "HTTPS (${API_DOMAIN})" curl -fsS -o /dev/null --max-time 15 "https://${API_DOMAIN}/auth/v1/health"

echo "-------------------------------------------------------------"
if [ "$FAILED" -eq 0 ]; then
  printf "${C_GREEN}OK — todos os serviços do FUNecob estão saudáveis.${C_RESET}\n\n"
  exit 0
fi
printf "${C_YEL}ERRO — %s verificação(ões) falharam.${C_RESET}\n" "$FAILED"
cat <<'EOF'
Causas mais comuns:
  * HTTPS falhando .......... DNS ainda não propagou, ou o proxy do host não
                              está encaminhando para 127.0.0.1:WEB_HTTP_PORT /
                              127.0.0.1:KONG_HTTP_PORT (veja DEPLOY.md §Proxy).
  * Evolution inacessível ... EVOLUTION_API_URL errada. Dentro do Docker use
                              http://host.docker.internal:8080 (nunca localhost).
  * Auth/REST/Storage ....... veja: docker compose -p funecob logs -f <serviço>
EOF
echo
exit 1
