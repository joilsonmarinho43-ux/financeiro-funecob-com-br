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

# A infraestrutura interna (schemas auth/storage/_realtime, roles e funções
# auth.*) é pré-requisito das migrations. Garantimos + validamos aqui também,
# para que ./deploy/migrate.sh seja seguro quando executado isoladamente.
"${FUNECOB_ROOT}/deploy/bootstrap-db.sh" \
  || die "Bootstrap do banco falhou — nenhuma migration foi executada"

# As migrations criam FKs/policies sobre auth.users: o GoTrue precisa ter
# rodado as próprias migrations antes.
ensure_auth_schema 60 \
  || die "auth.users indisponível — nenhuma migration foi executada"

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
    err "Falha na migration ${version} — ela NÃO foi marcada como aplicada."
    err "Corrija a causa e rode novamente: ./deploy/migrate.sh (reexecução é segura)."
    exit 3
  fi
done

ok "Migrations: ${applied} aplicada(s), ${skipped} já existente(s)"
