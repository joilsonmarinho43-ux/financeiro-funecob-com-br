UPDATE public.auto_settlement_events
SET status = 'pendente_revisao',
    error_message = COALESCE(error_message, 'cliente não identificado automaticamente — vincule manualmente')
WHERE status = 'erro'
  AND client_id IS NULL
  AND amount_detected IS NOT NULL
  AND amount_detected > 0
  AND error_message ILIKE '%client not identified%';