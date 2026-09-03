#!/usr/bin/env bash
# =====================================================================
# FUNecob — importa os dados reais de UMA organização (tenant) nos
# CSVs gerados por ./deploy/export-tenant.sh para o PostgreSQL da VPS.
#
# IDEMPOTENTE: usa tabela temporária + INSERT ... ON CONFLICT (id)
# DO NOTHING. Reexecutar NÃO duplica clientes, faturas ou histórico.
#
# Uso (na VPS, dentro de ~/funecob):
#   ./deploy/import-tenant.sh migration-data/sol-da-vida
#   ./deploy/import-tenant.sh migration-data/sol-da-vida --dry-run
#
# Requisitos: stack funecob no ar (funecob-db healthy) e .env carregado.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_env

DATA_DIR="${1:?informe a pasta com os CSVs (ex.: migration-data/sol-da-vida)}"
DRY_RUN=0
[ "${2:-}" = "--dry-run" ] && DRY_RUN=1
[ -d "$DATA_DIR" ] || die "pasta ${DATA_DIR} não encontrada"
[ -f "${DATA_DIR}/_meta.txt" ] || die "_meta.txt ausente — exportação incompleta"

CONF="${FUNECOB_ROOT}/deploy/tenant/tables.conf"
ORG_ID="$(grep '^organization_id=' "${DATA_DIR}/_meta.txt" | cut -d= -f2)"
ORG_NAME="$(grep '^organization_name=' "${DATA_DIR}/_meta.txt" | cut -d= -f2-)"
[ -n "$ORG_ID" ] || die "organization_id ausente em _meta.txt"

wait_healthy funecob-db 60 || die "funecob-db indisponível"
ensure_auth_schema 60 || die "schema auth indisponível — rode ./deploy/bootstrap-db.sh"

log "Importando organização '${ORG_NAME}' (${ORG_ID})"
[ "$DRY_RUN" = "1" ] && log "MODO DRY-RUN: nada será gravado"

# psql interno com stdin (roda como superusuário -> ignora RLS)
_psql_in() { dc exec -T funecob-db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -q "$@"; }
_psql_val() { dc exec -T funecob-db psql -tAq -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -c "$1" | tr -d '\r'; }

# ---------------------------------------------------------------------
# Carrega um CSV numa tabela de destino, de forma idempotente.
#   $1 = schema.tabela   $2 = arquivo csv
# Só usa as colunas presentes NO CSV **e** na tabela de destino, o que
# torna o import tolerante a diferenças de schema entre ambientes.
# ---------------------------------------------------------------------
load_csv() {
  local table="$1" file="$2"
  local schema="${table%%.*}" name="${table#*.}"
  [ -f "$file" ] || { echo "    (sem arquivo) ${table}"; return 0; }
  local rows; rows=$(( $(wc -l < "$file") - 1 ))
  [ "$rows" -gt 0 ] || { printf '    %-40s vazio\n' "$table"; return 0; }

  if [ "$(_psql_val "SELECT to_regclass('${table}') IS NOT NULL")" != "t" ]; then
    err "tabela ${table} não existe no destino — rode ./deploy/migrate.sh antes"; return 1
  fi

  local csv_cols dest_cols cols
  csv_cols="$(head -1 "$file" | tr -d '\r' | tr ',' '\n' | tr -d '"')"
  dest_cols="$(_psql_val "SELECT string_agg(column_name, E'\n') FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='${name}'")"
  cols="$(comm -12 <(echo "$csv_cols" | sort) <(echo "$dest_cols" | sort) | sort | paste -sd, -)"
  [ -n "$cols" ] || { err "nenhuma coluna compatível em ${table}"; return 1; }
  local csv_list; csv_list="$(echo "$csv_cols" | paste -sd, -)"

  if [ "$DRY_RUN" = "1" ]; then
    printf '    %-40s %6s linha(s) [dry-run]\n' "$table" "$rows"; return 0
  fi

  local before after
  before="$(_psql_val "SELECT count(*) FROM ${table}")"
  _psql_in <<SQL
BEGIN;
CREATE TEMP TABLE _imp (LIKE ${table} INCLUDING DEFAULTS) ON COMMIT DROP;
\copy _imp(${csv_list}) FROM STDIN WITH (FORMAT csv, HEADER true)
$(tail -n +1 "$file")
\.
INSERT INTO ${table} (${cols})
SELECT ${cols} FROM _imp
ON CONFLICT (id) DO NOTHING;
COMMIT;
SQL
  after="$(_psql_val "SELECT count(*) FROM ${table}")"
  printf '    %-40s +%s (total %s)\n' "$table" "$((after - before))" "$after"
}

# --- 1. auth.users ----------------------------------------------------
# Preserva id, e-mail e a senha JÁ criptografada. Nenhuma senha em texto
# puro é lida ou gravada; nada disso vai para o Git.
log "1/3 — usuários de autenticação"
load_csv auth.users "${DATA_DIR}/auth_users.csv"

# --- 2. tabelas do tenant, na ordem de FK -----------------------------
log "2/3 — dados da organização"
while IFS='|' read -r TABLE _PRED; do
  case "$TABLE" in ''|\#*) continue ;; esac
  load_csv "$TABLE" "${DATA_DIR}/${TABLE#*.}.csv"
done < "$CONF"

# --- 3. verificação ---------------------------------------------------
log "3/3 — verificação"
if [ "$DRY_RUN" = "0" ]; then
  _psql_in -c "SELECT o.name AS empresa,
    (SELECT count(*) FROM public.clients c WHERE c.organization_id=o.id) AS clientes,
    (SELECT count(*) FROM public.invoices i WHERE i.organization_id=o.id AND i.status <> 'pago') AS mensalidades_em_aberto,
    (SELECT count(*) FROM public.plans p WHERE p.organization_id=o.id) AS planos,
    (SELECT count(*) FROM public.organization_members m WHERE m.organization_id=o.id) AS membros
    FROM public.organizations o WHERE o.id='${ORG_ID}'"
  _psql_in -c "SELECT * FROM public.tenant_integrity_check('${ORG_ID}')" || true
fi
ok "Importação concluída (idempotente — pode ser reexecutada com segurança)"
