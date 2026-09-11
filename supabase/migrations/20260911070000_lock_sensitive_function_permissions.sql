-- Security hardening:
-- settle_invoice_from_webhook is an internal machine-to-machine settlement
-- function and must never be executable by authenticated users.

REVOKE EXECUTE
ON FUNCTION public.settle_invoice_from_webhook(uuid, uuid, text, text, numeric)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.settle_invoice_from_webhook(uuid, uuid, text, text, numeric)
TO service_role;
