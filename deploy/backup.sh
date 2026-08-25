#!/usr/bin/env bash
# =====================================================================
# FUNecob — BACKUP com timestamp
#   ./deploy/backup.sh
# Gera backups/AAAA-MM-DD_HHMMSS/ contendo:
#   postgres.sql.gz        dump completo do banco próprio
#   storage.tar.gz         arquivos do Storage (logos/receipts)
#   env.enc | env.bak      cópia do .env (cifrada se BACKUP_PASSPHRASE existir)
#   config/                docker-compose.yml, Caddyfile, kong.yml
#   MANIFEST.txt           inventário e versões
# Nenhum dado de outros projetos é lido.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_env

STAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="${BACKUP_DIR}/${STAMP}"
mkdir -p "$DEST/config"

log "Backup em ${DEST}"

# ------------------------------------------------------------ Postgres
log "Dump do PostgreSQL..."
dc exec -T funecob-db pg_dumpall -U "${POSTGRES_USER:-postgres}" --clean --if-exists \
  | gzip -9 > "${DEST}/postgres.sql.gz"
ok "postgres.sql.gz ($(du -h "${DEST}/postgres.sql.gz" | cut -f1))"

# ------------------------------------------------------------- Storage
log "Arquivos do Storage..."
docker run --rm -v funecob_storage_data:/data:ro -v "${DEST}":/out alpine \
  tar czf /out/storage.tar.gz -C /data . 2>/dev/null || warn "Storage vazio ou indisponível"
[ -f "${DEST}/storage.tar.gz" ] && ok "storage.tar.gz"

# NOTA: Evolution API e MongoDB da VPS pertencem à infraestrutura existente
# e NÃO são gerenciados por este projeto — portanto não entram neste backup.
# Faça o backup deles pelo procedimento próprio da Evolution existente.

# ----------------------------------------------------------------- ENV
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$ENV_FILE" -out "${DEST}/env.enc" \
    -pass pass:"${BACKUP_PASSPHRASE}"
  ok "env.enc (cifrado)"
else
  cp "$ENV_FILE" "${DEST}/env.bak"; chmod 600 "${DEST}/env.bak"
  warn "env.bak em texto puro — defina BACKUP_PASSPHRASE para cifrar"
fi

# -------------------------------------------------------------- Config
cp docker-compose.yml "${DEST}/config/"
cp deploy/Caddyfile "${DEST}/config/"
cp deploy/kong/kong.yml "${DEST}/config/"

{
  echo "FUNecob backup — ${STAMP}"
  echo "commit: $(git -C "$FUNECOB_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
  echo
  echo "Containers:"; dc ps --format '  {{.Name}}\t{{.Image}}\t{{.Status}}' 2>/dev/null || true
  echo
  echo "Arquivos:"; ls -lh "$DEST" | tail -n +2 | awk '{print "  "$9" "$5}'
} > "${DEST}/MANIFEST.txt"

# ------------------------------------------------- Retenção (30 dias)
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime +${BACKUP_RETENTION_DAYS:-30} \
  -exec rm -rf {} + 2>/dev/null || true

ok "Backup concluído: ${DEST}"
