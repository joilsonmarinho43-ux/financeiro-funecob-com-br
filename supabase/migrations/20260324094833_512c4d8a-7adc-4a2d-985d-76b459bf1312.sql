
-- Table for client portal access tokens
CREATE TABLE public.client_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '1 year'
);

-- Index for fast token lookup
CREATE INDEX idx_portal_tokens_token ON public.client_portal_tokens(token);
CREATE INDEX idx_portal_tokens_client ON public.client_portal_tokens(client_id);

-- Unique constraint: one active token per client
CREATE UNIQUE INDEX idx_portal_tokens_client_unique ON public.client_portal_tokens(client_id);

-- Enable RLS
ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Org users can manage tokens for their clients
CREATE POLICY "Users can insert org tokens"
ON public.client_portal_tokens FOR INSERT TO authenticated
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can view org tokens"
ON public.client_portal_tokens FOR SELECT TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete org tokens"
ON public.client_portal_tokens FOR DELETE TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()));

-- Anonymous access for portal (read-only by token) - needed for the public portal
CREATE POLICY "Anyone can read token by value"
ON public.client_portal_tokens FOR SELECT TO anon
USING (true);
