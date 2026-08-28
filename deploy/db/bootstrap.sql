-- =====================================================================
-- FUNecob — BOOTSTRAP IDEMPOTENTE DO POSTGRESQL
--
-- Executável em volume novo ou existente. Nunca remove dados.
-- =====================================================================
\set ON_ERROR_STOP on
SELECT set_config('funecob.db_password', :'db_password', false);

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

DO $$
BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'pg_cron indisponível: %', SQLERRM; END;
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'pg_net indisponível: %', SQLERRM; END;
END $$;

DO $$
DECLARE r text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin') THEN CREATE ROLE supabase_admin LOGIN CREATEROLE CREATEDB BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_storage_admin') THEN CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN RAISE EXCEPTION 'role interna não criada: %', r; END IF;
  END LOOP;
END $$;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin'] LOOP
    EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', r, current_setting('funecob.db_password'));
  END LOOP;
END $$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO supabase_admin;

-- Os serviços Supabase executam migrations conectando-se ao banco postgres.
-- Em volumes existentes essas permissões podem não existir, então são
-- garantidas explicitamente e de forma idempotente.
GRANT CONNECT ON DATABASE postgres TO authenticator, supabase_admin, supabase_auth_admin, supabase_storage_admin;

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles o ON o.oid=n.nspowner WHERE n.nspname='auth' AND o.rolname<>'supabase_auth_admin') THEN ALTER SCHEMA auth OWNER TO supabase_auth_admin; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles o ON o.oid=nspowner WHERE n.nspname='storage' AND o.rolname<>'supabase_storage_admin') THEN ALTER SCHEMA storage OWNER TO supabase_storage_admin; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles o ON o.oid=nspowner WHERE n.nspname='_realtime' AND o.rolname<>'supabase_admin') THEN ALTER SCHEMA _realtime OWNER TO supabase_admin; END IF;
END $$;

GRANT USAGE ON SCHEMA public, extensions, auth, storage TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON SCHEMA _realtime TO supabase_admin;
GRANT CREATE, USAGE ON SCHEMA public TO postgres, supabase_admin;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['postgres','supabase_admin','authenticator','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('ALTER ROLE %I SET search_path TO public, extensions', r); END IF;
  END LOOP;
END $$;
SET search_path TO public, extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF;
END $$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(nullif(current_setting('request.jwt.claim',true),''), nullif(current_setting('request.jwt.claims',true),''))::jsonb
$fn$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid
$fn$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''), (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'))::text
$fn$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.email',true),''), (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email'))::text
$fn$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['auth.uid()','auth.role()','auth.email()','auth.jwt()'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role, postgres', f);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

DO $$
DECLARE missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin') THEN missing := missing||' role:supabase_admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN missing := missing||' role:authenticator'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN missing := missing||' role:supabase_auth_admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_storage_admin') THEN missing := missing||' role:supabase_storage_admin'; END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN missing := missing||' fn:auth.uid'; END IF;
  IF to_regprocedure('auth.role()') IS NULL THEN missing := missing||' fn:auth.role'; END IF;
  IF to_regprocedure('auth.jwt()') IS NULL THEN missing := missing||' fn:auth.jwt'; END IF;
  IF to_regprocedure('auth.email()') IS NULL THEN missing := missing||' fn:auth.email'; END IF;
  IF missing<>'' THEN RAISE EXCEPTION 'bootstrap incompleto:%', missing; END IF;
END $$;
