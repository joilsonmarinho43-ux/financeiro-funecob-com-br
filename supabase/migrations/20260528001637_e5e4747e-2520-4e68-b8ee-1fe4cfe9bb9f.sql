
CREATE OR REPLACE VIEW public.system_health_metrics AS
SELECT id AS organization_id,
    name AS organization_name,
    ( SELECT count(*) FROM invoices i WHERE i.organization_id = o.id AND i.status = 'aberto') AS invoices_open,
    ( SELECT count(*) FROM invoices i WHERE i.organization_id = o.id AND i.status = 'aberto' AND i.due_date < CURRENT_DATE) AS invoices_overdue,
    ( SELECT count(*) FROM invoices i WHERE i.organization_id = o.id AND i.status = 'pago' AND i.paid_date >= (CURRENT_DATE - INTERVAL '30 days')) AS invoices_paid_30d,
    ( SELECT COALESCE(sum(i.amount), 0) FROM invoices i WHERE i.organization_id = o.id AND i.status = 'aberto') AS amount_open,
    ( SELECT COALESCE(sum(i.amount), 0) FROM invoices i WHERE i.organization_id = o.id AND i.status = 'aberto' AND i.due_date < CURRENT_DATE) AS amount_overdue,
    ( SELECT count(*) FROM whatsapp_queue q WHERE q.organization_id = o.id AND q.status = ANY (ARRAY['queued','retry'])) AS wa_queue_pending,
    ( SELECT count(*) FROM whatsapp_queue q WHERE q.organization_id = o.id AND q.status = 'failed' AND q.created_at >= (now() - INTERVAL '24 hours')) AS wa_failed_24h,
    ( SELECT count(*) FROM whatsapp_messages m WHERE m.organization_id = o.id AND m.created_at >= (now() - INTERVAL '24 hours') AND m.deleted_at IS NULL) AS wa_messages_24h,
    ( SELECT count(*) FROM whatsapp_instances wi WHERE wi.organization_id = o.id AND wi.status = 'connected') AS wa_instances_connected,
    ( SELECT count(*) FROM auto_settlement_events e WHERE e.organization_id = o.id AND e.status = 'conciliado' AND e.created_at >= (now() - INTERVAL '30 days')) AS settlement_ok_30d,
    -- Conta apenas erros REAIS dos últimos 30 dias, ignorando ruído de "amount not detected"
    -- (imagens enviadas sem comprovante válido — não é falha do sistema)
    ( SELECT count(*) FROM auto_settlement_events e
      WHERE e.organization_id = o.id
        AND e.status = 'erro'
        AND e.created_at >= (now() - INTERVAL '30 days')
        AND COALESCE(e.error_message,'') NOT ILIKE '%amount not detected%'
        AND COALESCE(e.error_message,'') NOT ILIKE '%client not identified by phone/cpf/name%'
    ) AS settlement_errors_total,
    ( SELECT COALESCE(sum(c.amount - c.used_amount), 0) FROM auto_settlement_credits c WHERE c.organization_id = o.id AND c.status = 'disponivel') AS credit_balance_available,
    ( SELECT count(*) FROM clients c WHERE c.organization_id = o.id AND c.status = 'ativo') AS clients_active
FROM organizations o
WHERE active = true;
