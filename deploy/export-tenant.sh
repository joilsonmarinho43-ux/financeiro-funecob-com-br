#!/usr/bin/env bash
# =====================================================================
# FUNecob — exporta TODOS os dados reais de UMA organização (tenant)
# do banco de origem para arquivos CSV locais.
#
# Uso:
#   SOURCE_DB_URL="postgresql://user:senha@host:5432/postgres" \
#     ./deploy/export-tenant.sh "Sol da Vida"
#   SOURCE_DB_URL=... ./deploy/export-tenant.sh --org-id <uuid>
#
# Saída:  ./migration-data/<slug>/  (NUNCA versionada no Git)
#   _meta.txt            organização, contagens por tabela
#   auth_users.csv       usuários do Supabase Auth (hashes de senha)
#   <tabela>.csv         uma linha de cabeçalho + dados
#
# Nenhuma credencial é gravada em código: tudo vem de SOURCE_DB_URL.
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="${ROOT}/deploy/tenant/tables.conf"
OUT_ROOT="${EXPORT_DIR:-${ROOT}/migration-data}"

die() { echo "ERRO: $*" >&2; exit 1; }
log() { echo "==> $*"; }

[ -n "${SOURCE_DB_URL:-}" ] || die "defina SOURCE_DB_URL (string de conexão do banco de ORIGEM)"
[ -f "$CONF" ] || die "arquivo $CONF não encontrado"
command -v psql >/dev/null || die "psql não encontrado"

PSQL=(psql "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -tAq)

# --- 1. resolver a organização --------------------------------------
if [ "${1:-}" = "--org-id" ]; then
  ORG_ID="${2:?informe o uuid}"
else
  ORG_NAME="${1:-Sol da Vida}"
  ORG_ID="$("${PSQL[@]}" -c "SELECT id FROM public.organizations WHERE name ILIKE '%${ORG_NAME//\'/\'\'}%' ORDER BY created_at LIMIT 1" | tr -d '[:space:]')"
  [ -n "$ORG_ID" ] || die "organização com nome parecido com '${ORG_NAME}' não encontrada"
fi

ORG_LABEL="$("${PSQL[@]}" -c "SELECT name FROM public.organizations WHERE id='${ORG_ID}'")"
[ -n "$ORG_LABEL" ] || die "organização ${ORG_ID} inexistente"
SLUG="$(echo "$ORG_LABEL" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//')"
OUT="${OUT_ROOT}/${SLUG}"
mkdir -p "$OUT"

log "Organização: ${ORG_LABEL} (${ORG_ID})"
log "Destino:     ${OUT}"

{
  echo "organization_id=${ORG_ID}"
  echo "organization_name=${ORG_LABEL}"
  echo "exported_at=$(date -u +%FT%TZ)"
} > "${OUT}/_meta.txt"

# --- 2. usuários do Auth (preserva login e senha já criptografada) ---
log "Exportando auth.users vinculados à organização..."
AUTH_COLS="$("${PSQL[@]}" -c "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='auth' AND table_name='users'")"
psql "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -q -c "\copy (SELECT ${AUTH_COLS} FROM auth.users WHERE id IN (SELECT user_id FROM public.organization_members WHERE organization_id='${ORG_ID}')) TO '${OUT}/auth_users.csv' WITH (FORMAT csv, HEADER true)"
AUTH_N=$(( $(wc -l < "${OUT}/auth_users.csv") - 1 ))
echo "auth.users=${AUTH_N}" >> "${OUT}/_meta.txt"
log "auth.users: ${AUTH_N}"

# --- 3. tabelas do tenant --------------------------------------------
while IFS='|' read -r TABLE PREDICATE; do
  case "$TABLE" in ''|\#*) continue ;; esac
  PREDICATE="${PREDICATE//%ORG%/\'${ORG_ID}\'}"
  SCHEMA="${TABLE%%.*}"; NAME="${TABLE#*.}"

  EXISTS="$("${PSQL[@]}" -c "SELECT to_regclass('${TABLE}') IS NOT NULL")"
  if [ "$EXISTS" != "t" ]; then
    echo "    (pulado) ${TABLE} não existe na origem"; continue
  fi

  COLS="$("${PSQL[@]}" -c "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='${SCHEMA}' AND table_name='${NAME}' AND is_generated='NEVER'")"
  psql "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -q \
    -c "\copy (SELECT ${COLS} FROM ${TABLE} WHERE ${PREDICATE}) TO '${OUT}/${NAME}.csv' WITH (FORMAT csv, HEADER true)"
  N=$(( $(wc -l < "${OUT}/${NAME}.csv") - 1 ))
  printf '%s=%s\n' "$TABLE" "$N" >> "${OUT}/_meta.txt"
  printf '    %-40s %6s registro(s)\n' "$TABLE" "$N"
done < "$CONF"

echo
log "Exportação concluída. Resumo em ${OUT}/_meta.txt"
log "Os CSVs contêm dados pessoais e hashes de senha — NÃO versione no Git."
