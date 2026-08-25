#!/usr/bin/env bash
# =====================================================================
# FUNecob — aplica as migrations de supabase/migrations no banco PRÓPRIO.
# Idempotente: registra o que já foi aplicado em public.schema_migrations.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_env

MIG_DIR="${FUNECOB_ROOT}/supabase/migrations"
[ -d "$MIG_DIR" ] || die "Pasta supabase/migrations não encontrada"

wait_healthy funecob-db 60 || die "funecob-db indisponível"

psql_root -q <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
SQL

applied=0; skipped=0
for f in $(ls -1 "$MIG_DIR"/*.sql | sort); do
  version="$(basename "$f")"
  exists="$(psql_root -tAc "SELECT 1 FROM public.schema_migrations WHERE version = '${version}'")"
  if [ "$exists" = "1" ]; then
    skipped=$((skipped+1)); continue
  fi
  log "Aplicando ${version}..."
  if dc exec -T funecob-db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" \
       -d "${POSTGRES_DB:-postgres}" -q < "$f"; then
    psql_root -q -c "INSERT INTO public.schema_migrations(version) VALUES ('${version}') ON CONFLICT DO NOTHING"
    applied=$((applied+1))
  else
    die "Falha na migration ${version}. Nada além dela foi aplicado."
  fi
done

ok "Migrations: ${applied} aplicada(s), ${skipped} já existente(s)"
