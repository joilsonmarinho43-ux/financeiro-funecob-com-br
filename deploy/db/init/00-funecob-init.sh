#!/bin/bash
# =====================================================================
# FUNecob — inicialização do PostgreSQL próprio (self-hosted).
# Executado UMA ÚNICA VEZ pelo entrypoint, na criação do volume
# funecob_db_data. Delega TODO o trabalho a /opt/funecob/bootstrap.sql,
# que é idempotente e também é reexecutado pelo ./deploy/bootstrap-db.sh
# em instalações/atualizações sobre volumes já existentes.
# Isolado: nenhuma relação com o Nexus 33.
# =====================================================================
set -euo pipefail

BOOTSTRAP="/opt/funecob/bootstrap.sql"
[ -f "$BOOTSTRAP" ] || { echo "[funecob-db] $BOOTSTRAP não encontrado" >&2; exit 1; }

psql -v ON_ERROR_STOP=1 \
     --username "${POSTGRES_USER:-postgres}" \
     --dbname "${POSTGRES_DB:-postgres}" \
     -v db_password="${POSTGRES_PASSWORD}" \
     -f "$BOOTSTRAP"

echo "[funecob-db] inicialização concluída."
