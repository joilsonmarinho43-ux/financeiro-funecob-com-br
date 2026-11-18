-- Emergency fail-closed circuit breaker for OCR-triggered settlement.
-- Do not deploy until operators have verified no legitimate manual flow calls this RPC.
-- The original 456-line function definition was extracted from funecob-db on 2026-11-18;
-- preserve it separately before applying this migration for rollback.
-- This migration deliberately DOES NOT mark events reconciled or update invoices.
BEGIN;
CREATE OR REPLACE FUNCTION public.auto_settlement_process_payment(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'automatic_settlement_disabled',
    'message', 'Liquidação automática bloqueada: requer confirmação bancária e conciliação por competência',
    'event_id', p_event_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.auto_settlement_process_payment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_settlement_process_payment(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.auto_settlement_process_payment(uuid) FROM authenticated;
-- Do not grant EXECUTE back to application roles until a verified bank settlement path exists.
COMMIT;
