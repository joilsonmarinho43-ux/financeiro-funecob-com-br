-- Add payment_link column to cache gateway-generated payment URLs
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_link TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_link_provider TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_link_external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_payment_link_external_id 
  ON public.invoices(payment_link_external_id) 
  WHERE payment_link_external_id IS NOT NULL;