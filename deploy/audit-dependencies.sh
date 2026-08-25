#!/usr/bin/env bash
# =====================================================================
# FUNecob — AUDITORIA FINAL DE DEPENDÊNCIAS
#   ./deploy/audit-dependencies.sh
#
# Somente leitura. Não altera nada no projeto nem na VPS.
# Sai com código != 0 se qualquer verificação obrigatória falhar.
#
# Exceções legítimas e documentadas:
#   * docs/*.md e supabase/migrations/*   → histórico, não afeta a VPS
#   * src/integrations/supabase/previewAuthStorage.ts (arquivo gerado):
#       cita "lovableproject.com"/"lovable.app" apenas para DETECTAR o
#       domínio de preview; não monta URL de API. Inerte na VPS.
#   * lovable-tagger (devDependency) e LOVABLE_API_KEY (fallback de OCR
#       opcional) podem permanecer.
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

FAIL=0
section() { echo; echo "───────────── $1"; }
pass() { printf "  [OK]   %s\n" "$1"; }
fail() { printf "  [ERRO] %s\n" "$1"; FAIL=$((FAIL+1)); }
info() { printf "  [info] %s\n" "$1"; }

echo "=========== FUNecob — auditoria final ==========="

# ------------------------------------------------------------- NEXUS 33
section "1. Nexus 33 (nenhuma dependência funcional permitida)"
N33="$($GREP $EXCL -e 'nexus33' -e 'nexus33_web' -e 'deploy-caddy' -e 'deploy-app' . 2>/dev/null \
        | grep -v 'audit-dependencies.sh' \
        | grep -vE '(^|/)[A-Za-z0-9_.-]+\.md:' \
        | grep -viE 'nunca|não |nao |jamais|outro projeto|# ' )"
N33_COUNT="$(printf '%s' "$N33" | grep -c . || true)"
[ -n "$N33" ] && echo "$N33"
echo "  NEXUS33 REFERENCES: ${N33_COUNT}"
[ "$N33_COUNT" -eq 0 ] && pass "nenhuma dependência do Nexus 33" || fail "referências funcionais ao Nexus 33"

# --------------------------------------------- Evolution / Mongo duplicados
section "2. Evolution API / MongoDB duplicados no compose"
EVO_C=$(grep -cE '^\s*image:\s*.*evolution' docker-compose.yml || true)
MON_C=$(grep -cE '^\s*image:\s*mongo' docker-compose.yml || true)
echo "  Evolution no compose: ${EVO_C}"
echo "  MongoDB no compose:   ${MON_C}"
[ "$EVO_C" -eq 0 ] || fail "docker-compose.yml define uma Evolution API"
[ "$MON_C" -eq 0 ] || fail "docker-compose.yml define um MongoDB"
[ "$EVO_C" -eq 0 ] && [ "$MON_C" -eq 0 ] && pass "a Evolution/Mongo já existentes são reutilizadas"

# ---------------------------------------------------- Evolution localhost
section "3. EVOLUTION_API_URL não pode usar localhost/127.0.0.1"
EVO_LOCAL="$(grep -rnE 'EVOLUTION_API_URL\s*=\s*https?://(localhost|127\.0\.0\.1)' .env.example docker-compose.yml 2>/dev/null || true)"
EVO_LOCAL_CODE="$(grep -rn 'localhost:8080\|127\.0\.0\.1:8080' src supabase/functions 2>/dev/null || true)"
echo "  localhost usado para Evolution:  $(printf '%s' "$EVO_LOCAL$EVO_LOCAL_CODE" | grep -c . || true)"
if [ -z "$EVO_LOCAL$EVO_LOCAL_CODE" ]; then
  pass "nenhum localhost/127.0.0.1 apontando para a Evolution"
else
  echo "$EVO_LOCAL$EVO_LOCAL_CODE"; fail "use http://host.docker.internal:8080"
fi
grep -q 'host.docker.internal:host-gateway' docker-compose.yml \
  && pass "extra_hosts host-gateway presente nas Edge Functions" \
  || fail "falta extra_hosts host.docker.internal:host-gateway"

# ---------------------------------------------------------------- Portas
section "4. Portas publicadas pelo compose"
PORTS="$(grep -nE '^\s+- "' docker-compose.yml | grep -E ':[0-9]+:' || true)"
echo "$PORTS"
BAD_PORTS="$(printf '%s' "$PORTS" | grep -vE '127\.0\.0\.1:' | grep -vE 'CADDY_(HTTP|HTTPS)_PORT' || true)"
if [ -z "$BAD_PORTS" ]; then
  pass "todas as portas ficam em 127.0.0.1 (Caddy só com profile 'proxy')"
else
  echo "$BAD_PORTS"; fail "porta publicada fora do loopback"
fi

# ----------------------------------------------------- Redes e volumes
section "5. Redes e volumes"
grep -nE 'name: funecob' docker-compose.yml || true
grep -qE 'name: (nexus33|deploy)_' docker-compose.yml && fail "rede/volume de outro projeto" || pass "somente recursos funecob_*"

