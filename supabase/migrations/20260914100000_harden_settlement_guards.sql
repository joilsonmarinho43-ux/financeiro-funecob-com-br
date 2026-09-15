-- FuneCob financial security hardening
--
-- 1. An event may have at most one settlement allocation. This makes the
--    allocation table itself an idempotency barrier, not only application code.
-- 2. SECURITY DEFINER settlement RPCs are machine-to-machine entry points.
--    They must not be callable by PUBLIC/anon/authenticated through PostgREST.
--    Edge Functions invoke them with the service_role key.

CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_settlement_allocations_event
  ON public.auto_settlement_allocations (event_id);

REVOKE EXECUTE
ON FUNCTION public.auto_settlement_process_payment(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.auto_settlement_process_payment(uuid)
TO service_role;

REVOKE EXECUTE
ON FUNCTION public.perform_baixa_manual(uuid, date, uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.perform_baixa_manual(uuid, date, uuid, uuid)
TO service_role;
