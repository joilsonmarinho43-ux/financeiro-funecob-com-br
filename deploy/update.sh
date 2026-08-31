#!/usr/bin/env bash
# =====================================================================
# FUNecob — ATUALIZAÇÃO SEGURA E AUTOCORRETIVA
#   ./deploy/update.sh
# Faz backup, sincroniza o GitHub, preserva os segredos existentes,
# corrige variáveis novas, recria a stack do FUNecob e valida tudo.
# Não remove volumes, não revoga chaves e não toca na Evolution API.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$FUNECOB_ROOT"
require_tools
require_env

title "1/8 Backup preventivo"
./deploy/backup.sh

title "2/8 Sincronizando código do GitHub"
git fetch --prune origin
git merge --ff-only origin/main || die "Há alterações locais ou histórico divergente — atualização abortada"
ok "Código sincronizado com origin/main"

# Recarrega helpers após o pull.
source "$FUNECOB_ROOT/deploy/lib.sh"
cd "$FUNECOB_ROOT"
require_tools
require_env

# ---------------------------------------------------------------------
# Corrige variáveis novas sem substituir nenhum segredo existente.
# Realtime usa JWT_SECRET como autoridade padrão para métricas.
# ---------------------------------------------------------------------
JWT_S="$(env_get JWT_SECRET)"
[ -n "$JWT_S" ] || die "JWT_SECRET ausente no .env"
[ -n "$(env_get METRICS_JWT_SECRET)" ] || env_set METRICS_JWT_SECRET "$JWT_S"

# ---------------------------------------------------------------------
# Se o proxy HTTPS existente estiver dentro de Docker, ele não consegue
# acessar uma porta publicada apenas em 127.0.0.1 no host Linux.
# Usa o gateway do bridge Docker somente para o Kong, mantendo a porta
# fora das interfaces públicas da VPS.
# ---------------------------------------------------------------------
if [ "${USE_OWN_PROXY:-false}" != "true" ]; then
  if docker inspect deploy-caddy-1 >/dev/null 2>&1; then
    DOCKER_GW="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
    if [ -n "$DOCKER_GW" ]; then
      env_set KONG_BIND_IP "$DOCKER_GW"
      ok "Proxy Caddy em Docker detectado — Kong publicado no gateway ${DOCKER_GW}:${KONG_HTTP_PORT:-54321}"
    fi
  fi
fi

require_env

title "3/8 Validando configuração"
dc config >/dev/null || die "docker-compose.yml inválido — atualização abortada"
ensure_network
ok "Docker Compose válido"

title "4/8 Validando integração com Evolution"
EV_HOST_URL="${EVOLUTION_API_URL//host.docker.internal/127.0.0.1}"
curl -fsS --max-time 10 -H "apikey: ${EVOLUTION_API_KEY}" "${EV_HOST_URL%/}/" >/dev/null \
  || die "Evolution API existente não responde com a chave configurada — nenhuma alteração aplicada além do backup"
ok "Evolution API existente responde"

title "5/8 Atualizando imagens e build"
dc pull --ignore-buildable || warn "Falha ao baixar alguma imagem — seguindo com as locais"
dc build funecob-web
ok "Imagens e frontend atualizados"

title "6/8 Recriando serviços do FUNecob"
# --force-recreate é intencional: corrige containers criados com um compose
# antigo, inclusive Realtime/Storage/Edge, sem apagar volumes.
if [ "${USE_OWN_PROXY:-false}" = "true" ]; then
  dc --profile proxy up -d --force-recreate --remove-orphans
else
  dc up -d --force-recreate --remove-orphans
fi
verify_network_managed || warn "Rede ${NETWORK_NAME} sem labels do Compose — estado preservado"
wait_healthy funecob-db 90 || die "funecob-db indisponível após atualização"

title "7/8 Bootstrap + migrations + reload"
./deploy/bootstrap-db.sh || die "Bootstrap do PostgreSQL falhou — update abortado"
./deploy/migrate.sh || die "Migrations interrompidas — update abortado"
dc restart funecob-rest funecob-edge-functions >/dev/null
ok "Banco e schema recarregados"

# Aguarda os serviços dependentes saírem de 'starting' antes do relatório.
for svc in funecob-auth funecob-rest funecob-realtime funecob-storage funecob-edge-functions funecob-kong funecob-web; do
  wait_healthy "$svc" 120 || warn "$svc ainda não ficou healthy dentro do prazo"
done

title "8/8 Healthcheck final"
./deploy/healthcheck.sh || die "Healthcheck final falhou — atualização não será declarada concluída"

ok "ATUALIZAÇÃO CONCLUÍDA — FUNecob validado sem revogar chaves ou apagar volumes."
