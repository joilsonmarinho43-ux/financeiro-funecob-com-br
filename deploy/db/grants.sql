-- =====================================================================
-- FUNecob — GRANTs do schema public (idempotente).
-- No Supabase Cloud a plataforma aplica ALTER DEFAULT PRIVILEGES internos
-- que NÃO aparecem nas migrations exportadas. No self-hosted isso se perde
-- e o PostgREST responde "permission denied for table ..." mesmo com RLS
-- correta (GRANT é verificado ANTES da RLS).
-- Este arquivo roda SEMPRE, depois das migrations.
-- =====================================================================

GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;

-- Objetos já existentes (ALTER DEFAULT PRIVILEGES não retroage).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT                          ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL                             ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Objetos futuros.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['postgres','supabase_admin'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO anon', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO service_role', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role', r);
    END IF;
  END LOOP;
END $$;

-- Storage: o client autenticado precisa ler buckets/objects via PostgREST/Storage API.
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT ALL ON storage.objects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
