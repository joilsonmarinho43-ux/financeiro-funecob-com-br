-- Optional scheduling/network extensions.
-- pg_net requires shared_preload_libraries and is not available in every
-- self-hosted PostgreSQL image. Its absence must never block migrations.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pg_net indisponível: %', SQLERRM;
  END;
END
$$;
