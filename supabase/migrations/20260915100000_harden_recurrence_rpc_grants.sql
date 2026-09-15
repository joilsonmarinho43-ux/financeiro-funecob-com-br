-- FuneCob: recurrence RPCs are internal financial helpers.
-- They must not be callable directly by authenticated clients.
-- perform_baixa_manual remains the only public application entry point and
-- is already restricted to service_role.

REVOKE EXECUTE
ON FUNCTION public.generate_next_recurrence(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.generate_next_recurrence(uuid, uuid)
TO service_role;

REVOKE EXECUTE
ON FUNCTION public.rebuild_client_recurrence(uuid, date, boolean)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.rebuild_client_recurrence(uuid, date, boolean)
TO service_role;
