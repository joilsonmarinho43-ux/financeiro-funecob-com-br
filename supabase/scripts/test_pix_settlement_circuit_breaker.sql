-- Smoke test: after deploying the circuit-breaker migration, the RPC must refuse
-- every event, including an unknown UUID, without modifying any financial data.
-- Run as an authorized DBA in staging first.
BEGIN;
DO $$
DECLARE
  result jsonb;
BEGIN
  SELECT public.auto_settlement_process_payment(
    '00000000-0000-0000-0000-000000000000'::uuid
  ) INTO result;
  IF result->>'success' IS DISTINCT FROM 'false'
     OR result->>'error' IS DISTINCT FROM 'automatic_settlement_disabled' THEN
    RAISE EXCEPTION 'FAIL CLOSED CHECK FAILED: %', result;
  END IF;
  RAISE NOTICE 'PASS: RPC refuses automatic settlement';
END;
$$;
ROLLBACK;