# ------------------------------------------------------ Frontend / código
section "6. URLs externas no código de runtime"
SBCO="$($GREP $EXCL 'supabase\.co' src supabase/functions 2>/dev/null | grep -v 'functionsUrl.ts' || true)"
echo "  URLs Supabase externas no código: $(printf '%s' "$SBCO" | grep -c . || true)"
[ -z "$SBCO" ] && pass "nenhuma URL supabase.co em src/ ou supabase/functions/" || { echo "$SBCO"; fail "URL supabase.co hardcoded"; }

IPS="$(grep -rnE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' src 2>/dev/null || true)"
echo "  IPs hardcoded no frontend: $(printf '%s' "$IPS" | grep -c . || true)"
[ -z "$IPS" ] && pass "nenhum IP hardcoded no frontend" || { echo "$IPS"; fail "IP hardcoded em src/"; }

LOV="$($GREP $EXCL -e 'lovableproject' -e 'lovable\.app' src 2>/dev/null | grep -v 'previewAuthStorage.ts' || true)"
[ -z "$LOV" ] && pass "nenhuma referência Lovable fora do arquivo gerado de preview" || { echo "$LOV"; fail "referência Lovable em runtime"; }
info "exceção documentada: previewAuthStorage.ts (gerado) apenas detecta domínio de preview"

# --------------------------------------------------------- Edge Functions
section "7. Edge Functions"
EF=$(ls supabase/functions | grep -v '^_shared$' | wc -l | tr -d ' ')
echo "  funções encontradas: ${EF} (+ _shared)"
[ "$EF" -ge 14 ] && pass "todas as Edge Functions presentes" || fail "faltam Edge Functions"
HARD="$(grep -rnE 'https://[a-z0-9]+\.supabase\.co|http://(localhost|127\.0\.0\.1)' supabase/functions 2>/dev/null || true)"
[ -z "$HARD" ] && pass "nenhuma função aponta para host fixo" || { echo "$HARD"; fail "host fixo em Edge Function"; }

# ------------------------------------------------------------ Migrations
section "8. Migrations"
MIG=$(ls supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "  migrations: ${MIG}"
[ "$MIG" -ge 63 ] && pass "migrations versionadas e em ordem" || fail "migrations faltando (esperado >= 63)"
for t in organizations organization_members user_roles profiles clients invoices transactions \
         subscriptions plans client_portal_tokens system_logs webhook_configs \
         whatsapp_queue whatsapp_lid_map whatsapp_instances \
         auto_settlement_events pix_trusted_payers ocr_provider_stats; do
  grep -rqiE "create table (if not exists )?(public\.)?${t}\b" supabase/migrations \
    && printf "  [OK]   tabela %s\n" "$t" || fail "tabela ausente nas migrations: $t"
done

# ------------------------------------------------------------- Segredos
section "9. Segredos"
git ls-files 2>/dev/null | grep -E '(^|/)\.env$|\.pem$|\.key$|^secrets/|^backups/' \
  && fail "arquivo sensível rastreado — rode: git rm --cached .env && git commit" \
  || pass "nenhum arquivo sensível rastreado pelo Git"
grep -qE '^\.env$' .gitignore && pass ".env está no .gitignore" || fail ".env fora do .gitignore"
BADENV="$(grep -nE '^[A-Z_]+=.{12,}' .env.example | grep -vE '^[0-9]+:(APP_DOMAIN|API_DOMAIN|SITE_URL|PORTAL_BASE_URL|ADDITIONAL_REDIRECT_URLS|SUPABASE_PUBLIC_URL|VITE_|EVOLUTION_API_URL|MERCADOPAGO_NOTIFICATION_URL|CRON_|TZ|PGRST_|SMTP_ADMIN_EMAIL|SMTP_SENDER_NAME|ACME_EMAIL|STORAGE_FILE)' || true)"
[ -z "$BADENV" ] && pass ".env.example sem valores reais de segredo" || { echo "$BADENV"; fail "possível segredo no .env.example"; }

# ------------------------------------------------------------- Scripts
section "10. Scripts e compose"
for f in deploy/*.sh; do bash -n "$f" 2>/dev/null || fail "sintaxe inválida: $f"; done
pass "scripts bash validados (bash -n)"
if command -v docker >/dev/null 2>&1 && [ -f .env ]; then
  dc config >/dev/null 2>&1 && pass "docker compose config válido" || fail "docker compose config inválido"
else
  info "docker/.env indisponíveis aqui — valide na VPS com: docker compose -p funecob config"
fi

# ------------------------------------------------------------- Bundle
section "11. Bundle de produção (dist/)"
if [ -d dist ]; then
  for t in 'supabase.co' 'nexus33'; do
    n=$(grep -ro "$t" dist 2>/dev/null | wc -l | tr -d ' ')
    [ "$n" -eq 0 ] && pass "'$t' ausente do bundle" || fail "'$t' aparece $n vez(es) no bundle"
  done
else
  info "dist/ ausente — rode 'npm run build' ou 'docker compose -p funecob build funecob-web'"
fi

echo
echo "=========================================================="
if [ "$FAIL" -eq 0 ]; then
  printf "${C_GREEN}AUDITORIA APROVADA — nenhuma pendência bloqueante.${C_RESET}\n\n"
  exit 0
fi
printf "${C_RED}AUDITORIA REPROVADA — %s verificação(ões) falharam.${C_RESET}\n\n" "$FAIL"
exit 1
