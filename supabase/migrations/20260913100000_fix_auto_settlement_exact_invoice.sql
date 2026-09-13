-- FuneCob financial safety hardening
--
-- The previous auto_settlement_process_payment function paid the oldest open
-- invoices whenever the event amount was large enough. That is unsafe because
-- the OCR/score layer may have identified a specific invoice by exact amount,
-- while the RPC could settle a different older invoice first.
--
-- Conservative rule:
--   1. Tenant is always taken from the event and must match the client.
--   2. A single open invoice with the exact event amount is the only automatic
--      settlement target.
--   3. Multiple exact matches are ambiguous -> manual review.
--   4. No exact single match -> manual review.
--   5. No automatic advance-generation or residual credit is performed here.
--      Those cases require explicit/manual reconciliation.
--   6. Existing allocations remain the idempotency barrier.

CREATE OR REPLACE FUNCTION public.auto_settlement_process_payment(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event RECORD;
  v_invoice RECORD;
  v_match_count INT := 0;
  v_existing_allocations INT := 0;
  v_recent_dup INT := 0;
BEGIN
  SELECT *
    INTO v_event
    FROM public.auto_settlement_events
   WHERE id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'event not found');
  END IF;

  IF v_event.status = 'conciliado' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already_processed');
  END IF;

  SELECT COUNT(*)
    INTO v_existing_allocations
    FROM public.auto_settlement_allocations
   WHERE event_id = p_event_id;

  IF v_existing_allocations > 0 THEN
    UPDATE public.auto_settlement_events
       SET status = 'conciliado',
           processed_at = COALESCE(processed_at, now()),
           error_message = NULL,
           updated_at = now()
     WHERE id = p_event_id;

    INSERT INTO public.auto_settlement_logs(
      organization_id, event_id, client_id, action, details
    ) VALUES (
      v_event.organization_id,
      p_event_id,
      v_event.client_id,
      'skipped_already_allocated',
      jsonb_build_object('existing_allocations', v_existing_allocations)
    );

    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'already_allocated',
      'existing_allocations', v_existing_allocations
    );
  END IF;

  IF v_event.organization_id IS NULL OR v_event.client_id IS NULL THEN
    UPDATE public.auto_settlement_events
       SET status = 'pendente_revisao',
           error_message = 'organização ou cliente não identificado',
           updated_at = now()
     WHERE id = p_event_id;

    RETURN jsonb_build_object('success', false, 'error', 'organization/client not identified');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.clients c
     WHERE c.id = v_event.client_id
       AND c.organization_id = v_event.organization_id
  ) THEN
    UPDATE public.auto_settlement_events
       SET status = 'pendente_revisao',
           error_message = 'cliente não pertence à organização do evento',
           updated_at = now()
     WHERE id = p_event_id;

    RETURN jsonb_build_object('success', false, 'error', 'client organization mismatch');
  END IF;

  IF v_event.amount_detected IS NULL OR v_event.amount_detected <= 0 THEN
    UPDATE public.auto_settlement_events
       SET status = 'pendente_revisao',
           error_message = 'valor PIX inválido ou ausente',
           updated_at = now()
     WHERE id = p_event_id;

    RETURN jsonb_build_object('success', false, 'error', 'invalid amount');
  END IF;

  UPDATE public.auto_settlement_events
     SET status = 'processando', updated_at = now()
   WHERE id = p_event_id;

  -- Never use client + amount alone to choose among multiple invoices.
  SELECT COUNT(*)
    INTO v_match_count
    FROM public.invoices
   WHERE client_id = v_event.client_id
     AND organization_id = v_event.organization_id
     AND status = 'aberto'
     AND ABS(amount - v_event.amount_detected) <= 0.01;

  IF v_match_count = 0 THEN
    UPDATE public.auto_settlement_events
       SET status = 'pendente_revisao',
           error_message = 'nenhuma fatura aberta com valor exato do PIX; revisão manual necessária',
           updated_at = now()
     WHERE id = p_event_id;

    INSERT INTO public.auto_settlement_logs(
      organization_id, event_id, client_id, action, details
    ) VALUES (
      v_event.organization_id,
      p_event_id,
      v_event.client_id,
      'review_no_exact_invoice_match',
      jsonb_build_object('amount', v_event.amount_detected)
    );

    RETURN jsonb_build_object('success', false, 'skipped', 'no_exact_invoice_match');
  END IF;

  IF v_match_count > 1 THEN
    UPDATE public.auto_settlement_events
       SET status = 'pendente_revisao',
           error_message = 'mais de uma fatura aberta possui o mesmo valor; baixa automática bloqueada',
           updated_at = now()
     WHERE id = p_event_id;

    INSERT INTO public.auto_settlement_logs(
      organization_id, event_id, client_id, action, details
    ) VALUES (
      v_event.organization_id,
      p_event_id,
      v_event.client_id,
      'review_ambiguous_exact_amount',
      jsonb_build_object('amount', v_event.amount_detected, 'matching_invoices', v_match_count)
    );

    RETURN jsonb_build_object(
      'success', false,
      'skipped', 'ambiguous_exact_amount',
      'matching_invoices', v_match_count
    );
  END IF;

  -- Lock the only exact candidate before changing it.
  SELECT id, amount, due_date
    INTO v_invoice
    FROM public.invoices
   WHERE client_id = v_event.client_id
     AND organization_id = v_event.organization_id
     AND status = 'aberto'
     AND ABS(amount - v_event.amount_detected) <= 0.01
   FOR UPDATE;

  -- A recent paid invoice of the same amount is a duplicate signal.
  SELECT COUNT(*)
    INTO v_recent_dup
    FROM public.invoices
   WHERE client_id = v_event.client_id
     AND organization_id = v_event.organization_id
     AND status IN ('pago', 'vencido_pago')
     AND ABS(amount - v_event.amount_detected) <= 0.01
     AND paid_date >= (CURRENT_DATE - INTERVAL '2 days');

  IF v_recent_dup > 0 THEN
    UPDATE public.auto_settlement_events
       SET status = 'pendente_revisao',
           error_message = 'possível PIX duplicado: mesma quantia já foi paga nas últimas 48h',
           updated_at = now()
     WHERE id = p_event_id;

    INSERT INTO public.auto_settlement_logs(
      organization_id, event_id, client_id, action, details
    ) VALUES (
      v_event.organization_id,
      p_event_id,
      v_event.client_id,
      'skipped_duplicate_recent_paid',
      jsonb_build_object(
        'amount', v_event.amount_detected,
        'recent_paid_count', v_recent_dup,
        'invoice_candidate', v_invoice.id
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'duplicate_recent_paid',
      'recent_paid_count', v_recent_dup
    );
  END IF;

  UPDATE public.invoices
     SET status = 'pago',
         paid_date = CURRENT_DATE,
         updated_at = now()
   WHERE id = v_invoice.id
     AND organization_id = v_event.organization_id
     AND client_id = v_event.client_id
     AND status = 'aberto';

  IF NOT FOUND THEN
    UPDATE public.auto_settlement_events
       SET status = 'pendente_revisao',
           error_message = 'fatura candidata deixou de estar aberta durante a baixa; revisão necessária',
           updated_at = now()
     WHERE id = p_event_id;

    RETURN jsonb_build_object('success', false, 'error', 'invoice changed before settlement');
  END IF;

  INSERT INTO public.auto_settlement_allocations(
    organization_id, event_id, invoice_id, amount_applied, was_generated
  ) VALUES (
    v_event.organization_id,
    p_event_id,
    v_invoice.id,
    v_invoice.amount,
    false
  );

  INSERT INTO public.auto_settlement_logs(
    organization_id, event_id, client_id, action, details
  ) VALUES (
    v_event.organization_id,
    p_event_id,
    v_event.client_id,
    'paid_exact_invoice',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'amount', v_invoice.amount,
      'due_date', v_invoice.due_date
    )
  );

  UPDATE public.auto_settlement_events
     SET status = 'conciliado',
         processed_at = now(),
         error_message = NULL,
         updated_at = now()
   WHERE id = p_event_id;

  INSERT INTO public.auto_settlement_logs(
    organization_id, event_id, client_id, action, details
  ) VALUES (
    v_event.organization_id,
    p_event_id,
    v_event.client_id,
    'finished',
    jsonb_build_object('invoice_id', v_invoice.id, 'amount', v_invoice.amount)
  );

  RETURN jsonb_build_object(
    'success', true,
    'paid_existing', 1,
    'invoice_id', v_invoice.id,
    'amount', v_invoice.amount
  );
END;
$function$;
