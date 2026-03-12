
-- Billing settings per organization
CREATE TABLE public.billing_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  billing_mode TEXT NOT NULL DEFAULT 'pix_direto', -- 'pix_direto' or 'gateway'
  pix_key TEXT,
  pix_key_type TEXT DEFAULT 'aleatoria', -- 'cpf', 'email', 'aleatoria', 'telefone'
  gateway_provider TEXT, -- 'asaas', 'efi', 'v3pay'
  gateway_api_key TEXT,
  gateway_webhook_url TEXT,
  reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  reminder_days_before INTEGER NOT NULL DEFAULT 2,
  template_reminder TEXT NOT NULL DEFAULT 'Olá {nome}! Sua fatura no valor de {valor} vence em {vencimento}. Fique atento para evitar atrasos.',
  template_due_date TEXT NOT NULL DEFAULT 'Olá {nome}! Sua fatura no valor de {valor} vence HOJE ({vencimento}). {link_ou_chave_pix}',
  template_overdue TEXT NOT NULL DEFAULT 'Olá {nome}! Sua fatura no valor de {valor} com vencimento em {vencimento} está em atraso. Por favor, regularize o pagamento. {link_ou_chave_pix}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org billing settings"
  ON public.billing_settings FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert org billing settings"
  ON public.billing_settings FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update org billing settings"
  ON public.billing_settings FOR UPDATE
  USING (organization_id = get_user_organization_id(auth.uid()));

-- Billing reminders log
CREATE TABLE public.billing_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- 'reminder', 'due_date', 'overdue'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org billing reminders"
  ON public.billing_reminders FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can insert org billing reminders"
  ON public.billing_reminders FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update org billing reminders"
  ON public.billing_reminders FOR UPDATE
  USING (organization_id = get_user_organization_id(auth.uid()));
