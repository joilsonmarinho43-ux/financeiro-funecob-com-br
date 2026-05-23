
UPDATE public.auto_settlement_credits
SET status = 'cancelado', updated_at = now()
WHERE id = '1c5fac16-32cf-49fa-a328-856f1804b851';

UPDATE public.auto_settlement_events
SET client_id = 'ad3cfb0d-0616-4573-b0f2-3498ac4ab0b5',
    error_message = COALESCE(error_message,'') || ' [corrigido manualmente: cliente correto era Lucélia Maria Gomes; baixa refeita via baixa-manual]',
    updated_at = now()
WHERE id = '624541b4-dfbb-4ebe-bfdd-66fb04237b3a';

INSERT INTO public.auto_settlement_logs (organization_id, event_id, client_id, action, details)
VALUES (
  'eaf58dbe-f43a-479e-97d8-e0078f3a7af9',
  '624541b4-dfbb-4ebe-bfdd-66fb04237b3a',
  'ad3cfb0d-0616-4573-b0f2-3498ac4ab0b5',
  'manual_correction',
  jsonb_build_object(
    'reason','fuzzy_name_match_collision',
    'wrong_client','510ce77f-af9b-43a6-b07b-cf181ad04989',
    'correct_client','ad3cfb0d-0616-4573-b0f2-3498ac4ab0b5',
    'cancelled_credit','1c5fac16-32cf-49fa-a328-856f1804b851',
    'fix','tightened fuzzy matcher: first-name required + distinctive token + uniqueness'
  )
);
