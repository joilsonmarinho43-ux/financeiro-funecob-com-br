-- FUNECOB: configurações globais administrativas
-- Idempotente: preserva valores existentes e apenas cria defaults ausentes.

CREATE TABLE IF NOT EXISTS public.global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_global_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_settings_updated_at ON public.global_settings;
CREATE TRIGGER trg_global_settings_updated_at
BEFORE UPDATE ON public.global_settings
FOR EACH ROW EXECUTE FUNCTION public.set_global_settings_updated_at();

INSERT INTO public.global_settings (key, value)
VALUES
  ('auto_settlement_enabled', 'false'),
  ('api_host', ''),
  ('global_api_key', ''),
  ('webhook_url', ''),
  ('default_instance_name', 'Jeova')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_settings_admin_select" ON public.global_settings;
CREATE POLICY "global_settings_admin_select"
ON public.global_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
  )
);

DROP POLICY IF EXISTS "global_settings_admin_insert" ON public.global_settings;
CREATE POLICY "global_settings_admin_insert"
ON public.global_settings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
  )
);

DROP POLICY IF EXISTS "global_settings_admin_update" ON public.global_settings;
CREATE POLICY "global_settings_admin_update"
ON public.global_settings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
  )
);

DROP POLICY IF EXISTS "global_settings_admin_delete" ON public.global_settings;
CREATE POLICY "global_settings_admin_delete"
ON public.global_settings
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
  )
);

COMMENT ON TABLE public.global_settings IS 'Configurações globais do FUNECOB, administradas por usuários com app_role=admin.';
