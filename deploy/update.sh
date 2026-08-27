#!/usr/bin/env bash
# =====================================================================
# FUNecob — ATUALIZAÇÃO
#   git pull && ./deploy/update.sh
# Faz backup antes, atualiza só os serviços do FUNecob e valida a saúde.
# Nenhum comando é executado em outros projetos da VPS.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$FUNECOB_ROOT"
require_tools
require_env

title "1/6 Backup preventivo"
./deploy/backup.sh

title "2/6 Validando configuração"
dc config >/dev/null || die "docker-compose.yml inválido — atualização abortada"
ensure_network
ok "Configuração válida"

title "3/6 Atualizando imagens e build"
dc pull --ignore-buildable || warn "Falha ao baixar alguma imagem — seguindo com as locais"
dc build funecob-web
ok "Imagens atualizadas"

title "4/6 Reiniciando serviços do FUNecob"
# Só sobe o proxy dedicado se o usuário optou por ele; o Caddy da VPS não é tocado.
if [ "${USE_OWN_PROXY:-false}" = "true" ]; then
  dc --profile proxy up -d --remove-orphans
else
  dc up -d --remove-orphans
fi
wait_healthy funecob-db 60 || die "funecob-db indisponível após atualização"

title "5/6 Migrations pendentes"
./deploy/migrate.sh
dc restart funecob-rest funecob-edge-functions >/dev/null
ok "Schema recarregado"

title "6/6 Verificação"
./deploy/healthcheck.sh || warn "Alguns serviços ainda estão subindo"

ok "Atualização concluída."
