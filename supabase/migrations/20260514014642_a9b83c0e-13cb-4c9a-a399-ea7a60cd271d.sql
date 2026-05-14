
-- Feature flag global (desligada por padrão)
INSERT INTO public.global_settings (key, value)
VALUES ('auto_settlement_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- ===== auto_settlement_events =====
CREATE TABLE public.auto_settlement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID,
  phone TEXT NOT NULL,
  raw_text TEXT,
  ocr_payload JSONB DEFAULT '{}'::jsonb,
  txid TEXT,
  pix_end_to_end_id TEXT,
  amount_detected NUMERIC,
  status TEXT NOT NULL DEFAULT 'recebido',
  whatsapp_message_id TEXT,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auto_settlement_events_txid_uniq
  ON public.auto_settlement_events(organization_id, txid)
  WHERE txid IS NOT NULL;
CREATE INDEX auto_settlement_events_org_status_idx
  ON public.auto_settlement_events(organization_id, status, created_at DESC);

ALTER TABLE public.auto_settlement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org can view auto events"
ON public.auto_settlement_events FOR SELECT TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Org can insert auto events"
ON public.auto_settlement_events FOR INSERT TO authenticated
WITH CHECK (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Org can update auto events"
ON public.auto_settlement_events FOR UPDATE TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

-- ===== auto_settlement_credits =====
CREATE TABLE public.auto_settlement_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  used_amount NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'pix_ocr',
  origin_event_id UUID,
  status TEXT NOT NULL DEFAULT 'disponivel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auto_settlement_credits_org_client_idx
  ON public.auto_settlement_credits(organization_id, client_id, status);

ALTER TABLE public.auto_settlement_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org can view auto credits"
ON public.auto_settlement_credits FOR SELECT TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Org can insert auto credits"
ON public.auto_settlement_credits FOR INSERT TO authenticated
WITH CHECK (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Org can update auto credits"
ON public.auto_settlement_credits FOR UPDATE TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

-- ===== auto_settlement_allocations =====
CREATE TABLE public.auto_settlement_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  amount_applied NUMERIC NOT NULL,
  was_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auto_settlement_allocations_event_idx ON public.auto_settlement_allocations(event_id);

ALTER TABLE public.auto_settlement_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org can view auto allocations"
ON public.auto_settlement_allocations FOR SELECT TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Org can insert auto allocations"
ON public.auto_settlement_allocations FOR INSERT TO authenticated
WITH CHECK (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

-- ===== auto_settlement_logs =====
CREATE TABLE public.auto_settlement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_id UUID,
  client_id UUID,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auto_settlement_logs_event_idx ON public.auto_settlement_logs(event_id, created_at);
CREATE INDEX auto_settlement_logs_org_idx ON public.auto_settlement_logs(organization_id, created_at DESC);

ALTER TABLE public.auto_settlement_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org can view auto logs"
ON public.auto_settlement_logs FOR SELECT TO authenticated
USING (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Org can insert auto logs"
ON public.auto_settlement_logs FOR INSERT TO authenticated
WITH CHECK (organization_id = get_user_organization_id(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

-- ===== updated_at triggers =====
CREATE TRIGGER trg_auto_events_upd BEFORE UPDATE ON public.auto_settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_auto_credits_upd BEFORE UPDATE ON public.auto_settlement_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ===== Core processing function =====
CREATE OR REPLACE FUNCTION public.auto_settlement_process_payment(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_remaining NUMERIC;
  v_inv RECORD;
  v_orig_day INT;
  v_amount NUMERIC;
  v_plan_id UUID;
  v_last_due DATE;
  v_next_due DATE;
  v_next_year INT;
  v_next_month INT;
  v_last_day INT;
  v_safe_day INT;
  v_new_id UUID;
  v_quitadas INT := 0;
  v_geradas INT := 0;
  v_credit_id UUID;
  v_max_iter INT := 24; -- proteção contra loop infinito (24 meses)
BEGIN
  SELECT * INTO v_event FROM public.auto_settlement_events
  WHERE id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'event not found');
  END IF;

  IF v_event.status = 'conciliado' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already_processed');
  END IF;

  IF v_event.client_id IS NULL THEN
    UPDATE public.auto_settlement_events SET status='erro', error_message='client not identified', updated_at=now() WHERE id=p_event_id;
    RETURN jsonb_build_object('success', false, 'error', 'client not identified');
  END IF;

  IF v_event.amount_detected IS NULL OR v_event.amount_detected <= 0 THEN
    UPDATE public.auto_settlement_events SET status='erro', error_message='invalid amount', updated_at=now() WHERE id=p_event_id;
    RETURN jsonb_build_object('success', false, 'error', 'invalid amount');
  END IF;

  UPDATE public.auto_settlement_events SET status='processando', updated_at=now() WHERE id=p_event_id;

  v_remaining := v_event.amount_detected;

  INSERT INTO public.auto_settlement_logs(organization_id, event_id, client_id, action, details)
  VALUES (v_event.organization_id, p_event_id, v_event.client_id, 'start',
          jsonb_build_object('amount', v_remaining));

  -- 1) Quita faturas abertas existentes em ordem ASC
  FOR v_inv IN
    SELECT id, amount, due_date FROM public.invoices
    WHERE client_id = v_event.client_id
      AND organization_id = v_event.organization_id
      AND status = 'aberto'
    ORDER BY due_date ASC
  LOOP
    EXIT WHEN v_remaining < v_inv.amount;

    UPDATE public.invoices
      SET status='pago', paid_date=CURRENT_DATE, updated_at=now()
      WHERE id = v_inv.id;

    INSERT INTO public.auto_settlement_allocations(organization_id, event_id, invoice_id, amount_applied, was_generated)
    VALUES (v_event.organization_id, p_event_id, v_inv.id, v_inv.amount, false);

    INSERT INTO public.auto_settlement_logs(organization_id, event_id, client_id, action, details)
    VALUES (v_event.organization_id, p_event_id, v_event.client_id, 'paid_existing',
            jsonb_build_object('invoice_id', v_inv.id, 'amount', v_inv.amount, 'due_date', v_inv.due_date));

    v_remaining := v_remaining - v_inv.amount;
    v_quitadas := v_quitadas + 1;
  END LOOP;

  -- 2) Se ainda há saldo, gera próximas mensalidades respeitando dia padrão e quita
  IF v_remaining > 0 THEN
    v_orig_day := public.client_original_due_day(v_event.client_id);

    SELECT amount, plan_id INTO v_amount, v_plan_id
    FROM public.invoices
    WHERE client_id = v_event.client_id
    ORDER BY created_at DESC LIMIT 1;

    SELECT MAX(due_date) INTO v_last_due
    FROM public.invoices WHERE client_id = v_event.client_id;

    IF v_orig_day IS NOT NULL AND v_amount IS NOT NULL AND v_amount > 0 AND v_last_due IS NOT NULL THEN
      WHILE v_remaining >= v_amount AND v_max_iter > 0 LOOP
        v_max_iter := v_max_iter - 1;
        v_next_year := EXTRACT(YEAR FROM v_last_due)::int;
        v_next_month := EXTRACT(MONTH FROM v_last_due)::int + 1;
        IF v_next_month > 12 THEN v_next_month := 1; v_next_year := v_next_year + 1; END IF;

        v_last_day := EXTRACT(DAY FROM (make_date(v_next_year, v_next_month, 1) + interval '1 month - 1 day'))::int;
        v_safe_day := LEAST(v_orig_day, v_last_day);
        v_next_due := make_date(v_next_year, v_next_month, v_safe_day);

        -- Idempotência: pula se já existe na mesma competência
        IF EXISTS (
          SELECT 1 FROM public.invoices
          WHERE client_id = v_event.client_id
            AND organization_id = v_event.organization_id
            AND date_trunc('month', due_date) = date_trunc('month', v_next_due)
        ) THEN
          v_last_due := v_next_due;
          CONTINUE;
        END IF;

        INSERT INTO public.invoices(client_id, organization_id, plan_id, amount, due_date, status, description, paid_date)
        VALUES (v_event.client_id, v_event.organization_id, v_plan_id, v_amount, v_next_due, 'pago',
                'Mensalidade — ' || to_char(v_next_due, 'TMMonth YYYY') || ' (antecipada PIX)',
                CURRENT_DATE)
        RETURNING id INTO v_new_id;

        INSERT INTO public.auto_settlement_allocations(organization_id, event_id, invoice_id, amount_applied, was_generated)
        VALUES (v_event.organization_id, p_event_id, v_new_id, v_amount, true);

        INSERT INTO public.auto_settlement_logs(organization_id, event_id, client_id, action, details)
        VALUES (v_event.organization_id, p_event_id, v_event.client_id, 'generated_and_paid',
                jsonb_build_object('invoice_id', v_new_id, 'amount', v_amount, 'due_date', v_next_due));

        v_remaining := v_remaining - v_amount;
        v_geradas := v_geradas + 1;
        v_last_due := v_next_due;
      END LOOP;
    END IF;
  END IF;

  -- 3) Sobra final → crédito
  IF v_remaining > 0 THEN
    INSERT INTO public.auto_settlement_credits(organization_id, client_id, amount, source, origin_event_id)
    VALUES (v_event.organization_id, v_event.client_id, v_remaining, 'sobra_quitacao', p_event_id)
    RETURNING id INTO v_credit_id;

    INSERT INTO public.auto_settlement_logs(organization_id, event_id, client_id, action, details)
    VALUES (v_event.organization_id, p_event_id, v_event.client_id, 'credit_generated',
            jsonb_build_object('credit_id', v_credit_id, 'amount', v_remaining));
  END IF;

  UPDATE public.auto_settlement_events
    SET status='conciliado', processed_at=now(), updated_at=now()
    WHERE id = p_event_id;

  INSERT INTO public.auto_settlement_logs(organization_id, event_id, client_id, action, details)
  VALUES (v_event.organization_id, p_event_id, v_event.client_id, 'finished',
          jsonb_build_object('quitadas', v_quitadas, 'geradas', v_geradas, 'sobra', v_remaining));

  RETURN jsonb_build_object(
    'success', true,
    'paid_existing', v_quitadas,
    'generated_and_paid', v_geradas,
    'credit_amount', v_remaining
  );
END;
$$;
