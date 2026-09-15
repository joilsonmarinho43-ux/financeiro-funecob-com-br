-- FuneCob: harden the administrative recurrence rebuild helper.
--
-- The previous implementation reconstructed every missing month between the
-- first and last invoice while using the latest invoice amount/plan for all
-- gaps. That can fabricate historical financial records after a price or plan
-- change. This replacement is deliberately conservative: it uses the latest
-- invoice as the historical anchor and creates only future missing
-- competencies through p_until. Existing invoices are never modified.
--
-- The function remains SECURITY DEFINER and service_role-only (enforced by
-- 20260915100000_harden_recurrence_rpc_grants.sql).

CREATE OR REPLACE FUNCTION public.rebuild_client_recurrence(
  p_client_id uuid,
  p_until date DEFAULT CURRENT_DATE,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_orig_day int;
  v_amount numeric;
  v_plan_id uuid;
  v_anchor_due date;
  v_cursor date;
  v_safe_day int;
  v_last_day int;
  v_due date;
  v_created int := 0;
  v_skipped int := 0;
  v_changes jsonb := '[]'::jsonb;
  v_new_id uuid;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_id is required');
  END IF;

  IF p_until IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'until date is required');
  END IF;

  SELECT c.organization_id
    INTO v_org
  FROM public.clients c
  WHERE c.id = p_client_id;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client not found');
  END IF;

  v_orig_day := public.client_original_due_day(p_client_id);
  IF v_orig_day IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no invoice history');
  END IF;

  -- Use the most recently created invoice belonging to the same tenant as the
  -- anchor. Its amount/plan apply only to future generated competencies.
  SELECT i.amount, i.plan_id, i.due_date
    INTO v_amount, v_plan_id, v_anchor_due
  FROM public.invoices i
  WHERE i.client_id = p_client_id
    AND i.organization_id = v_org
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT 1;

  IF v_anchor_due IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no invoice history');
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid amount');
  END IF;

  -- A rebuild must never invent historical financial records. Start strictly
  -- after the latest known invoice and move forward month by month.
  v_cursor := date_trunc('month', v_anchor_due)::date + interval '1 month';

  WHILE v_cursor <= date_trunc('month', p_until)::date LOOP
    v_last_day := EXTRACT(
      DAY FROM (v_cursor + interval '1 month - 1 day')
    )::int;
    v_safe_day := LEAST(v_orig_day, v_last_day);
    v_due := make_date(
      EXTRACT(YEAR FROM v_cursor)::int,
      EXTRACT(MONTH FROM v_cursor)::int,
      v_safe_day
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.client_id = p_client_id
        AND i.organization_id = v_org
        AND date_trunc('month', i.due_date::timestamp) = v_cursor::timestamp
    ) THEN
      IF NOT p_dry_run THEN
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
          p_client_id,
          v_org,
          v_plan_id,
          v_amount,
          v_due,
          'aberto',
          'Mensalidade — ' || to_char(v_due, 'TMMonth YYYY')
        )
        RETURNING id INTO v_new_id;

        INSERT INTO public.recurrence_audit_logs (
          organization_id,
          client_id,
          invoice_id,
          new_due_date,
          original_due_day,
          reason,
          source,
          details
        )
        VALUES (
          v_org,
          p_client_id,
          v_new_id,
          v_due,
          v_orig_day,
          'repair',
          'automatic',
          jsonb_build_object(
            'trigger', 'rebuild_recurrence',
            'anchor_due_date', v_anchor_due,
            'anchor_amount', v_amount,
            'anchor_plan_id', v_plan_id
          )
        );
      END IF;

      v_created := v_created + 1;
      v_changes := v_changes || jsonb_build_object(
        'competence', to_char(v_cursor, 'YYYY-MM'),
        'due_date', v_due,
        'amount', v_amount,
        'plan_id', v_plan_id
      );
    ELSE
      v_skipped := v_skipped + 1;
    END IF;

    v_cursor := (v_cursor + interval '1 month')::date;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'created', v_created,
    'skipped_existing', v_skipped,
    'original_due_day', v_orig_day,
    'anchor_due_date', v_anchor_due,
    'anchor_amount', v_amount,
    'anchor_plan_id', v_plan_id,
    'historical_repair', false,
    'changes', v_changes
  );
END;
$function$;
