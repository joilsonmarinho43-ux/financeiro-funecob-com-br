
-- Add collector_id to clients (which cobrador owns them)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS collector_id uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_code text;

-- Add collector_id to whatsapp_instances (per-cobrador instance)
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS collector_id uuid;

-- Barcode config per org (configurable parsing)
CREATE TABLE IF NOT EXISTS public.barcode_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id_length integer NOT NULL DEFAULT 7,
  year_length integer NOT NULL DEFAULT 4,
  month_length integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);
ALTER TABLE public.barcode_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view org barcode config" ON public.barcode_configs FOR SELECT TO authenticated USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can manage org barcode config" ON public.barcode_configs FOR ALL TO authenticated USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- API keys per org
CREATE TABLE IF NOT EXISTS public.org_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id),
  UNIQUE(api_key)
);
ALTER TABLE public.org_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view org api keys" ON public.org_api_keys FOR SELECT TO authenticated USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can manage org api keys" ON public.org_api_keys FOR ALL TO authenticated USING (organization_id = get_user_organization_id(auth.uid())) WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- Bips table (real-time bip tracking)
CREATE TABLE IF NOT EXISTS public.bips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  collector_id uuid,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  barcode_raw text NOT NULL,
  action text NOT NULL DEFAULT 'baixa',
  amount numeric,
  new_due_date date,
  status text NOT NULL DEFAULT 'processed',
  whatsapp_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view org bips" ON public.bips FOR SELECT TO authenticated USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org bips" ON public.bips FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- Security definer function: check if user is a cobrador (restricted)
CREATE OR REPLACE FUNCTION public.is_collector(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND role = 'cobrador'
  )
$$;

-- Update clients RLS: cobradores only see their own clients
DROP POLICY IF EXISTS "Users can view org clients" ON public.clients;
CREATE POLICY "Users can view org clients" ON public.clients
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND (NOT is_collector(auth.uid()) OR collector_id = auth.uid() OR collector_id IS NULL)
  );

DROP POLICY IF EXISTS "Users can update org clients" ON public.clients;
CREATE POLICY "Users can update org clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND (NOT is_collector(auth.uid()) OR collector_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete org clients" ON public.clients;
CREATE POLICY "Users can delete org clients" ON public.clients
  FOR DELETE TO authenticated
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND (NOT is_collector(auth.uid()) OR collector_id = auth.uid())
  );

-- Invoices: cobradores only see invoices for their clients
DROP POLICY IF EXISTS "Users can view org invoices" ON public.invoices;
CREATE POLICY "Users can view org invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND (
      NOT is_collector(auth.uid())
      OR client_id IN (SELECT id FROM public.clients WHERE collector_id = auth.uid())
    )
  );

-- Enable realtime for bips
ALTER PUBLICATION supabase_realtime ADD TABLE public.bips;
