-- =====================================================================
-- FUNecob — BOOTSTRAP IDEMPOTENTE DO POSTGRESQL
--
-- Este arquivo é a ÚNICA fonte de verdade da infraestrutura interna do
-- banco (schemas, roles, extensões e funções auth.*). Ele é executado:
--
--   1) na criação do volume, por /docker-entrypoint-initdb.d/00-funecob-init.sh
--   2) SEMPRE antes das migrations, por ./deploy/bootstrap-db.sh
--      (install.sh e update.sh) — inclusive em volumes já existentes.
--
-- Pode ser executado quantas vezes for necessário: não apaga, não
-- duplica e não sobrescreve dados da aplicação.
--
-- Requer a variável psql :db_password (senha das roles de serviço).
-- =====================================================================

\set ON_ERROR_STOP on

-- A senha vai para uma GUC de sessão: variáveis psql (:'db_password') não
-- são interpoladas com segurança dentro de blocos DO $$ ... $$.
SELECT set_config('funecob.db_password', :'db_password', false);

-- ------------------------------------------------------------ schemas base
CREATE SCHEMA IF NOT EXISTS extensions;

-- ------------------------------------------------------------ extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pg_cron indisponível: % (agendamentos ficam a cargo do funecob-cron)', SQLERRM;
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pg_net indisponível: %', SQLERRM;
  END;
END
$$;

-- ------------------------------------------------------------ roles
DO $$
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
$$;

-- senhas das roles de serviço sempre alinhadas ao .env atual
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin']
  LOOP
    EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', r, current_setting('funecob.db_password'));
  END LOOP;
END
$$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO supabase_admin;

-- ------------------------------------------------------------ schemas de serviço
CREATE SCHEMA IF NOT EXISTS auth      AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage   AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;

-- Volumes antigos podem ter os schemas com o owner errado (ex.: postgres):
-- o GoTrue/Storage exigem ser donos para rodar as próprias migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles o ON o.oid = n.nspowner
             WHERE n.nspname = 'auth' AND o.rolname <> 'supabase_auth_admin') THEN
    EXECUTE 'ALTER SCHEMA auth OWNER TO supabase_auth_admin';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles o ON o.oid = n.nspowner
             WHERE n.nspname = 'storage' AND o.rolname <> 'supabase_storage_admin') THEN
    EXECUTE 'ALTER SCHEMA storage OWNER TO supabase_storage_admin';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles o ON o.oid = n.nspowner
             WHERE n.nspname = '_realtime' AND o.rolname <> 'supabase_admin') THEN
    EXECUTE 'ALTER SCHEMA _realtime OWNER TO supabase_admin';
  END IF;
END
$$;

-- ------------------------------------------------------------ grants de schema
GRANT USAGE ON SCHEMA public     TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth       TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage    TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA auth       TO supabase_auth_admin;
GRANT ALL   ON SCHEMA storage    TO supabase_storage_admin;
GRANT ALL   ON SCHEMA _realtime  TO supabase_admin;
GRANT CREATE, USAGE ON SCHEMA public TO postgres, supabase_admin;

-- Roles de serviço precisam enxergar objetos criados depois pelo GoTrue/Storage.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth
  GRANT SELECT ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON TABLES TO postgres, service_role;

-- ------------------------------------------------------------ funções auth.*
-- Usadas por TODAS as policies de RLS do FUNecob.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$fn$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$fn$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$fn$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['auth.uid()','auth.role()','auth.email()','auth.jwt()']
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role, postgres', f);
  END LOOP;
END
$$;

-- ------------------------------------------------------------ controle de migrations
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ verificação
DO $$
DECLARE missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')      THEN missing := missing || ' schema:auth';      END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage')   THEN missing := missing || ' schema:storage';   END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '_realtime') THEN missing := missing || ' schema:_realtime'; END IF;
  IF to_regprocedure('auth.uid()')   IS NULL THEN missing := missing || ' fn:auth.uid';   END IF;
  IF to_regprocedure('auth.role()')  IS NULL THEN missing := missing || ' fn:auth.role';  END IF;
  IF to_regprocedure('auth.jwt()')   IS NULL THEN missing := missing || ' fn:auth.jwt';   END IF;
  IF to_regprocedure('auth.email()') IS NULL THEN missing := missing || ' fn:auth.email'; END IF;
  IF missing <> '' THEN
    RAISE EXCEPTION 'bootstrap incompleto:%', missing;
  END IF;
END
$$;
