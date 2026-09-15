-- FuneCob: harden recurrence helpers against tenant-scope ambiguity.
-- Additive migration: preserves existing financial protections.

-- client_original_due_day() is SECURITY DEFINER and therefore keeps its
-- recurrence history explicitly tied to the organization stored on the client.
CREATE OR REPLACE FUNCTION public.client_original_due_day(p_client_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXTRACT(DAY FROM i.due_date)::int
  FROM public.invoices i
  JOIN public.clients c
    ON c.id = i.client_id
   AND c.organization_id = i.organization_id
  WHERE i.client_id = p_client_id
    AND i.organization_id = c.organization_id
  GROUP BY EXTRACT(DAY FROM i.due_date)::int
  ORDER BY COUNT(*) DESC, MIN(i.created_at) ASC
  LIMIT 1
$$;

-- The integrity report is diagnostic but reads financial data under
-- SECURITY DEFINER. A tenant member may inspect only their own organization;
-- an admin/service-role caller may request a global report.
CREATE OR REPLACE FUNCTION public.audit_recurrence_integrity(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_misaligned jsonb;
  v_duplicates jsonb;
  v_gaps jsonb;
  v_invalid jsonb;
  v_caller_org uuid;
  v_is_admin boolean;
BEGIN
  v_is_admin := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);
  v_caller_org := public.get_user_organization_id(auth.uid());

  IF auth.uid() IS NOT NULL AND NOT v_is_admin THEN
    IF v_caller_org IS NULL THEN
      RAISE EXCEPTION 'Usuário sem organização';
    END IF;
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id é obrigatório para usuário não-admin';
    END IF;
    IF p_organization_id <> v_caller_org THEN
      RAISE EXCEPTION 'Acesso negado à organização solicitada';
    END IF;
  END IF;

  WITH dc AS (
    SELECT client_id, organization_id,
           EXTRACT(DAY FROM due_date)::int AS dia,
           COUNT(*) cnt,
           MIN(created_at) fs
    FROM public.invoices
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
    GROUP BY client_id, organization_id, EXTRACT(DAY FROM due_date)::int
  ),
  od AS (
    SELECT DISTINCT ON (client_id, organization_id)
           client_id, organization_id, dia AS dia_orig
    FROM dc
    ORDER BY client_id, organization_id, cnt DESC, fs ASC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'invoice_id', i.id,
    'client_id', i.client_id,
    'organization_id', i.organization_id,
    'due_date', i.due_date,
    'original_due_day', od.dia_orig
  )), '[]'::jsonb)
  INTO v_misaligned
  FROM public.invoices i
  JOIN od
    ON od.client_id = i.client_id
   AND od.organization_id = i.organization_id
  WHERE i.status = 'aberto'
    AND (p_organization_id IS NULL OR i.organization_id = p_organization_id)
    AND EXTRACT(DAY FROM i.due_date)::int <> LEAST(
      od.dia_orig,
      EXTRACT(DAY FROM (date_trunc('month', i.due_date) + interval '1 month - 1 day'))::int
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'client_id', client_id,
    'organization_id', organization_id,
    'competencia', competencia,
    'count', cnt,
    'invoice_ids', ids
  )), '[]'::jsonb)
  INTO v_duplicates
  FROM (
    SELECT client_id,
           organization_id,
           to_char(date_trunc('month', due_date), 'YYYY-MM') AS competencia,
           COUNT(*) AS cnt,
           jsonb_agg(id) AS ids
    FROM public.invoices
    WHERE status = 'aberto'
      AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    GROUP BY client_id, organization_id, date_trunc('month', due_date)
    HAVING COUNT(*) > 1
  ) d;

  WITH per_client AS (
    SELECT client_id,
           organization_id,
           date_trunc('month', MIN(due_date)) AS first_m,
           date_trunc('month', MAX(due_date)) AS last_m,
           array_agg(DISTINCT date_trunc('month', due_date)::date) AS months
    FROM public.invoices
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
    GROUP BY client_id, organization_id
    HAVING COUNT(DISTINCT date_trunc('month', due_date)) > 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'client_id', client_id,
    'organization_id', organization_id,
    'missing_months', missing
  )), '[]'::jsonb)
  INTO v_gaps
  FROM (
    SELECT client_id,
           organization_id,
           ARRAY(
             SELECT to_char(gs, 'YYYY-MM')
             FROM generate_series(first_m, last_m, interval '1 month') gs
             WHERE NOT (gs::date = ANY(months))
           ) AS missing
    FROM per_client
  ) x
  WHERE array_length(missing, 1) > 0;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'invoice_id', id,
    'client_id', client_id,
    'organization_id', organization_id,
    'due_date', due_date
  )), '[]'::jsonb)
  INTO v_invalid
  FROM public.invoices
  WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
    AND (due_date IS NULL OR due_date < '2000-01-01' OR due_date > '2100-01-01');

  RETURN jsonb_build_object(
    'misaligned', v_misaligned,
    'duplicates', v_duplicates,
    'gaps', v_gaps,
    'invalid_dates', v_invalid,
    'summary', jsonb_build_object(
      'misaligned_count', jsonb_array_length(v_misaligned),
      'duplicate_groups', jsonb_array_length(v_duplicates),
      'clients_with_gaps', jsonb_array_length(v_gaps),
      'invalid_count', jsonb_array_length(v_invalid)
    )
  );
END;
$$;
