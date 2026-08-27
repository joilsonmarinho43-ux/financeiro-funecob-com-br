#!/bin/sh
# =====================================================================
# FUNecob — agendador próprio (substitui o pg_cron do Supabase Cloud)
# Roda dentro do container funecob-cron, na rede funecob_network.
# Chama as Edge Functions self-hosted através do Kong interno.
#
#   a cada 2 min ...... whatsapp-sender, pix-ocr-retry
#   diariamente 08:00 . billing-cron
#
# Nada aqui toca em outros projetos da VPS.
# =====================================================================
set -u

KONG="${KONG_INTERNAL_URL:-http://funecob-kong:8000}"
KEY="${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY ausente}"
TICK="${CRON_TICK_SECONDS:-120}"
DAILY_HOUR="$(printf '%02d' "$(( ${BILLING_CRON_HOUR:-08} + 0 ))" 2>/dev/null || echo 08)"
LAST_DAILY=""

call() {
  fn="$1"
  code="$(curl -s -o /tmp/out.$$ -w '%{http_code}' --max-time 120 \
        -X POST "${KONG}/functions/v1/${fn}" \
        -H "Authorization: Bearer ${KEY}" \
        -H "apikey: ${KEY}" \
        -H "Content-Type: application/json" \
        -d '{"source":"funecob-cron"}' 2>/dev/null)"
  echo "$(date '+%F %T') ${fn} -> HTTP ${code} $(head -c 300 /tmp/out.$$ 2>/dev/null)"
  rm -f /tmp/out.$$
}

echo "$(date '+%F %T') funecob-cron iniciado (tick=${TICK}s, billing=${DAILY_HOUR}:00)"

while :; do
  call whatsapp-sender
  call pix-ocr-retry

  TODAY="$(date '+%F')"
  HOUR="$(date '+%H')"
  if [ "$HOUR" = "$DAILY_HOUR" ] && [ "$LAST_DAILY" != "$TODAY" ]; then
    call billing-cron
    LAST_DAILY="$TODAY"
  fi

  sleep "$TICK"
done
