CREATE UNIQUE INDEX IF NOT EXISTS auto_settlement_events_org_msg_uniq
ON public.auto_settlement_events (organization_id, whatsapp_message_id)
WHERE whatsapp_message_id IS NOT NULL;