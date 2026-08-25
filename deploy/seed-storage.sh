#!/usr/bin/env bash
# =====================================================================
# FUNecob — cria os buckets de Storage no ambiente próprio.
#   logos    -> público  (logotipos das organizações)
#   receipts -> privado  (comprovantes PIX)
# Idempotente: não recria nem apaga buckets existentes.
# =====================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_env

psql_root -q <<SQL
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('logos', 'logos', true, ${STORAGE_FILE_SIZE_LIMIT:-52428800})
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('receipts', 'receipts', false, ${STORAGE_FILE_SIZE_LIMIT:-52428800})
ON CONFLICT (id) DO NOTHING;
SQL

ok "Buckets 'logos' (público) e 'receipts' (privado) garantidos"
