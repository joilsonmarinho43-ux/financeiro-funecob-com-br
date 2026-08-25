#!/usr/bin/env bash
# =====================================================================
# FUNecob — AUDITORIA DE DEPENDÊNCIAS EXTERNAS
#   ./deploy/audit-dependencies.sh
# Somente leitura. Não altera nada no projeto nem na VPS.
# =====================================================================
set -uo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$FUNECOB_ROOT"

if command -v rg >/dev/null 2>&1; then
  GREP="rg -n --hidden"
  EXCL="--glob=!node_modules --glob=!.git --glob=!backups --glob=!bun.lock* --glob=!package-lock.json --glob=!dist"
else
  GREP="grep -rn"
  EXCL="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=backups --exclude-dir=dist"
fi

section() { echo; echo "───────────── $1"; }

echo "=========== FUNecob — auditoria de dependências ==========="

section "NEXUS 33 (nenhuma dependência funcional permitida)"
N33="$($GREP $EXCL -e 'nexus33' -e 'nexus33_web' -e 'deploy-caddy' -e 'deploy-app' . 2>/dev/null \
        | grep -v 'audit-dependencies.sh' | grep -vE '^\S+\.md:' )"
N33_COUNT="$(printf '%s' "$N33" | grep -c . || true)"
[ -n "$N33" ] && echo "$N33"
echo "NEXUS33 REFERENCES: ${N33_COUNT}"

section "Evolution API / MongoDB — não pode haver serviço duplicado"
DUP=0
grep -qE 'image:\s*.*evolution-api' docker-compose.yml && { echo "  [ERRO] docker-compose.yml define uma Evolution API"; DUP=1; }
grep -qE 'image:\s*mongo' docker-compose.yml && { echo "  [ERRO] docker-compose.yml define um MongoDB"; DUP=1; }
[ "$DUP" -eq 0 ] && echo "  [OK] nenhuma Evolution API nem MongoDB definidos — a existente é reutilizada"

section "Portas publicadas pelo compose"
grep -nE '^\s+- "' docker-compose.yml | grep -E ':[0-9]+"' || echo "  nenhuma"
echo "  Esperado: apenas 127.0.0.1:54320/54321/54322 (e 80/443 só com USE_OWN_PROXY=true)"

section "Redes e volumes"
grep -nE 'name: (funecob|nexus33|deploy)_' docker-compose.yml || true

section "Supabase gerenciado (*.supabase.co) no código de runtime"
$GREP $EXCL 'supabase\.co' src supabase/functions 2>/dev/null \
  || echo "  [OK] nenhuma URL supabase.co em src/ ou supabase/functions/"
echo "  (ocorrências em docs/ e supabase/migrations/ são histórico e não afetam a VPS)"

section "Lovable"
$GREP $EXCL -e 'lovable' src supabase/functions 2>/dev/null | head -20 || echo "  [OK] nenhuma referência"
echo "  PODE SER MANTIDO: lovable-tagger (dev) e LOVABLE_API_KEY (fallback OCR opcional)"

section "Bundle de produção (dist/)"
if [ -d dist ]; then
  for t in 'supabase.co' 'nexus33' 'lovableproject' 'lovable.app'; do
    n=$(grep -ro "$t" dist 2>/dev/null | wc -l)
    if [ "$n" -eq 0 ]; then echo "  [OK]   '$t' ausente do bundle"
    else echo "  [ERRO] '$t' aparece $n vez(es) no bundle — verifique o .env de build"; fi
  done
else
  echo "  dist/ ausente — rode 'npm run build' ou 'docker compose -p funecob build funecob-web'"
fi

section "Segredos que não podem ir ao GitHub"
git ls-files 2>/dev/null | grep -E '(^|/)\.env$|\.pem$|\.key$|^secrets/|^backups/' \
  && echo "  ^ PRECISA SER CORRIGIDO: git rm --cached <arquivo>" \
  || echo "  [OK] nenhum arquivo sensível rastreado pelo Git"

echo
echo "=========================================================="
