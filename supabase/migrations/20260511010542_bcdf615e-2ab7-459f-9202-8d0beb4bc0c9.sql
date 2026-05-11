CREATE TABLE IF NOT EXISTS public.recurrence_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  client_id uuid,
  invoice_id uuid,
  old_due_date date,
  new_due_date date,
  original_due_day int,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'automatic',
  details jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ral_org_changed ON public.recurrence_audit_logs(organization_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ral_client ON public.recurrence_audit_logs(client_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ral_invoice ON public.recurrence_audit_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ral_reason ON public.recurrence_audit_logs(reason, changed_at DESC);

ALTER TABLE public.recurrence_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view audit" ON public.recurrence_audit_logs;
CREATE POLICY "Org members can view audit" ON public.recurrence_audit_logs FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "System can insert audit" ON public.recurrence_audit_logs;
CREATE POLICY "System can insert audit" ON public.recurrence_audit_logs FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_invoices_client_due ON public.invoices(client_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status_due ON public.invoices(organization_id, status, due_date);

CREATE OR REPLACE FUNCTION public.client_original_due_day(p_client_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXTRACT(DAY FROM due_date)::int
  FROM public.invoices
  WHERE client_id = p_client_id
  GROUP BY EXTRACT(DAY FROM due_date)::int
  ORDER BY COUNT(*) DESC, MIN(created_at) ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.trg_invoices_audit_due_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_orig int; v_actor uuid;
BEGIN
  v_actor := auth.uid();
  IF TG_OP = 'INSERT' THEN
    v_orig := public.client_original_due_day(NEW.client_id);
    IF v_orig IS NOT NULL AND EXTRACT(DAY FROM NEW.due_date)::int <> v_orig THEN
      INSERT INTO public.recurrence_audit_logs(organization_id, client_id, invoice_id, old_due_date, new_due_date, original_due_day, changed_by, reason, source, details)
      VALUES (NEW.organization_id, NEW.client_id, NEW.id, NULL, NEW.due_date, v_orig, v_actor, 'auto_generation', CASE WHEN v_actor IS NULL THEN 'automatic' ELSE 'manual' END,
        jsonb_build_object('note', 'insert divergent from original'));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    v_orig := public.client_original_due_day(NEW.client_id);
    INSERT INTO public.recurrence_audit_logs(organization_id, client_id, invoice_id, old_due_date, new_due_date, original_due_day, changed_by, reason, source, details)
    VALUES (NEW.organization_id, NEW.client_id, NEW.id, OLD.due_date, NEW.due_date, v_orig, v_actor, 'manual_edit', CASE WHEN v_actor IS NULL THEN 'automatic' ELSE 'manual' END,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS invoices_audit_due_date ON public.invoices;
CREATE TRIGGER invoices_audit_due_date
AFTER INSERT OR UPDATE OF due_date ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_audit_due_date();

CREATE OR REPLACE FUNCTION public.trg_invoices_protect_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('pago','vencido_pago','cancelado')
     AND current_setting('app.allow_paid_edit', true) IS DISTINCT FROM 'on' THEN
    IF (OLD.due_date IS DISTINCT FROM NEW.due_date)
       OR (OLD.amount IS DISTINCT FROM NEW.amount)
       OR (OLD.client_id IS DISTINCT FROM NEW.client_id) THEN
      RAISE EXCEPTION 'Fatura % com status % não pode ter due_date/amount/client alterados', OLD.id, OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS invoices_protect_paid ON public.invoices;
CREATE TRIGGER invoices_protect_paid
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_protect_paid();

CREATE OR REPLACE FUNCTION public.trg_invoices_validate_due_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.due_date IS NULL THEN RAISE EXCEPTION 'due_date não pode ser nulo'; END IF;
  IF NEW.due_date < (CURRENT_DATE - INTERVAL '365 days')
     AND current_setting('app.allow_retroactive_invoice', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'due_date % é retroativo demais (> 365d)', NEW.due_date;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE client_id = NEW.client_id AND status = 'aberto'
      AND date_trunc('month', due_date) = date_trunc('month', NEW.due_date)
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Já existe fatura aberta para o cliente % na competência %', NEW.client_id, to_char(NEW.due_date, 'YYYY-MM');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS invoices_validate_due_date ON public.invoices;
CREATE TRIGGER invoices_validate_due_date
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_validate_due_date();

CREATE OR REPLACE FUNCTION public.audit_recurrence_integrity(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_misaligned jsonb; v_duplicates jsonb; v_gaps jsonb; v_invalid jsonb;
BEGIN
  WITH dc AS (
    SELECT client_id, organization_id, EXTRACT(DAY FROM due_date)::int AS dia, COUNT(*) cnt, MIN(created_at) fs
    FROM invoices WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
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
    WHERE status = 'aberto' AND (p_organization_id IS NULL OR organization_id = p_organization_id)
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
END; $$;

CREATE OR REPLACE FUNCTION public.rollback_due_date_change(p_audit_log_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_log RECORD; v_inv RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas admin pode reverter';
  END IF;
  SELECT * INTO v_log FROM public.recurrence_audit_logs WHERE id = p_audit_log_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'log não encontrado'); END IF;
  IF v_log.old_due_date IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'sem old_due_date'); END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = v_log.invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'fatura não encontrada'); END IF;
  IF v_inv.status <> 'aberto' THEN RETURN jsonb_build_object('success', false, 'error', 'fatura não está aberta'); END IF;
  UPDATE public.invoices SET due_date = v_log.old_due_date, updated_at = now() WHERE id = v_log.invoice_id;
  RETURN jsonb_build_object('success', true, 'invoice_id', v_log.invoice_id, 'reverted_to', v_log.old_due_date);
END; $$;