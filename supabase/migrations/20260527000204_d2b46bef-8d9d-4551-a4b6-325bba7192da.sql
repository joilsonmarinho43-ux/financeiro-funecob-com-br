
CREATE TABLE IF NOT EXISTS public.whatsapp_lid_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  lid TEXT NOT NULL,
  client_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, lid)
);

CREATE INDEX IF NOT EXISTS idx_wa_lid_map_org_lid ON public.whatsapp_lid_map(organization_id, lid);
CREATE INDEX IF NOT EXISTS idx_wa_lid_map_client ON public.whatsapp_lid_map(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_lid_map TO authenticated;
GRANT ALL ON public.whatsapp_lid_map TO service_role;

ALTER TABLE public.whatsapp_lid_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view lid map"
ON public.whatsapp_lid_map FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org members insert lid map"
ON public.whatsapp_lid_map FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org members update lid map"
ON public.whatsapp_lid_map FOR UPDATE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org members delete lid map"
ON public.whatsapp_lid_map FOR DELETE TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
