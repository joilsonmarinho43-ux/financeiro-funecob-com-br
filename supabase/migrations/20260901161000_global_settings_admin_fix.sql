-- FUNECOB: correção definitiva de acesso administrativo às Configurações Globais
-- Motivo: o painel usa RPC has_role(), enquanto as policies antigas consultavam
-- user_roles diretamente. Em clientes autenticados isso pode falhar por RLS/permissão.

-- Garante que a checagem de administrador seja executável pelo frontend autenticado.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

-- Remove policies duplicadas/antigas e deixa uma única regra por operação.
DROP POLICY IF EXISTS "Admins can view global settings" ON public.global_settings;
DROP POLICY IF EXISTS "Admins can insert global settings" ON public.global_settings;
DROP POLICY IF EXISTS "Admins can update global settings" ON public.global_settings;
DROP POLICY IF EXISTS "Admins can delete global settings" ON public.global_settings;
DROP POLICY IF EXISTS "Authenticated can read api settings" ON public.global_settings;
DROP POLICY IF EXISTS "global_settings_admin_select" ON public.global_settings;
DROP POLICY IF EXISTS "global_settings_admin_insert" ON public.global_settings;
DROP POLICY IF EXISTS "global_settings_admin_update" ON public.global_settings;
DROP POLICY IF EXISTS "global_settings_admin_delete" ON public.global_settings;

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_settings_admin_select"
ON public.global_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "global_settings_admin_insert"
ON public.global_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "global_settings_admin_update"
ON public.global_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "global_settings_admin_delete"
ON public.global_settings
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Garante os campos esperados pela tela, sem sobrescrever valores existentes.
INSERT INTO public.global_settings (key, value)
VALUES
  ('api_host', ''),
  ('global_api_key', ''),
  ('webhook_url', ''),
  ('default_instance_name', 'Jeova'),
  ('auto_settlement_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
