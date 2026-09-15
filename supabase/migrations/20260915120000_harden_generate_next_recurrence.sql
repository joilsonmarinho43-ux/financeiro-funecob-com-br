-- FuneCob: harden the automatic next-invoice generator.
--
-- This function is an internal financial helper called by perform_baixa_manual.
-- It must only advance a genuinely paid invoice, preserve tenant ownership,
-- and never trust an arbitrary user id for audit attribution.
--
-- The function remains SECURITY DEFINER and service_role-only. The grant is
-- re-asserted below so this migration is safe even if the global grants script
-- is reapplied later.

CREATE OR REPLACE FUNCTION public.generate_next_recurrence(
  p_paid_invoice_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
  v_client_org uuid;
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
  v_actor_org uuid;
  v_actor_is_admin boolean := false;
BEGIN
  IF p_paid_invoice_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice_id is required');
  END IF;

  -- Lock the source invoice so two trusted callers cannot advance the same
  -- payment concurrently.
  SELECT
    i.id,
    i.client_id,
    i.organization_id,
    i.plan_id,
    i.amount,
    i.due_date,
    i.status
  INTO v_inv
  FROM public.invoices i
  WHERE i.id = p_paid_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice not found');
  END IF;

  -- A recurrence may only be generated from a confirmed paid invoice.
  IF v_inv.status <> 'pago' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('source invoice must be pago; current status is %s', v_inv.status)
    );
  END IF;

  IF v_inv.organization_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice organization not found');
  END IF;

  IF v_inv.client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice client not found');
  END IF;

  -- Defense in depth: the client must belong to the same tenant as the
  -- invoice before any recurrence is generated.
  SELECT c.organization_id
    INTO v_client_org
  FROM public.clients c
  WHERE c.id = v_inv.client_id;

  IF v_client_org IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client not found');
  END IF;

  IF v_client_org <> v_inv.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'client and invoice organization mismatch');
  END IF;

  -- p_user_id is supplied by the application after authenticating the user.
  -- Do not allow an arbitrary UUID to be written as the audit actor.
  -- Admins may operate across tenants; non-admin actors must belong to the
  -- invoice tenant. A NULL actor is retained for trusted system automation.
  IF p_user_id IS NOT NULL THEN
    v_actor_org := public.get_user_organization_id(p_user_id);
    v_actor_is_admin := COALESCE(public.has_role(p_user_id, 'admin'::app_role), false);

    IF NOT v_actor_is_admin AND v_actor_org IS DISTINCT FROM v_inv.organization_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'user is not authorized for invoice organization');
    END IF;
  END IF;

  IF v_inv.amount IS NULL OR v_inv.amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid amount');
  END IF;

  IF v_inv.due_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice due date not found');
  END IF;

  v_orig_day := public.client_original_due_day(v_inv.client_id);
  IF v_orig_day IS NULL THEN
    v_orig_day := EXTRACT(DAY FROM v_inv.due_date)::int;
  END IF;

  v_next_year := EXTRACT(YEAR FROM v_inv.due_date)::int;
  v_next_month := EXTRACT(MONTH FROM v_inv.due_date)::int + 1;

  IF v_next_month > 12 THEN
    v_next_month := 1;
    v_next_year := v_next_year + 1;
  END IF;

  v_last_day := EXTRACT(
    DAY FROM (make_date(v_next_year, v_next_month, 1) + interval '1 month - 1 day')
  )::int;
  v_safe_day := LEAST(v_orig_day, v_last_day);
  v_next_due := make_date(v_next_year, v_next_month, v_safe_day);

  -- Any invoice in the next competence blocks a new one, including already
  -- paid/cancelled records. The unique open-invoice index remains the final
  -- database-level race protection for concurrent creation attempts.
  SELECT i.id
    INTO v_existing
  FROM public.invoices i
  WHERE i.client_id = v_inv.client_id
    AND i.organization_id = v_inv.organization_id
    AND date_trunc('month', i.due_date::timestamp) = date_trunc('month', v_next_due::timestamp)
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'already_exists',
      'invoice_id', v_existing,
      'due_date', v_next_due,
      'original_due_day', v_orig_day
    );
  END IF;

  IF v_inv.plan_id IS NOT NULL THEN
    SELECT p.name
      INTO v_plan_name
    FROM public.plans p
    WHERE p.id = v_inv.plan_id
      AND p.organization_id = v_inv.organization_id;

    v_plan_name := COALESCE(v_plan_name, 'Mensalidade');
  END IF;

  v_desc := v_plan_name || ' — ' || to_char(v_next_due, 'TMMonth YYYY');

  INSERT INTO public.invoices (
    client_id,
    organization_id,
    plan_id,
    amount,
    due_date,
    status,
    description
  )
  VALUES (
    v_inv.client_id,
    v_inv.organization_id,
    v_inv.plan_id,
    v_inv.amount,
    v_next_due,
    'aberto',
    v_desc
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.recurrence_audit_logs (
    organization_id,
    client_id,
    invoice_id,
    old_due_date,
    new_due_date,
    original_due_day,
    changed_by,
    reason,
    source,
    details
  )
  VALUES (
    v_inv.organization_id,
    v_inv.client_id,
    v_new_id,
    NULL,
    v_next_due,
    v_orig_day,
    p_user_id,
    'auto_generation',
    'automatic',
    jsonb_build_object(
      'trigger', 'post_baixa',
      'from_invoice', p_paid_invoice_id,
      'from_due_date', v_inv.due_date,
      'from_amount', v_inv.amount,
      'from_plan_id', v_inv.plan_id,
      'actor_validated', p_user_id IS NOT NULL
    )
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
      'original_due_day', v_orig_day,
      'actor_validated', p_user_id IS NOT NULL
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
$function$;

REVOKE EXECUTE
ON FUNCTION public.generate_next_recurrence(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.generate_next_recurrence(uuid, uuid)
TO service_role;
