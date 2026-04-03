
-- Anti-ban send configuration per org
CREATE TABLE public.whatsapp_send_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  send_window_start TIME NOT NULL DEFAULT '08:00',
  send_window_end TIME NOT NULL DEFAULT '18:00',
  max_per_minute INTEGER NOT NULL DEFAULT 3,
  max_per_hour INTEGER NOT NULL DEFAULT 60,
  max_per_day INTEGER NOT NULL DEFAULT 500,
  min_delay INTEGER NOT NULL DEFAULT 30,
  max_delay INTEGER NOT NULL DEFAULT 60,
  randomness_level TEXT NOT NULL DEFAULT 'medium',
  auto_pause_enabled BOOLEAN NOT NULL DEFAULT true,
  shuffle_order BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.whatsapp_send_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org send config"
  ON public.whatsapp_send_config FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert own org send config"
  ON public.whatsapp_send_config FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update own org send config"
  ON public.whatsapp_send_config FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization_id(auth.uid()));

-- Opt-in consent on clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS consent_given BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS consent_date TIMESTAMPTZ;

-- Soft delete audit for messages
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Add status "paused" support to whatsapp_queue
-- (no schema change needed, just using new status value)

CREATE TRIGGER update_whatsapp_send_config_updated_at
  BEFORE UPDATE ON public.whatsapp_send_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
