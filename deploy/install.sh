#!/usr/bin/env bash
# =====================================================================
# FUNecob — INSTALAÇÃO AUTOMÁTICA E IDEMPOTENTE NA VPS
#
#   git clone <REPO> funecob && cd funecob && ./deploy/install.sh
#
# Seguro para rodar VÁRIAS vezes: não apaga volumes, banco nem .env.
# Nenhum comando toca em outros projetos da VPS.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

cd "$FUNECOB_ROOT"

echo -e "${C_BOLD}"
cat <<'BANNER'
  ______ _   _ _   _        _
 |  ____| | | | \ | |      | |
 | |__  | | | |  \| | ___  | |__
 |  __| | | | | . ` |/ _ \ | '_ \
 | |    | |_| | |\  |  __/ | |_) |
 |_|     \___/|_| \_|\___| |_.__/   FUNecob — instalação independente
BANNER
echo -e "${C_RESET}"

# ------------------------------------------------------ 1. Pré-requisitos
title "1/12 Pré-requisitos"
require_tools
ok "Docker, Docker Compose e OpenSSL presentes"

# ------------------------------------------------------ 2. Diretórios
title "2/12 Diretórios"
mkdir -p "$BACKUP_DIR" deploy/db/init deploy/kong
ok "Estrutura de diretórios pronta"

# ------------------------------------------------------ 3. .env
title "3/12 Configuração (.env)"
if [ ! -f "$ENV_FILE" ]; then
  cp "${FUNECOB_ROOT}/.env.example" "$ENV_FILE"
  warn ".env criado a partir de .env.example"
  log "Gerando segredos automaticamente..."
  TMPKEYS="$(mktemp)"; ./deploy/genkeys.sh > "$TMPKEYS"
  while IFS='=' read -r k v; do
    [ -z "$k" ] && continue
    if grep -qE "^${k}=" "$ENV_FILE"; then
      # substitui a linha preservando o restante do arquivo
      python3 - "$ENV_FILE" "$k" "$v" <<'PY'
import sys
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines()
out = [f"{key}={val}" if l.startswith(key + "=") else l for l in lines]
open(path, "w").write("\n".join(out) + "\n")
PY
    else
      echo "${k}=${v}" >> "$ENV_FILE"
    fi
  done < "$TMPKEYS"
  rm -f "$TMPKEYS"
  # espelha a chave pública no bloco VITE_*
  ANONV="$(grep -E '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)"
  sed -i "s|^VITE_SUPABASE_PUBLISHABLE_KEY=.*|VITE_SUPABASE_PUBLISHABLE_KEY=${ANONV}|" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Segredos gerados e gravados em .env (permissão 600)"
  echo
  warn "AJUSTE OS DOMÍNIOS antes de continuar: APP_DOMAIN, API_DOMAIN, EVOLUTION_DOMAIN, ACME_EMAIL"
  read -rp "Abrir o .env agora para edição? [S/n] " r
  [[ "${r:-S}" =~ ^[SsYy]?$ ]] && "${EDITOR:-nano}" "$ENV_FILE"
else
  ok ".env já existe — preservado (nada foi sobrescrito)"
fi
require_env

# ------------------------------------------------------ 4. Validação
title "4/12 Validação da configuração"
missing=()
for v in APP_DOMAIN API_DOMAIN ACME_EMAIL SUPABASE_PUBLIC_URL ANON_KEY SERVICE_ROLE_KEY \
         POSTGRES_PASSWORD JWT_SECRET REALTIME_ENC_KEY REALTIME_SECRET_KEY_BASE \
         MONGO_PASSWORD EVOLUTION_API_KEY; do
  [ -z "${!v:-}" ] && missing+=("$v")
done
[ ${#missing[@]} -gt 0 ] && die "Variáveis obrigatórias vazias no .env: ${missing[*]}"
[ ${#JWT_SECRET} -ge 32 ] || die "JWT_SECRET precisa ter no mínimo 32 caracteres"
ok "Variáveis obrigatórias preenchidas"

log "Validando docker-compose.yml..."
dc config >/dev/null || die "docker-compose.yml inválido"
ok "docker-compose.yml válido"

# ------------------------------------------------------ 5. Rede
title "5/12 Rede Docker exclusiva"
ensure_network

# ------------------------------------------------------ 6. Build
title "6/12 Build das imagens"
dc build funecob-web
ok "Imagem funecob/web:latest construída"

# ------------------------------------------------------ 7. Banco
title "7/12 PostgreSQL do FUNecob"
dc up -d funecob-db
wait_healthy funecob-db 60 || die "funecob-db não subiu"

# ------------------------------------------------------ 8. Migrations
title "8/12 Migrations"
./deploy/migrate.sh

# ------------------------------------------------------ 9. Serviços
title "9/12 Subindo os demais serviços"
dc up -d
for s in funecob-auth funecob-rest funecob-storage funecob-realtime \
         funecob-edge-functions funecob-kong funecob-mongodb \
         funecob-evolution funecob-web funecob-caddy; do
  wait_healthy "$s" 40 || true
done

# ------------------------------------------------------ 10. Buckets
title "10/12 Storage (buckets)"
./deploy/seed-storage.sh || warn "Não foi possível criar os buckets agora — rode ./deploy/seed-storage.sh depois"

# ------------------------------------------------------ 11. Healthcheck
title "11/12 Verificação geral"
./deploy/healthcheck.sh || warn "Alguns serviços ainda não responderam — aguarde o DNS/HTTPS e rode ./deploy/healthcheck.sh"

# ------------------------------------------------------ 12. Resumo
title "12/12 Instalação concluída"
cat <<EOF

  Frontend .......... https://${APP_DOMAIN}
  API (Supabase) .... https://${API_DOMAIN}
  Evolution API ..... https://${EVOLUTION_DOMAIN}

  Status ............ docker compose -p funecob ps
  Logs .............. docker compose -p funecob logs -f <serviço>
  Atualizar ......... ./deploy/update.sh
  Backup ............ ./deploy/backup.sh
  Restore ........... ./deploy/restore.sh <pasta-do-backup>
  Healthcheck ....... ./deploy/healthcheck.sh

  Primeiro acesso: crie a conta administradora na tela de cadastro do app.

EOF
ok "FUNecob instalado."
