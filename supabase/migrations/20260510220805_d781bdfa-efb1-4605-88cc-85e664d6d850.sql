
-- Função de reparo das datas de vencimento de mensalidades recorrentes
-- Idempotente, transacional, só toca faturas com status='aberto'
CREATE OR REPLACE FUNCTION public.repair_client_due_dates(
  p_organization_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_updated int := 0;
  v_skipped_collision int := 0;
  v_total int := 0;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  FOR v_row IN
    WITH day_counts AS (
      SELECT client_id, EXTRACT(DAY FROM due_date)::int AS dia, COUNT(*) AS cnt,
        MIN(created_at) AS first_seen
      FROM invoices
      WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
      GROUP BY client_id, EXTRACT(DAY FROM due_date)::int
    ),
    original_day AS (
      SELECT DISTINCT ON (client_id) client_id, dia AS dia_original
      FROM day_counts
      ORDER BY client_id, cnt DESC, first_seen ASC
    )
    SELECT i.id AS invoice_id, i.client_id, i.organization_id, i.due_date AS due_atual,
      make_date(
        EXTRACT(YEAR FROM i.due_date)::int,
        EXTRACT(MONTH FROM i.due_date)::int,
        LEAST(o.dia_original, EXTRACT(DAY FROM (date_trunc('month', i.due_date) + interval '1 month - 1 day'))::int)
      ) AS due_proposta,
      o.dia_original
    FROM invoices i
    JOIN original_day o ON o.client_id = i.client_id
    WHERE i.status = 'aberto'
      AND (p_organization_id IS NULL OR i.organization_id = p_organization_id)
      AND EXTRACT(DAY FROM i.due_date)::int <> LEAST(o.dia_original,
        EXTRACT(DAY FROM (date_trunc('month', i.due_date) + interval '1 month - 1 day'))::int)
  LOOP
    v_total := v_total + 1;

    -- Verifica colisão: já existe outra fatura aberta do cliente nessa data nova?
    IF EXISTS (
      SELECT 1 FROM invoices
      WHERE client_id = v_row.client_id
        AND status = 'aberto'
        AND due_date = v_row.due_proposta
        AND id <> v_row.invoice_id
    ) THEN
      v_skipped_collision := v_skipped_collision + 1;
      v_changes := v_changes || jsonb_build_object(
        'invoice_id', v_row.invoice_id,
        'old', v_row.due_atual,
        'new', v_row.due_proposta,
        'skipped', 'collision'
      );
      CONTINUE;
    END IF;

    IF NOT p_dry_run THEN
      UPDATE invoices
      SET due_date = v_row.due_proposta, updated_at = now()
      WHERE id = v_row.invoice_id AND status = 'aberto';

      INSERT INTO system_logs (action, user_id, organization_id, details)
      VALUES (
        'repair_due_date',
        '00000000-0000-0000-0000-000000000000',
        v_row.organization_id,
        jsonb_build_object(
          'invoice_id', v_row.invoice_id,
          'client_id', v_row.client_id,
          'old_due_date', v_row.due_atual,
          'new_due_date', v_row.due_proposta,
          'dia_original', v_row.dia_original
        )
      );
    END IF;

    v_updated := v_updated + 1;
    v_changes := v_changes || jsonb_build_object(
      'invoice_id', v_row.invoice_id,
      'old', v_row.due_atual,
      'new', v_row.due_proposta
    );
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'total_detected', v_total,
    'updated', v_updated,
    'skipped_collision', v_skipped_collision,
    'changes', v_changes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.repair_client_due_dates(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_client_due_dates(uuid, boolean) TO authenticated, service_role;
