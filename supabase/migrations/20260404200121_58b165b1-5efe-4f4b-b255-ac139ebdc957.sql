
-- Performance indexes for hot queries
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_due_date ON public.invoices(organization_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);

CREATE INDEX IF NOT EXISTS idx_clients_org_status ON public.clients(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_org_code ON public.clients(organization_id, client_code);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status_scheduled ON public.whatsapp_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_org_status ON public.whatsapp_queue(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org_deleted ON public.whatsapp_messages(organization_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_billing_reminders_org_created ON public.billing_reminders(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_reminders_org_invoice_type ON public.billing_reminders(organization_id, invoice_id, reminder_type);

CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON public.transactions(organization_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_org_type ON public.transactions(organization_id, type);

CREATE INDEX IF NOT EXISTS idx_bips_org_created ON public.bips(organization_id, created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_org_sent ON public.whatsapp_queue(organization_id, sent_at) WHERE status = 'sent';
