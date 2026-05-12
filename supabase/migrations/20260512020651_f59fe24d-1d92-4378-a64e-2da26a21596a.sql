-- ============================================================
-- Auto-generate next recurring invoice after baixa
-- ============================================================

-- Helper: generate next invoice based on a paid invoice's competence
-- Returns jsonb with generated invoice info or skip reason
CREATE OR REPLACE FUNCTION public.generate_next_recurrence(
  p_paid_invoice_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_orig_day int;
  v_next_year int;
  v_next_month int;
  v_last_day int;
  v_safe_day int;
  v_next_due date;
  v_existing uuid;
  v_new_id uuid;
  v_plan_name text := 'Mensalidade';
  v_desc text;
BEGIN
  SELECT id, client_id, organization_id, plan_id, amount, due_date, status
    INTO v_inv
  FROM public.invoices
  WHERE id = p_paid_invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice not found');
  END IF;

  IF v_inv.amount IS NULL OR v_inv.amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid amount');
  END IF;

  -- Resolve original due day (most frequent across history)
  v_orig_day := public.client_original_due_day(v_inv.client_id);
  IF v_orig_day IS NULL THEN
    v_orig_day := EXTRACT(DAY FROM v_inv.due_date)::int;
  END IF;

  -- Next competence = paid invoice's month + 1
  v_next_year := EXTRACT(YEAR FROM v_inv.due_date)::int;
  v_next_month := EXTRACT(MONTH FROM v_inv.due_date)::int + 1;
  IF v_next_month > 12 THEN
    v_next_month := 1;
    v_next_year := v_next_year + 1;
  END IF;

  -- Clamp day to month length (Feb / 30 / 31)
  v_last_day := EXTRACT(DAY FROM (make_date(v_next_year, v_next_month, 1) + interval '1 month - 1 day'))::int;
  v_safe_day := LEAST(v_orig_day, v_last_day);
  v_next_due := make_date(v_next_year, v_next_month, v_safe_day);

  -- Idempotency: any invoice for that client in same competence?
  SELECT id INTO v_existing
  FROM public.invoices
  WHERE client_id = v_inv.client_id
    AND organization_id = v_inv.organization_id
    AND date_trunc('month', due_date) = date_trunc('month', v_next_due)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already_exists', 'invoice_id', v_existing);
  END IF;

  -- Plan name for description
  IF v_inv.plan_id IS NOT NULL THEN
    SELECT name INTO v_plan_name FROM public.plans WHERE id = v_inv.plan_id;
    v_plan_name := COALESCE(v_plan_name, 'Mensalidade');
  END IF;

  v_desc := v_plan_name || ' — ' ||
    to_char(v_next_due, 'TMMonth YYYY');

  INSERT INTO public.invoices (client_id, organization_id, plan_id, amount, due_date, status, description)
  VALUES (v_inv.client_id, v_inv.organization_id, v_inv.plan_id, v_inv.amount, v_next_due, 'aberto', v_desc)
  RETURNING id INTO v_new_id;

  -- Audit
  INSERT INTO public.recurrence_audit_logs(
    organization_id, client_id, invoice_id, old_due_date, new_due_date,
    original_due_day, changed_by, reason, source, details
  )
  VALUES (
    v_inv.organization_id, v_inv.client_id, v_new_id, NULL, v_next_due,
    v_orig_day, p_user_id, 'auto_generation', 'automatic',
    jsonb_build_object('trigger', 'post_baixa', 'from_invoice', p_paid_invoice_id, 'from_due_date', v_inv.due_date)
  );

  INSERT INTO public.system_logs(action, user_id, organization_id, details)
  VALUES (
    'auto_generate_next_recurrence',
    COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    v_inv.organization_id,
    jsonb_build_object(
      'paid_invoice_id', p_paid_invoice_id,
      'paid_due_date', v_inv.due_date,
      'new_invoice_id', v_new_id,
      'new_due_date', v_next_due,
      'original_due_day', v_orig_day
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'created', true,
    'invoice_id', v_new_id,
    'due_date', v_next_due,
    'original_due_day', v_orig_day
  );
END;
$$;

-- ============================================================
-- Patch perform_baixa_manual to call generator after success
-- ============================================================
CREATE OR REPLACE FUNCTION public.perform_baixa_manual(
  p_invoice_id uuid,
  p_paid_date date,
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_next_result jsonb;
BEGIN
  SELECT id, status, amount, client_id, due_date
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fatura não encontrada');
  END IF;

  IF v_invoice.status = 'pago' THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true, 'message', 'Fatura já estava paga');
  END IF;

  IF v_invoice.status <> 'aberto' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Fatura com status ''%s'' não pode receber baixa', v_invoice.status));
  END IF;

  UPDATE invoices
  SET status = 'pago', paid_date = p_paid_date, updated_at = now()
  WHERE id = p_invoice_id;

  UPDATE billing_reminders
  SET status = 'cancelled'
  WHERE invoice_id = p_invoice_id AND status = 'pending';

  UPDATE whatsapp_queue
  SET status = 'cancelled'
  WHERE organization_id = p_organization_id
    AND status IN ('queued', 'retry')
    AND phone IN (SELECT phone FROM clients WHERE id = v_invoice.client_id AND phone IS NOT NULL);

  INSERT INTO system_logs (action, user_id, organization_id, details)
  VALUES (
    'baixa_manual', p_user_id, p_organization_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id, 'paid_date', p_paid_date,
      'amount', v_invoice.amount, 'client_id', v_invoice.client_id
    )
  );

  -- ===== Auto-generate next recurrence based on competence (NOT paid_date) =====
  BEGIN
    v_next_result := public.generate_next_recurrence(p_invoice_id, p_user_id);
  EXCEPTION WHEN OTHERS THEN
    v_next_result := jsonb_build_object('success', false, 'error', SQLERRM);
    INSERT INTO system_logs(action, user_id, organization_id, details)
    VALUES ('auto_generate_next_recurrence_error', p_user_id, p_organization_id,
            jsonb_build_object('invoice_id', p_invoice_id, 'error', SQLERRM));
  END;

  RETURN jsonb_build_object(
    'success', true, 'already_paid', false,
    'client_id', v_invoice.client_id, 'amount', v_invoice.amount,
    'next_recurrence', v_next_result,
    'message', 'Pagamento confirmado com sucesso'
  );
END;
$$;

-- ============================================================
-- Backfill: rebuild missing competences for a client
-- ============================================================
CREATE OR REPLACE FUNCTION public.rebuild_client_recurrence(
  p_client_id uuid,
  p_until date DEFAULT CURRENT_DATE,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_orig_day int;
  v_amount numeric;
  v_plan_id uuid;
  v_first date;
  v_last date;
  v_cursor date;
  v_safe_day int;
  v_last_day int;
  v_due date;
  v_created int := 0;
  v_skipped int := 0;
  v_changes jsonb := '[]'::jsonb;
  v_new_id uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.clients WHERE id = p_client_id;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client not found');
  END IF;

  v_orig_day := public.client_original_due_day(p_client_id);
  IF v_orig_day IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no invoice history');
  END IF;

  SELECT amount, plan_id INTO v_amount, v_plan_id
  FROM public.invoices
  WHERE client_id = p_client_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid amount');
  END IF;

  SELECT MIN(due_date), MAX(due_date) INTO v_first, v_last
  FROM public.invoices WHERE client_id = p_client_id;

  v_cursor := date_trunc('month', v_first)::date;
  WHILE v_cursor <= date_trunc('month', GREATEST(v_last, p_until))::date LOOP
    v_last_day := EXTRACT(DAY FROM (v_cursor + interval '1 month - 1 day'))::int;
    v_safe_day := LEAST(v_orig_day, v_last_day);
    v_due := make_date(EXTRACT(YEAR FROM v_cursor)::int, EXTRACT(MONTH FROM v_cursor)::int, v_safe_day);

    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE client_id = p_client_id
        AND date_trunc('month', due_date) = v_cursor
    ) THEN
      IF NOT p_dry_run THEN
        INSERT INTO public.invoices(client_id, organization_id, plan_id, amount, due_date, status, description)
        VALUES (p_client_id, v_org, v_plan_id, v_amount, v_due, 'aberto',
                'Mensalidade — ' || to_char(v_due, 'TMMonth YYYY'))
        RETURNING id INTO v_new_id;

        INSERT INTO public.recurrence_audit_logs(
          organization_id, client_id, invoice_id, new_due_date,
          original_due_day, reason, source, details
        ) VALUES (
          v_org, p_client_id, v_new_id, v_due, v_orig_day,
          'repair', 'automatic', jsonb_build_object('trigger', 'rebuild_recurrence')
        );
      END IF;
      v_created := v_created + 1;
      v_changes := v_changes || jsonb_build_object('competence', to_char(v_cursor, 'YYYY-MM'), 'due_date', v_due);
    ELSE
      v_skipped := v_skipped + 1;
    END IF;

    v_cursor := (v_cursor + interval '1 month')::date;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'dry_run', p_dry_run,
    'created', v_created, 'skipped_existing', v_skipped,
    'original_due_day', v_orig_day, 'changes', v_changes
  );
END;
$$;