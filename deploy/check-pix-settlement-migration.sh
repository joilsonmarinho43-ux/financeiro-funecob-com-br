#!/usr/bin/env bash
set -euo pipefail

# Executar no diretório do projeto na VPS. Copia apenas a estrutura do banco
# para um banco descartável; nunca lê nem altera dados de clientes.
cd "$(dirname "$0")/.."
db="funecob_pix_audit_$(date +%s)_$$"
db="${db//[^a-zA-Z0-9_]/_}"
dc=(docker compose -p funecob exec -T funecob-db)
cleanup() {
  "${dc[@]}" dropdb -U postgres --if-exists --force "$db" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${dc[@]}" createdb -U postgres "$db"
"${dc[@]}" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" -q -c 'DROP SCHEMA public CASCADE' >/dev/null
"${dc[@]}" pg_dump -U postgres -d postgres --schema-only --schema=public --schema=auth --no-owner --no-privileges --no-comments \
  | "${dc[@]}" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" -q >/dev/null

"${dc[@]}" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" \
  -f /dev/stdin < supabase/migrations/20260925180000_guard_auto_settlement_duplicates.sql >/dev/null

"${dc[@]}" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" -Atc \
  "SELECT CASE WHEN pg_get_functiondef('public.auto_settlement_process_payment(uuid)'::regprocedure) LIKE '%pg_advisory_xact_lock%' THEN 'PASS: migração compila no esquema real' ELSE 'FAIL: proteção ausente' END" \
  | grep -F 'PASS: migração compila no esquema real'
