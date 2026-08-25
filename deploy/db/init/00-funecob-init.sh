#!/bin/bash
# =====================================================================
# FUNecob — inicialização do PostgreSQL próprio (self-hosted).
# Roda UMA ÚNICA VEZ, na criação do volume funecob_db_data.
# Isolado: nenhuma relação com o Nexus 33.
# =====================================================================
set -euo pipefail

PW="${POSTGRES_PASSWORD}"
DB="${POSTGRES_DB:-postgres}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname "$DB" <<-EOSQL
  CREATE SCHEMA IF NOT EXISTS extensions;

  CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net      WITH SCHEMA extensions;

  -- Roles de serviço (a imagem supabase/postgres já as cria; aqui só garantimos senha)
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
      CREATE ROLE authenticator LOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
      CREATE ROLE supabase_admin LOGIN SUPERUSER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
      CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE;
    END IF;
  END
  \$\$;

  ALTER ROLE authenticator          WITH PASSWORD '${PW}';
  ALTER ROLE supabase_admin         WITH PASSWORD '${PW}';
  ALTER ROLE supabase_auth_admin    WITH PASSWORD '${PW}';
  ALTER ROLE supabase_storage_admin WITH PASSWORD '${PW}';

  GRANT anon, authenticated, service_role TO authenticator;

  CREATE SCHEMA IF NOT EXISTS auth      AUTHORIZATION supabase_auth_admin;
  CREATE SCHEMA IF NOT EXISTS storage   AUTHORIZATION supabase_storage_admin;
  CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;

  GRANT USAGE ON SCHEMA public     TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA auth       TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA storage    TO anon, authenticated, service_role;

  -- auth.uid() / auth.role() / auth.jwt(): usados por TODAS as policies de RLS do FUNecob
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS \$\$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  \$\$;

  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  \$\$;

  CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS \$\$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
  \$\$;

  CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS \$\$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
    )::text
  \$\$;

  GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt()
    TO anon, authenticated, service_role;
EOSQL

echo "[funecob-db] inicialização concluída."
