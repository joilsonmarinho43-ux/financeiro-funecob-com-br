
-- WhatsApp instances (paired devices)
CREATE TABLE public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'disconnected', -- connected, disconnected, pairing
  api_url text,
  api_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org instances" ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org instances" ON public.whatsapp_instances FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update org instances" ON public.whatsapp_instances FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can delete org instances" ON public.whatsapp_instances FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

-- WhatsApp messages
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  phone text NOT NULL,
  message text NOT NULL,
  direction text NOT NULL DEFAULT 'outgoing', -- outgoing, incoming
  status text NOT NULL DEFAULT 'pending', -- pending, sent, delivered, read, failed
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org messages" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org messages" ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update org messages" ON public.whatsapp_messages FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can delete org messages" ON public.whatsapp_messages FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

-- WhatsApp campaigns
CREATE TABLE public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft, scheduled, running, completed, cancelled
  scheduled_at timestamptz,
  total_contacts int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  min_delay int NOT NULL DEFAULT 5,
  max_delay int NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org campaigns" ON public.whatsapp_campaigns FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org campaigns" ON public.whatsapp_campaigns FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update org campaigns" ON public.whatsapp_campaigns FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can delete org campaigns" ON public.whatsapp_campaigns FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

-- Message queue
CREATE TABLE public.whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued, sending, sent, failed
  scheduled_for timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org queue" ON public.whatsapp_queue FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org queue" ON public.whatsapp_queue FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update org queue" ON public.whatsapp_queue FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
CREATE POLICY "Users can delete org queue" ON public.whatsapp_queue FOR DELETE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));
