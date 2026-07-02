
-- === PIX auto-settlement improvements: score engine, candidates, OCR resiliency ===

ALTER TABLE public.auto_settlement_events
  ADD COLUMN IF NOT EXISTS candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS score integer,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS ocr_provider text,
  ADD COLUMN IF NOT EXISTS ocr_elapsed_ms integer,
  ADD COLUMN IF NOT EXISTS retry_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_to_end_id text,
  ADD COLUMN IF NOT EXISTS payer_document text;

CREATE INDEX IF NOT EXISTS idx_ase_next_retry
  ON public.auto_settlement_events (status, next_retry_at)
  WHERE status = 'erro';
CREATE INDEX IF NOT EXISTS idx_ase_score
  ON public.auto_settlement_events (organization_id, score);

-- Trusted payers: histórico "pagador X paga para cliente Y"
CREATE TABLE IF NOT EXISTS public.pix_trusted_payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  payer_name_normalized text NOT NULL,
  payer_document text,
  payment_count integer NOT NULL DEFAULT 1,
  last_amount numeric(12,2),
  last_paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trusted_payers_org_client_name
  ON public.pix_trusted_payers (organization_id, client_id, payer_name_normalized);
CREATE INDEX IF NOT EXISTS idx_trusted_payers_org_name
  ON public.pix_trusted_payers (organization_id, payer_name_normalized);
CREATE INDEX IF NOT EXISTS idx_trusted_payers_doc
  ON public.pix_trusted_payers (organization_id, payer_document)
  WHERE payer_document IS NOT NULL;

GRANT SELECT ON public.pix_trusted_payers TO authenticated;
GRANT ALL ON public.pix_trusted_payers TO service_role;

ALTER TABLE public.pix_trusted_payers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read trusted payers"
  ON public.pix_trusted_payers FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service role manages trusted payers"
  ON public.pix_trusted_payers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- OCR provider stats: quotas, últimos erros, disable temporário
CREATE TABLE IF NOT EXISTS public.ocr_provider_stats (
  provider text PRIMARY KEY,
  success_count bigint NOT NULL DEFAULT 0,
  fail_count bigint NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_fail_at timestamptz,
  last_402_at timestamptz,
  disabled_until timestamptz,
  last_error text,
  avg_elapsed_ms integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ocr_provider_stats TO authenticated;
GRANT ALL ON public.ocr_provider_stats TO service_role;

ALTER TABLE public.ocr_provider_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read ocr stats"
  ON public.ocr_provider_stats FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role manages ocr stats"
  ON public.ocr_provider_stats FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_trusted_payers_upd ON public.pix_trusted_payers;
CREATE TRIGGER trg_trusted_payers_upd BEFORE UPDATE ON public.pix_trusted_payers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS trg_ocr_stats_upd ON public.ocr_provider_stats;
CREATE TRIGGER trg_ocr_stats_upd BEFORE UPDATE ON public.ocr_provider_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
