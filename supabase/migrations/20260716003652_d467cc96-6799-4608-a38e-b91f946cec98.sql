
-- Reabrir fatura baixada errada
SET LOCAL app.allow_paid_edit = 'on';
UPDATE public.invoices
   SET status = 'aberto', paid_date = NULL, updated_at = now()
 WHERE id = '35636380-810b-4f76-aee7-49e3cb3f266d';

-- Reverter allocation do evento
DELETE FROM public.auto_settlement_allocations
 WHERE event_id = 'a51dd752-d881-4a58-8259-f050a56b436a';

-- Reabrir evento para revisão manual
UPDATE public.auto_settlement_events
   SET status = 'pendente_revisao',
       processed_at = NULL,
       error_message = 'baixa revertida — telefone de origem diverge do cadastro; confirme manualmente (bug switch sender_name)',
       updated_at = now()
 WHERE id = 'a51dd752-d881-4a58-8259-f050a56b436a';

INSERT INTO public.auto_settlement_logs(organization_id, event_id, client_id, action, details)
VALUES (
  'eaf58dbe-f43a-479e-97d8-e0078f3a7af9',
  'a51dd752-d881-4a58-8259-f050a56b436a',
  'b589d6ed-dc08-4f45-8b2b-1298cb7e253b',
  'reverted_wrong_baixa',
  jsonb_build_object(
    'invoice_id','35636380-810b-4f76-aee7-49e3cb3f266d',
    'reason','origem_diverge_cadastro_switch_sender_name',
    'origin_phone','5591984456470',
    'cadastro_phone','5591982305560'
  )
);
