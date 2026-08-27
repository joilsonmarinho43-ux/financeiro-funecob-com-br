#!/usr/bin/env bash
# =====================================================================
# FUNecob — BOOTSTRAP IDEMPOTENTE DO POSTGRESQL + VALIDAÇÃO
#
#   ./deploy/bootstrap-db.sh            # aplica e valida
#   ./deploy/bootstrap-db.sh --verify   # apenas valida (não altera nada)
#
# Causa-raiz que este script corrige: os scripts de
# /docker-entrypoint-initdb.d SÓ rodam quando o volume funecob_db_data é
# criado. Em uma VPS que já possuía o volume, os schemas auth/storage/
# _realtime, as roles e as funções auth.*() nunca eram criados e a
# primeira migration falhava com: schema "auth" does not exist.
#
# Aqui o mesmo bootstrap é aplicado SEMPRE, antes das migrations, de
# forma idempotente e NÃO destrutiva (nenhum drop, nenhum volume rm).
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_env

VERIFY_ONLY=0
[ "${1:-}" = "--verify" ] && VERIFY_ONLY=1

BOOTSTRAP_LOCAL="${FUNECOB_ROOT}/deploy/db/bootstrap.sql"
[ -f "$BOOTSTRAP_LOCAL" ] || die "deploy/db/bootstrap.sql não encontrado"

wait_healthy funecob-db 60 || die "funecob-db indisponível — bootstrap não executado"

if [ "$VERIFY_ONLY" = "0" ]; then
  log "Aplicando bootstrap idempotente do PostgreSQL..."
  # O arquivo é montado no container (/opt/funecob/bootstrap.sql); se a
  # montagem não existir (imagem antiga), envia por stdin.
  if dc exec -T funecob-db test -f /opt/funecob/bootstrap.sql 2>/dev/null; then
    dc exec -T funecob-db psql -v ON_ERROR_STOP=1 \
      -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" \
      -v db_password="${POSTGRES_PASSWORD}" -q -f /opt/funecob/bootstrap.sql \
      || die "Bootstrap do PostgreSQL falhou — migrations NÃO foram executadas"
  else
    dc exec -T funecob-db psql -v ON_ERROR_STOP=1 \
      -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" \
      -v db_password="${POSTGRES_PASSWORD}" -q \
      < "$BOOTSTRAP_LOCAL" \
      || die "Bootstrap do PostgreSQL falhou — migrations NÃO foram executadas"
  fi
  ok "Bootstrap aplicado (schemas, roles, extensões e funções auth.*)"
fi

# ------------------------------------------------------- validação objetiva
log "Validando infraestrutura interna do banco..."
FAIL=0
_check_sql() { # <descrição> <SQL que retorna t/f>
  local desc="$1" sql="$2" res
  res="$(psql_root -tAc "$sql" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$res" = "t" ]; then
    ok "$desc"
  else
    err "$desc — AUSENTE"
    FAIL=$((FAIL+1))
  fi
}

for s in auth storage _realtime extensions public; do
  _check_sql "schema ${s}" "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='${s}')"
done
for r in anon authenticated service_role authenticator supabase_admin \
         supabase_auth_admin supabase_storage_admin; do
  _check_sql "role ${r}" "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${r}')"
done
for f in "auth.uid()" "auth.role()" "auth.jwt()" "auth.email()"; do
  _check_sql "função ${f}" "SELECT to_regprocedure('${f}') IS NOT NULL"
done
for e in uuid-ossp pgcrypto; do
  _check_sql "extensão ${e}" "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='${e}')"
done
_check_sql "controle de migrations (public.schema_migrations)" \
  "SELECT to_regclass('public.schema_migrations') IS NOT NULL"

if [ "$FAIL" -gt 0 ]; then
  die "Infraestrutura do banco incompleta (${FAIL} item(ns)). Migrations NÃO devem ser executadas."
fi
ok "Banco pronto para receber as migrations"
