-- Atomic/idempotent provider payment settlement.
-- Provider transaction identity is mandatory; amount is secondary validation only.

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider text not null,
  external_id text not null,
  invoice_id uuid,
  amount numeric,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_payment_webhook_events_identity
  on public.payment_webhook_events (organization_id, provider, external_id);

create index if not exists idx_payment_webhook_events_invoice
  on public.payment_webhook_events (organization_id, invoice_id);

alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from anon, authenticated;
grant select, insert on public.payment_webhook_events to service_role;

create or replace function public.settle_invoice_from_webhook(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_provider text,
  p_external_id text,
  p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_event_id uuid;
begin
  if nullif(trim(p_external_id), '') is null then
    return jsonb_build_object('status', 'rejected_missing_identity');
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'invoice_not_found_or_wrong_organization';
  end if;

  if p_amount is not null and abs(coalesce(v_invoice.amount, 0) - p_amount) > 0.01 then
    return jsonb_build_object('status', 'amount_mismatch', 'invoice_amount', v_invoice.amount);
  end if;

  insert into public.payment_webhook_events (organization_id, provider, external_id, invoice_id, amount)
  values (p_organization_id, p_provider, trim(p_external_id), p_invoice_id, p_amount)
  on conflict (organization_id, provider, external_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('status', 'duplicate');
  end if;

  if v_invoice.status <> 'aberto' then
    return jsonb_build_object('status', 'already_paid', 'invoice_id', v_invoice.id);
  end if;

  update public.invoices
  set status = 'pago', paid_date = current_date
  where id = v_invoice.id;

  insert into public.transactions (organization_id, type, amount, description, invoice_id)
  values (
    p_organization_id,
    'entrada',
    v_invoice.amount,
    'Baixa automática via ' || p_provider || ' — referência ' || trim(p_external_id),
    v_invoice.id
  );

  return jsonb_build_object('status', 'settled', 'invoice_id', v_invoice.id, 'event_id', v_event_id);
end;
$$;

revoke all on function public.settle_invoice_from_webhook(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.settle_invoice_from_webhook(uuid, uuid, text, text, numeric) to service_role;
