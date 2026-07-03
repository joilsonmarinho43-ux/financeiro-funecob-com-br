
-- Reverter 3 baixas erradas causadas por elevação indevida de score em fuzzy_name
-- (PIX de terceiro sendo baixado em cliente errado por apenas 1 token em comum).
UPDATE public.invoices
SET status='aberto', paid_date=NULL, updated_at=now()
WHERE id IN (
  'eb131d65-8554-4d0e-b66a-b3396feb93b7',
  '26401e6a-95f7-4801-9c31-75310ca186ba',
  'dfb5b34a-5c8b-40c7-b8f0-229ca2fa7a5a',
  'a85a9373-ca09-4659-a6aa-3fd1ae922f28'
);

DELETE FROM public.auto_settlement_allocations
WHERE event_id IN (
  '6eec91c5-eb54-4f79-ac6f-865ad0a81f11',
  'e3843d53-890f-4f79-9620-393d529a9990',
  '7f8ee8a1-8adb-4b6c-bf26-237cb4e7ecde'
);

UPDATE public.auto_settlement_events
SET status='pendente_revisao',
    client_id=NULL,
    error_message='revertido: PIX de terceiro (fuzzy_name inseguro) — vincule manualmente',
    processed_at=NULL,
    updated_at=now()
WHERE id IN (
  '6eec91c5-eb54-4f79-ac6f-865ad0a81f11',
  'e3843d53-890f-4f79-9620-393d529a9990',
  '7f8ee8a1-8adb-4b6c-bf26-237cb4e7ecde'
);

INSERT INTO public.auto_settlement_logs(organization_id, event_id, action, details)
SELECT organization_id, id, 'rollback_wrong_fuzzy',
       jsonb_build_object('reason','safeFuzzy bypass via score elevation','fixed_at', now())
FROM public.auto_settlement_events
WHERE id IN (
  '6eec91c5-eb54-4f79-ac6f-865ad0a81f11',
  'e3843d53-890f-4f79-9620-393d529a9990',
  '7f8ee8a1-8adb-4b6c-bf26-237cb4e7ecde'
);
