
CREATE OR REPLACE FUNCTION public.audit_recurrence_integrity(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_misaligned jsonb; v_duplicates jsonb; v_gaps jsonb; v_invalid jsonb;
BEGIN
  -- Carnês (descrição "Parcela X/Y") são ignorados: têm vencimentos legítimos
  -- variados (entrada + parcelas) e não seguem a regra de recorrência mensal.
  WITH dc AS (
    SELECT client_id, organization_id, EXTRACT(DAY FROM due_date)::int AS dia, COUNT(*) cnt, MIN(created_at) fs
    FROM invoices
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND COALESCE(description,'') !~ 'Parcela\s+\d+\s*/\s*\d+'
    GROUP BY client_id, organization_id, EXTRACT(DAY FROM due_date)::int
  ),
  od AS (
    SELECT DISTINCT ON (client_id) client_id, organization_id, dia AS dia_orig
    FROM dc ORDER BY client_id, cnt DESC, fs ASC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'invoice_id', i.id, 'client_id', i.client_id, 'organization_id', i.organization_id,
    'due_date', i.due_date, 'original_due_day', od.dia_orig
  )), '[]'::jsonb) INTO v_misaligned
  FROM invoices i JOIN od ON od.client_id = i.client_id
  WHERE i.status = 'aberto'
    AND COALESCE(i.description,'') !~ 'Parcela\s+\d+\s*/\s*\d+'
    AND (p_organization_id IS NULL OR i.organization_id = p_organization_id)
    AND EXTRACT(DAY FROM i.due_date)::int <> LEAST(od.dia_orig,
      EXTRACT(DAY FROM (date_trunc('month', i.due_date) + interval '1 month - 1 day'))::int);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'client_id', client_id, 'organization_id', organization_id,
    'competencia', competencia, 'count', cnt, 'invoice_ids', ids
  )), '[]'::jsonb) INTO v_duplicates
  FROM (
    SELECT client_id, organization_id, to_char(date_trunc('month', due_date), 'YYYY-MM') competencia,
           COUNT(*) cnt, jsonb_agg(id) ids
    FROM invoices
    WHERE status = 'aberto'
      AND COALESCE(description,'') !~ 'Parcela\s+\d+\s*/\s*\d+'
      AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    GROUP BY client_id, organization_id, date_trunc('month', due_date)
    HAVING COUNT(*) > 1
  ) d;

  WITH per_client AS (
    SELECT client_id, organization_id,
           date_trunc('month', MIN(due_date)) AS first_m,
           date_trunc('month', MAX(due_date)) AS last_m,
           array_agg(DISTINCT date_trunc('month', due_date)::date) AS months
    FROM invoices
    WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      AND COALESCE(description,'') !~ 'Parcela\s+\d+\s*/\s*\d+'
    GROUP BY client_id, organization_id
    HAVING COUNT(DISTINCT date_trunc('month', due_date)) > 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'client_id', client_id, 'organization_id', organization_id, 'missing_months', missing
  )), '[]'::jsonb) INTO v_gaps
  FROM (
    SELECT client_id, organization_id,
      ARRAY(SELECT to_char(gs, 'YYYY-MM') FROM generate_series(first_m, last_m, interval '1 month') gs WHERE NOT (gs::date = ANY(months))) AS missing
    FROM per_client
  ) x WHERE array_length(missing, 1) > 0;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('invoice_id', id, 'client_id', client_id, 'due_date', due_date)), '[]'::jsonb) INTO v_invalid
  FROM invoices
  WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
    AND (due_date IS NULL OR due_date < '2000-01-01' OR due_date > '2100-01-01');

  RETURN jsonb_build_object(
    'misaligned', v_misaligned, 'duplicates', v_duplicates, 'gaps', v_gaps, 'invalid_dates', v_invalid,
    'summary', jsonb_build_object(
      'misaligned_count', jsonb_array_length(v_misaligned),
      'duplicate_groups', jsonb_array_length(v_duplicates),
      'clients_with_gaps', jsonb_array_length(v_gaps),
      'invalid_count', jsonb_array_length(v_invalid)
    )
  );
END; $function$;
