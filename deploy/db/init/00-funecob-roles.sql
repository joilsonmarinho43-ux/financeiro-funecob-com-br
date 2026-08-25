-- =====================================================================
-- FUNecob — inicialização do PostgreSQL próprio (self-hosted)
-- Executa UMA ÚNICA VEZ, na criação do volume funecob_db_data.
-- Não toca em nada fora deste banco; nenhuma relação com o Nexus 33.
-- =====================================================================

-- Extensões usadas pelo FUNecob
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net       WITH SCHEMA extensions;

-- Senhas das roles de serviço (a imagem supabase/postgres já cria as roles)
DO $$
DECLARE pw text := current_setting('custom.pgpass', true);
BEGIN
  pw := coalesce(pw, '');
END $$;

ALTER ROLE authenticator            WITH PASSWORD :'password';
ALTER ROLE supabase_auth_admin      WITH PASSWORD :'password';
ALTER ROLE supabase_storage_admin   WITH PASSWORD :'password';
ALTER ROLE supabase_admin           WITH PASSWORD :'password';

-- Schemas exigidos pelos serviços
CREATE SCHEMA IF NOT EXISTS auth       AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage    AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS _realtime  AUTHORIZATION supabase_admin;
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION supabase_admin;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- pg_cron: apenas o superusuário agenda tarefas
GRANT USAGE ON SCHEMA cron TO postgres;
