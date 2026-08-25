#!/usr/bin/env bash
# =====================================================================
# FUNecob — AUDITORIA DE DEPENDÊNCIAS EXTERNAS
#   ./deploy/audit-dependencies.sh
# Procura referências a Nexus 33, Lovable e Supabase gerenciado, no
# código-fonte e (se existir) no bundle de produção em dist/.
# =====================================================================
set -uo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$FUNECOB_ROOT"

GREP=$(command -v rg >/dev/null 2>&1 && echo "rg -n --hidden" || echo "grep -rn")
EXCL="--glob=!node_modules --glob=!.git --glob=!backups --glob=!bun.lock* --glob=!package-lock.json"
command -v rg >/dev/null 2>&1 || EXCL="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=backups"

section() { echo; echo "───────────── $1"; }

echo "=========== FUNecob — auditoria de dependências ==========="

section "CRÍTICO — Nexus 33 (nenhuma ocorrência permitida)"
if $GREP $EXCL -e 'nexus33' -e 'nexus33_web' -e 'deploy-caddy' -e 'deploy-app' -e 'mongodb-lab' . 2>/dev/null; then
  echo "  ^ PRECISA SER ALTERADO"
else
  echo "  [OK] nenhuma referência ao Nexus 33"
fi

section "Supabase gerenciado (*.supabase.co)"
$GREP $EXCL 'supabase\.co' . 2>/dev/null || echo "  [OK] nenhuma URL supabase.co no código"
echo "  Classificação:"
echo "    SEGURO ............ ocorrências em docs/ e supabase/migrations/ (histórico)"
echo "    PRECISA ALTERAR ... qualquer ocorrência em src/ ou no bundle dist/"

section "Lovable"
$GREP $EXCL -e 'lovable' . 2>/dev/null | head -50 || echo "  [OK] nenhuma referência"
echo "  Classificação:"
echo "    PODE SER MANTIDO .. lovable-tagger (dev only) e LOVABLE_API_KEY (fallback OCR opcional)"
echo "    PRECISA ALTERAR ... qualquer chamada obrigatória a serviço Lovable em runtime"

section "Bundle de produção (dist/)"
if [ -d dist ]; then
  for t in 'supabase.co' 'nexus33' 'lovableproject' 'lovable.app'; do
    n=$(grep -ro "$t" dist 2>/dev/null | wc -l)
    if [ "$n" -eq 0 ]; then echo "  [OK]    '$t' ausente do bundle"
    else echo "  [FALHA] '$t' aparece $n vez(es) no bundle — verifique o .env de build"; fi
  done
else
  echo "  dist/ ausente — rode 'npm run build' ou 'docker compose -p funecob build funecob-web'"
fi

section "Segredos que não podem ir ao GitHub"
git ls-files 2>/dev/null | grep -E '(^|/)\.env$|\.pem$|\.key$|^secrets/|^backups/' \
  && echo "  ^ PRECISA SER ALTERADO (git rm --cached <arquivo>)" \
  || echo "  [OK] nenhum arquivo sensível rastreado pelo Git"

echo
echo "=========================================================="
