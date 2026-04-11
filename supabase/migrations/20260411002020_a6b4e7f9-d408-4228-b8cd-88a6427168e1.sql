
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
  v_result jsonb;
BEGIN
  -- 1. Lock the invoice row to prevent race conditions
  SELECT id, status, amount, client_id, due_date
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fatura não encontrada');
  END IF;

  -- 2. Idempotency: already paid
  IF v_invoice.status = 'pago' THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true, 'message', 'Fatura já estava paga');
  END IF;

  -- 3. Only open invoices can be paid
  IF v_invoice.status <> 'aberto' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Fatura com status ''%s'' não pode receber baixa', v_invoice.status));
  END IF;

  -- 4. Update invoice to paid
  UPDATE invoices
  SET status = 'pago', paid_date = p_paid_date, updated_at = now()
  WHERE id = p_invoice_id;

  -- 5. Cancel all pending reminders for this invoice
  UPDATE billing_reminders
  SET status = 'cancelled'
  WHERE invoice_id = p_invoice_id
    AND status = 'pending';

  -- 6. Cancel all queued/retry WhatsApp messages for this invoice's client
  UPDATE whatsapp_queue
  SET status = 'cancelled'
  WHERE organization_id = p_organization_id
    AND status IN ('queued', 'retry')
    AND phone IN (
      SELECT phone FROM clients WHERE id = v_invoice.client_id AND phone IS NOT NULL
    );

  -- 7. Audit log
  INSERT INTO system_logs (action, user_id, organization_id, details)
  VALUES (
    'baixa_manual',
    p_user_id,
    p_organization_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'paid_date', p_paid_date,
      'amount', v_invoice.amount,
      'client_id', v_invoice.client_id
    )
  );

  -- 8. Return success with invoice data for async WhatsApp
  RETURN jsonb_build_object(
    'success', true,
    'already_paid', false,
    'client_id', v_invoice.client_id,
    'amount', v_invoice.amount,
    'message', 'Pagamento confirmado com sucesso'
  );
END;
$$;
