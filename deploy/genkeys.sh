#!/usr/bin/env bash
# =====================================================================
# FUNecob — geração de segredos e JWTs (anon / service_role).
# Uso: ./deploy/genkeys.sh          -> imprime um bloco pronto para o .env
#      ./deploy/genkeys.sh JWT_SECRET  -> usa um JWT_SECRET já existente
# =====================================================================
set -euo pipefail

JWT_SECRET="${1:-$(openssl rand -hex 32)}"
IAT="$(date +%s)"
EXP="$(( IAT + 60*60*24*365*10 ))"   # 10 anos

b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

sign() {
  local role="$1"
  local header payload data sig
  header="$(printf '{"alg":"HS256","typ":"JWT"}' | b64)"
  payload="$(printf '{"iss":"funecob","role":"%s","iat":%s,"exp":%s}' "$role" "$IAT" "$EXP" | b64)"
  data="${header}.${payload}"
  sig="$(printf '%s' "$data" | openssl dgst -binary -sha256 -hmac "$JWT_SECRET" | b64)"
  printf '%s.%s' "$data" "$sig"
}

cat <<EOF
JWT_SECRET=${JWT_SECRET}
ANON_KEY=$(sign anon)
SERVICE_ROLE_KEY=$(sign service_role)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
MONGO_PASSWORD=$(openssl rand -hex 24)
REALTIME_ENC_KEY=$(openssl rand -hex 16)
REALTIME_SECRET_KEY_BASE=$(openssl rand -hex 32)
EVOLUTION_API_KEY=$(openssl rand -hex 32)
EVOLUTION_WEBHOOK_SECRET=$(openssl rand -hex 32)
BIP_API_KEY=$(openssl rand -hex 32)
EOF
