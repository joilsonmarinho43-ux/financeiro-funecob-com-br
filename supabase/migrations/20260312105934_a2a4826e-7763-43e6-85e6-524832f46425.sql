-- Extensões opcionais de agendamento/rede.
-- pg_net depende de shared_preload_libraries e pode não estar disponível
-- em instalações self-hosted; sua ausência não deve bloquear as migrations.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pg_net indisponível: %', SQLERRM;
  END;
END
$$;
