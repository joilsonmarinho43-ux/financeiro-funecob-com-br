#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# REAL E2E test: action=baixa against production bip-receiver.
# Pays a real invoice, validates the full flow, prints results.
#
# ⚠️  ROLLBACK is NOT done by this script (requires admin SQL access).
#     After running, manually revert via Supabase SQL:
#       UPDATE invoices SET status='aberto', paid_date=NULL
#         WHERE id='<INVOICE_ID>';
#       DELETE FROM bips WHERE id='<bip_id from response>';
#
# Usage: bash extension-tests/scripts/real-baixa-test.sh
# ─────────────────────────────────────────────────────────────────────
set -uo pipefail

ENDPOINT="https://jxhgssqzyhrlfpvlqliv.supabase.co/functions/v1/bip-receiver"
API_KEY="${BIP_API_KEY:-}"
ORG_ID="eaf58dbe-f43a-479e-97d8-e0078f3a7af9"

if [ -z "$API_KEY" ]; then
  echo "❌ FAIL: BIP_API_KEY environment variable is required."
  exit 1
fi

# Default target: Raimundo Furtado, R$42, due 2026-04-05
INVOICE_ID="${INVOICE_ID:-dfb5b34a-5c8b-40c7-b8f0-229ca2fa7a5a}"
BARCODE="${BARCODE:-0018753202604}"

PASS=0; FAIL=0
pass(){ echo "  ✅ PASS: $1"; PASS=$((PASS+1)); }
fail(){ echo "  ❌ FAIL: $1"; FAIL=$((FAIL+1)); }
hdr(){  echo ""; echo "════════ $1 ════════"; }

q(){ psql -tAX -c "$1" 2>/dev/null || true; }

hdr "1) SNAPSHOT BEFORE"
BEFORE_STATUS=$(q "SELECT status FROM invoices WHERE id='$INVOICE_ID'")
echo "  invoice.status: ${BEFORE_STATUS:-<no psql access>}"
echo "  invoice_id   : $INVOICE_ID"
echo "  barcode      : $BARCODE"

hdr "2) POST REAL action=baixa"
T0=$(date +%s%3N)
RESP=$(curl -s -w "\n__HTTP__%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d "{\"barcode\":\"$BARCODE\",\"action\":\"baixa\"}")
T1=$(date +%s%3N)
HTTP=$(echo "$RESP" | tail -1 | sed 's/__HTTP__//')
BODY=$(echo "$RESP" | sed '$d')
echo "  HTTP    : $HTTP   latency: $((T1-T0))ms"
echo "  body    : $BODY"
[ "$HTTP" = "200" ]                       && pass "HTTP 200"        || fail "HTTP=$HTTP"
echo "$BODY" | grep -q '"success":true'   && pass "success:true"     || fail "success != true"
echo "$BODY" | grep -q '"ignored":true'   && fail "ignored:true"     || pass "não ignorado"

BIP_ID=$(echo "$BODY" | grep -oE '"bip_id":"[^"]+"' | cut -d'"' -f4)
echo "  bip_id (para rollback manual): $BIP_ID"

hdr "3) IDEMPOTÊNCIA"
RESP2=$(curl -s -X POST "$ENDPOINT" -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d "{\"barcode\":\"$BARCODE\",\"action\":\"baixa\"}")
echo "  body    : $RESP2"
echo "$RESP2" | grep -qE '"(duplicate|already_paid)":true' && pass "2ª chamada bloqueada" || fail "idempotência falhou"

echo ""
echo "════════════════════════════════════════"
echo "  RESULTADO: $PASS PASS / $FAIL FAIL"
echo "════════════════════════════════════════"
echo ""
echo "🔁 ROLLBACK MANUAL NECESSÁRIO:"
echo "   UPDATE invoices SET status='aberto', paid_date=NULL WHERE id='$INVOICE_ID';"
[ -n "$BIP_ID" ] && echo "   DELETE FROM bips WHERE id='$BIP_ID';"
exit $FAIL
