DROP VIEW IF EXISTS public.system_health_metrics;

CREATE VIEW public.system_health_metrics
WITH (security_invoker = true) AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  (SELECT COUNT(*) FROM invoices i WHERE i.organization_id = o.id AND i.status='aberto') AS invoices_open,
  (SELECT COUNT(*) FROM invoices i WHERE i.organization_id = o.id AND i.status='aberto' AND i.due_date < CURRENT_DATE) AS invoices_overdue,
  (SELECT COUNT(*) FROM invoices i WHERE i.organization_id = o.id AND i.status='pago' AND i.paid_date >= CURRENT_DATE - INTERVAL '30 days') AS invoices_paid_30d,
  (SELECT COALESCE(SUM(i.amount),0) FROM invoices i WHERE i.organization_id = o.id AND i.status='aberto') AS amount_open,
  (SELECT COALESCE(SUM(i.amount),0) FROM invoices i WHERE i.organization_id = o.id AND i.status='aberto' AND i.due_date < CURRENT_DATE) AS amount_overdue,
  (SELECT COUNT(*) FROM whatsapp_queue q WHERE q.organization_id = o.id AND q.status IN ('queued','retry')) AS wa_queue_pending,
  (SELECT COUNT(*) FROM whatsapp_queue q WHERE q.organization_id = o.id AND q.status='failed' AND q.created_at >= NOW() - INTERVAL '24 hours') AS wa_failed_24h,
  (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.organization_id = o.id AND m.created_at >= NOW() - INTERVAL '24 hours' AND m.deleted_at IS NULL) AS wa_messages_24h,
  (SELECT COUNT(*) FROM whatsapp_instances wi WHERE wi.organization_id = o.id AND wi.status='connected') AS wa_instances_connected,
  (SELECT COUNT(*) FROM auto_settlement_events e WHERE e.organization_id = o.id AND e.status='conciliado' AND e.created_at >= NOW() - INTERVAL '30 days') AS settlement_ok_30d,
  (SELECT COUNT(*) FROM auto_settlement_events e WHERE e.organization_id = o.id AND e.status='erro') AS settlement_errors_total,
  (SELECT COALESCE(SUM(amount - used_amount),0) FROM auto_settlement_credits c WHERE c.organization_id = o.id AND c.status='disponivel') AS credit_balance_available,
  (SELECT COUNT(*) FROM clients c WHERE c.organization_id = o.id AND c.status='ativo') AS clients_active
FROM organizations o
WHERE o.active = true;

GRANT SELECT ON public.system_health_metrics TO authenticated;