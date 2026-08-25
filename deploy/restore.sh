#!/usr/bin/env bash
# =====================================================================
# FUNecob — RESTORE
#   ./deploy/restore.sh backups/2026-08-25_120000
# DESTRUTIVO: substitui banco, Storage, Evolution e MongoDB do FUNecob.
# Exige confirmação explícita digitando RESTAURAR.
# Nenhum dado de outros projetos é tocado.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_env

SRC="${1:-}"
[ -n "$SRC" ] || die "Uso: ./deploy/restore.sh <pasta-do-backup>"
[ -d "$SRC" ] || die "Pasta não encontrada: $SRC"
SRC="$(cd "$SRC" && pwd)"

echo
cat "${SRC}/MANIFEST.txt" 2>/dev/null || true
echo
warn "Isto SUBSTITUI todos os dados atuais do FUNecob (banco, storage, WhatsApp)."
read -rp "Digite RESTAURAR para confirmar: " confirm
[ "$confirm" = "RESTAURAR" ] || die "Cancelado."

title "Backup de segurança do estado atual"
./deploy/backup.sh

title "Parando serviços de aplicação"
dc stop funecob-web funecob-kong funecob-rest funecob-auth funecob-realtime \
        funecob-storage funecob-edge-functions funecob-evolution >/dev/null

title "Restaurando PostgreSQL"
[ -f "${SRC}/postgres.sql.gz" ] || die "postgres.sql.gz ausente no backup"
gunzip -c "${SRC}/postgres.sql.gz" \
  | dc exec -T funecob-db psql -U "${POSTGRES_USER:-postgres}" -d postgres
ok "Banco restaurado"

if [ -f "${SRC}/storage.tar.gz" ]; then
  title "Restaurando Storage"
  docker run --rm -v funecob_storage_data:/data -v "${SRC}":/in:ro alpine \
    sh -c 'rm -rf /data/* && tar xzf /in/storage.tar.gz -C /data'
  ok "Storage restaurado"
fi

if [ -f "${SRC}/evolution.tar.gz" ]; then
  title "Restaurando Evolution API"
  docker run --rm -v funecob_evolution_data:/data -v "${SRC}":/in:ro alpine \
    sh -c 'rm -rf /data/* && tar xzf /in/evolution.tar.gz -C /data'
  ok "Instâncias restauradas"
fi

if [ -f "${SRC}/mongodb.archive.gz" ]; then
  title "Restaurando MongoDB"
  dc up -d funecob-mongodb >/dev/null; wait_healthy funecob-mongodb 40 || true
  dc exec -T funecob-mongodb mongorestore --quiet --archive --gzip --drop \
    -u "${MONGO_USER:-funecob}" -p "${MONGO_PASSWORD}" --authenticationDatabase admin \
    < "${SRC}/mongodb.archive.gz"
  ok "MongoDB restaurado"
fi

title "Subindo os serviços"
dc up -d
./deploy/healthcheck.sh || warn "Alguns serviços ainda estão subindo"

ok "Restore concluído a partir de ${SRC}"
