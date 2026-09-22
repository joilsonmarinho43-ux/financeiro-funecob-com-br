-- WhatsApp delivery tracking: correlate Evolution provider IDs with local messages/queue.
alter table public.whatsapp_messages
  add column if not exists provider_message_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists error_message text;

alter table public.whatsapp_queue
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz;

create index if not exists idx_whatsapp_messages_provider_message_id
  on public.whatsapp_messages(provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_whatsapp_queue_provider_message_id
  on public.whatsapp_queue(provider_message_id)
  where provider_message_id is not null;
