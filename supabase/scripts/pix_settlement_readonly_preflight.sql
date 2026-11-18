-- Read-only preflight for emergency Pix settlement circuit breaker.
-- Execute with psql -v ON_ERROR_STOP=1 -f <file> against the intended database.
-- This script does not modify financial records.
SELECT current_database() AS database_name, current_user AS database_user;
SELECT p.oid::regprocedure AS signature,
       pg_get_userbyid(p.proowner) AS function_owner,
       p.prosecdef AS security_definer,
       pg_get_function_result(p.oid) AS return_type,
       pg_get_functiondef(p.oid) LIKE '%automatic_settlement_disabled%' AS circuit_breaker_installed
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'auto_settlement_process_payment';

SELECT r.rolname,
       has_function_privilege(r.oid, 'public.auto_settlement_process_payment(uuid)', 'EXECUTE') AS can_execute
FROM pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY r.rolname;

-- Report historical WhatsApp message collisions before adding any UNIQUE index.
SELECT organization_id, whatsapp_message_id, COUNT(*) AS duplicate_count
FROM public.auto_settlement_events
WHERE whatsapp_message_id IS NOT NULL
GROUP BY organization_id, whatsapp_message_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 25;

-- Report suspicious generated-paid invoices; read-only.
SELECT e.organization_id, a.event_id, a.invoice_id, i.client_id,
       i.due_date, i.status, i.amount, a.amount_applied
FROM public.auto_settlement_allocations a
JOIN public.auto_settlement_events e ON e.id = a.event_id
JOIN public.invoices i ON i.id = a.invoice_id
WHERE a.was_generated = true
ORDER BY i.due_date DESC
LIMIT 50;
