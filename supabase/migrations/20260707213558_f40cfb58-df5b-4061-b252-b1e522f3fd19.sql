-- Reverte baixa indevida do Joelson Queiroz da cunha em 07/07/2026
-- Causa: OCR sem sender_name; push_name "joelison" (@lid não vinculado) baixou fatura de R$ 48,50.
-- Correção aplicada no edge function: push_name-only + @lid não vinculado sem OCR pagador → revisão.

DO $$
DECLARE
  v_event_id uuid := '3b0d6264-29bd-4325-97ce-a3fb34c36c02';
  v_invoice_id uuid := '7204d9dd-9083-4e37-bfd0-0549b916e7fb';
  v_org_id uuid := 'eaf58dbe-f43a-479e-97d8-e0078f3a7af9';
  v_client_id uuid := '751a1e79-aafc-41e3-8983-da5a44436ec5';
BEGIN
  -- Reabre a fatura
  PERFORM set_config('app.allow_paid_edit', 'on', true);
  UPDATE public.invoices
     SET status = 'aberto', paid_date = NULL, updated_at = now()
   WHERE id = v_invoice_id AND status = 'pago';

  -- Remove alocações
  DELETE FROM public.auto_settlement_allocations WHERE event_id = v_event_id;

  -- Marca evento como revisão manual
  UPDATE public.auto_settlement_events
     SET status = 'pendente_revisao',
         error_message = 'Baixa revertida — push_name "joelison" (@lid) não é sinal suficiente sem OCR do pagador',
         updated_at = now()
   WHERE id = v_event_id;

  -- Log auditoria
  INSERT INTO public.auto_settlement_logs(organization_id, event_id, client_id, action, details)
  VALUES (v_org_id, v_event_id, v_client_id, 'rolled_back_wrong_auto_settlement',
          jsonb_build_object(
            'invoice_id', v_invoice_id,
            'amount', 48.50,
            'reason', 'push_name_only_with_lid_no_ocr_sender',
            'reverted_at', now()
          ));

  INSERT INTO public.system_logs(action, user_id, organization_id, details)
  VALUES ('rollback_wrong_auto_settlement',
          '00000000-0000-0000-0000-000000000000',
          v_org_id,
          jsonb_build_object(
            'event_id', v_event_id, 'client_id', v_client_id, 'invoice_id', v_invoice_id,
            'amount', 48.50, 'client_name', 'Joelson Queiroz da cunha'
          ));
END $$;