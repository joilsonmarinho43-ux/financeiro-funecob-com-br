-- Harden collector settlement: move invoice payment + accounting records into one
-- authorization-checked transaction. The frontend must not write financial state
-- directly to invoices/transactions/bips for this operation.

CREATE OR REPLACE FUNCTION public.perform_settlement_baixa(
  p_invoice_id uuid,
  p_organization_id uuid,
  p_barcode_raw text,
  p_paid_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_org uuid;
  v_invoice RECORD;
  v_client RECORD;
  v_is_collector boolean;
  v_whatsapp_queued boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF p_invoice_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id e organization_id são obrigatórios';
  END IF;

  IF NULLIF(trim(COALESCE(p_barcode_raw, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Código de barras é obrigatório';
  END IF;

  IF p_paid_date IS NULL THEN
    RAISE EXCEPTION 'Data de pagamento é obrigatória';
  END IF;

  v_actor_org := public.get_user_organization_id(v_actor);

  IF v_actor_org IS NULL OR v_actor_org <> p_organization_id THEN
    RAISE EXCEPTION 'Usuário não pertence à organização informada';
  END IF;

  SELECT id, status, amount, client_id, organization_id, description
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura não encontrada';
  END IF;

  IF v_invoice.status = 'pago' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_paid', true,
      'invoice_id', v_invoice.id,
      'amount', v_invoice.amount
    );
  END IF;

  IF v_invoice.status <> 'aberto' THEN
    RAISE EXCEPTION 'Fatura com status % não pode receber baixa', v_invoice.status;
  END IF;

  IF v_invoice.amount IS NULL OR v_invoice.amount <= 0 THEN
    RAISE EXCEPTION 'Valor da fatura inválido';
  END IF;

  SELECT id, organization_id, collector_id, name, phone
    INTO v_client
  FROM public.clients
  WHERE id = v_invoice.client_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente da fatura não pertence à organização';
  END IF;

  v_is_collector := public.is_collector(v_actor);

  -- A cobrador can only settle invoices assigned to that collector. Owners,
  -- admins and other organization members retain the organization-scoped path.
  IF v_is_collector AND v_client.collector_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Cobrador não autorizado para esta fatura';
  END IF;

  UPDATE public.invoices
  SET status = 'pago',
      paid_date = p_paid_date,
      updated_at = now()
  WHERE id = v_invoice.id
    AND organization_id = p_organization_id
    AND status = 'aberto';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível confirmar a baixa da fatura';
  END IF;

  INSERT INTO public.transactions (
    organization_id,
    type,
    amount,
    description,
    invoice_id,
    created_by,
    transaction_date
  ) VALUES (
    p_organization_id,
    'entrada',
    v_invoice.amount,
    format('Baixa - %s - %s', v_client.name, COALESCE(v_invoice.description, 'Fatura')),
    v_invoice.id,
    v_actor,
    p_paid_date
  );

  INSERT INTO public.bips (
    organization_id,
    client_id,
    collector_id,
    barcode_raw,
    action,
    amount,
    invoice_id,
    status
  ) VALUES (
    p_organization_id,
    v_client.id,
    v_actor,
    p_barcode_raw,
    'baixa',
    v_invoice.amount,
    v_invoice.id,
    'processed'
  );

  -- WhatsApp is ancillary to the financial transaction. If its queue insert
  -- fails, the payment remains committed and the caller receives the flag.
  IF v_client.phone IS NOT NULL AND trim(v_client.phone) <> '' THEN
    BEGIN
      INSERT INTO public.whatsapp_queue (
        organization_id,
        phone,
        message,
        status
      ) VALUES (
        p_organization_id,
        v_client.phone,
        format(
          E'✅ Pagamento confirmado!\n\nCliente: %s\nValor: R$ %s\nData: %s\n\nObrigado pelo pagamento!',
          v_client.name,
          to_char(v_invoice.amount, 'FM999999990D00'),
          to_char(p_paid_date, 'DD/MM/YYYY')
        ),
        'queued'
      );
      v_whatsapp_queued := true;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs(action, user_id, organization_id, details)
      VALUES (
        'settlement_whatsapp_queue_error',
        v_actor,
        p_organization_id,
        jsonb_build_object(
          'invoice_id', v_invoice.id,
          'client_id', v_client.id,
          'error', SQLERRM
        )
      );
    END;
  END IF;

  INSERT INTO public.system_logs(action, user_id, organization_id, details)
  VALUES (
    'baixa_settlement',
    v_actor,
    p_organization_id,
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'client_id', v_client.id,
      'amount', v_invoice.amount,
      'paid_date', p_paid_date,
      'barcode_raw', p_barcode_raw,
      'collector_id', v_actor,
      'whatsapp_queued', v_whatsapp_queued
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_paid', false,
    'invoice_id', v_invoice.id,
    'client_id', v_client.id,
    'amount', v_invoice.amount,
    'paid_date', p_paid_date,
    'whatsapp_queued', v_whatsapp_queued
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.perform_settlement_baixa(uuid, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perform_settlement_baixa(uuid, uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.perform_settlement_baixa(uuid, uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_settlement_baixa(uuid, uuid, text, date) TO service_role;
