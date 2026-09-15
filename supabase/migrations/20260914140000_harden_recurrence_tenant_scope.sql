-- FuneCob: harden recurrence helpers against tenant-scope ambiguity.
-- Additive migration: preserves existing financial protections.

-- client_original_due_day() is SECURITY DEFINER and therefore must not infer
-- recurrence history without explicitly constraining it to the client's tenant.
-- The client UUID is globally unique, but resolving its organization first makes
-- the security boundary explicit and prevents accidental cross-tenant queries if
-- the function is reused later.
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

-- Keep recurrence-integrity calculations deterministic per tenant. The previous
-- DISTINCT ON(client_id) could choose an arbitrary tenant row if this function
-- is ever called against inconsistent historical data.
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
BEGIN
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
