#!/usr/bin/env bash
# =====================================================================
# FUNecob — ATUALIZAÇÃO
#   ./deploy/update.sh
# Faz backup antes, sincroniza o código do GitHub, atualiza só os serviços
# do FUNecob e valida a saúde. Nenhum comando é executado em outros projetos.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$FUNECOB_ROOT"
require_tools
require_env

title "1/7 Backup preventivo"
./deploy/backup.sh

title "2/7 Sincronizando código do GitHub"
git fetch --prune origin
git merge --ff-only origin/main || die "Há alterações locais ou histórico divergente — atualização abortada"
ok "Código sincronizado com origin/main"

# Recarrega helpers caso o próprio lib.sh tenha sido atualizado no pull.
source "$FUNECOB_ROOT/deploy/lib.sh"
cd "$FUNECOB_ROOT"
require_tools
require_env

title "3/7 Validando configuração"
dc config >/dev/null || die "docker-compose.yml inválido — atualização abortada"
ensure_network
ok "Configuração válida"

title "4/7 Atualizando imagens e build"
dc pull --ignore-buildable || warn "Falha ao baixar alguma imagem — seguindo com as locais"
dc build funecob-web
ok "Imagens atualizadas"

title "5/7 Reiniciando serviços do FUNecob"
# Só sobe o proxy dedicado se o usuário optou por ele; o Caddy da VPS não é tocado.
if [ "${USE_OWN_PROXY:-false}" = "true" ]; then
  dc --profile proxy up -d --remove-orphans
else
  dc up -d --remove-orphans
fi
verify_network_managed || warn "Rede ${NETWORK_NAME} sem labels do Compose — rode ./deploy/install.sh"
wait_healthy funecob-db 60 || die "funecob-db indisponível após atualização"

title "6/7 Bootstrap do banco + migrations pendentes"
./deploy/bootstrap-db.sh || die "Bootstrap do PostgreSQL falhou — update abortado"
./deploy/migrate.sh || die "Migrations interrompidas — veja a migration indicada acima"
dc restart funecob-rest funecob-edge-functions >/dev/null
ok "Schema recarregado"

title "7/7 Verificação"
./deploy/healthcheck.sh || warn "Alguns serviços ainda estão subindo"

ok "Atualização concluída."
