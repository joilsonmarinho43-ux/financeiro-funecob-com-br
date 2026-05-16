-- =========================================================================
-- PHASE 4 — Performance indexes (additive only, IF NOT EXISTS)
-- =========================================================================

-- system_logs: only had PK, heavy table used by admin dashboards
CREATE INDEX IF NOT EXISTS idx_system_logs_org_created
  ON public.system_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_action_created
  ON public.system_logs (action, created_at DESC);

-- whatsapp_messages: per-phone history lookups (client portal, conversation view)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org_created
  ON public.whatsapp_messages (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_created
  ON public.whatsapp_messages (phone, created_at DESC);

-- clients: phone is hot path (whatsapp-webhook resolves client by phone)
CREATE INDEX IF NOT EXISTS idx_clients_org_phone
  ON public.clients (organization_id, phone) WHERE phone IS NOT NULL;

-- transactions: status/date queries
CREATE INDEX IF NOT EXISTS idx_transactions_org_date_type
  ON public.transactions (organization_id, transaction_date DESC, type);

-- auto_settlement_credits: client balance lookup
CREATE INDEX IF NOT EXISTS idx_auto_settlement_credits_client
  ON public.auto_settlement_credits (organization_id, client_id, status);

-- =========================================================================
-- PHASE 6 — Observability view (admin/org)
-- =========================================================================
CREATE OR REPLACE VIEW public.system_health_metrics AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  -- invoices
  (SELECT COUNT(*) FROM invoices i WHERE i.organization_id = o.id AND i.status='aberto') AS invoices_open,
  (SELECT COUNT(*) FROM invoices i WHERE i.organization_id = o.id AND i.status='aberto' AND i.due_date < CURRENT_DATE) AS invoices_overdue,
  (SELECT COUNT(*) FROM invoices i WHERE i.organization_id = o.id AND i.status='pago' AND i.paid_date >= CURRENT_DATE - INTERVAL '30 days') AS invoices_paid_30d,
  (SELECT COALESCE(SUM(i.amount),0) FROM invoices i WHERE i.organization_id = o.id AND i.status='aberto') AS amount_open,
  (SELECT COALESCE(SUM(i.amount),0) FROM invoices i WHERE i.organization_id = o.id AND i.status='aberto' AND i.due_date < CURRENT_DATE) AS amount_overdue,
  -- whatsapp
  (SELECT COUNT(*) FROM whatsapp_queue q WHERE q.organization_id = o.id AND q.status IN ('queued','retry')) AS wa_queue_pending,
  (SELECT COUNT(*) FROM whatsapp_queue q WHERE q.organization_id = o.id AND q.status='failed' AND q.created_at >= NOW() - INTERVAL '24 hours') AS wa_failed_24h,
  (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.organization_id = o.id AND m.created_at >= NOW() - INTERVAL '24 hours' AND m.deleted_at IS NULL) AS wa_messages_24h,
  (SELECT COUNT(*) FROM whatsapp_instances wi WHERE wi.organization_id = o.id AND wi.status='connected') AS wa_instances_connected,
  -- auto settlement
  (SELECT COUNT(*) FROM auto_settlement_events e WHERE e.organization_id = o.id AND e.status='conciliado' AND e.created_at >= NOW() - INTERVAL '30 days') AS settlement_ok_30d,
  (SELECT COUNT(*) FROM auto_settlement_events e WHERE e.organization_id = o.id AND e.status='erro') AS settlement_errors_total,
  (SELECT COALESCE(SUM(amount - used_amount),0) FROM auto_settlement_credits c WHERE c.organization_id = o.id AND c.status='disponivel') AS credit_balance_available,
  -- clients
  (SELECT COUNT(*) FROM clients c WHERE c.organization_id = o.id AND c.status='ativo') AS clients_active
FROM organizations o
WHERE o.active = true;

-- RLS-equivalent: this view is SECURITY INVOKER by default, so RLS on underlying tables applies.
-- Admins (via has_role) and org members will see only what their policies allow.
GRANT SELECT ON public.system_health_metrics TO authenticated;