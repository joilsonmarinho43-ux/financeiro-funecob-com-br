-- FuneCob: harden invoice competence uniqueness for multi-tenant safety.
-- This migration is intentionally additive: it preserves the existing paid-invoice
-- protection and exact-match auto-settlement hardening.

-- The previous trigger used a check-then-insert pattern and did not include
-- organization_id in the duplicate test. The unique partial index below is the
-- authoritative concurrency-safe guard: one open invoice per organization,
-- client and competence month.
--
-- due_date is a calendar date in FuneCob. Cast explicitly to timestamp without
-- time zone so date_trunc uses PostgreSQL's IMMUTABLE overload and can be used
-- safely in a unique index expression.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_open_org_client_month
ON public.invoices (
  organization_id,
  client_id,
  (date_trunc('month', due_date::timestamp))
)
WHERE status = 'aberto';

-- Keep the trigger as a friendly validation/error message, but make its lookup
-- explicitly tenant-scoped. The unique index above remains the race-safe guard.
CREATE OR REPLACE FUNCTION public.trg_invoices_validate_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    RAISE EXCEPTION 'due_date não pode ser nulo';
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id não pode ser nulo';
  END IF;

  IF NEW.due_date < (CURRENT_DATE - INTERVAL '365 days')
     AND current_setting('app.allow_retroactive_invoice', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'due_date % é retroativo demais (> 365d)', NEW.due_date;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE organization_id = NEW.organization_id
      AND client_id = NEW.client_id
      AND status = 'aberto'
      AND date_trunc('month', due_date) = date_trunc('month', NEW.due_date)
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION
      'Já existe fatura aberta para o cliente % na organização % na competência %',
      NEW.client_id,
      NEW.organization_id,
      to_char(NEW.due_date, 'YYYY-MM');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_validate_due_date ON public.invoices;
CREATE TRIGGER invoices_validate_due_date
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoices_validate_due_date();
