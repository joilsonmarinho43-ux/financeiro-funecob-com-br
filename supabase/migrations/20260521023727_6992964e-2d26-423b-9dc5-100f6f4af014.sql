
-- Cleanup: mark legacy PIX raffle/noise events as 'ignorado' and retry fuzzy match on real receipts
-- 1) Mark raffle/noise events as 'ignorado' (they pollute dashboard)
UPDATE public.auto_settlement_events
SET status = 'ignorado',
    error_message = 'non_receipt_noise (rifa/sorteio/bingo)'
WHERE status = 'erro'
  AND (
    lower(coalesce(raw_text, '')) ~ 'rifa|sorteio|bingo|ganhador'
    OR lower(coalesce(ocr_payload->>'raw_text', '')) ~ 'rifa|sorteio|bingo|ganhador'
  )
  AND coalesce(ocr_payload->>'txid', '') = ''
  AND coalesce(pix_end_to_end_id, '') = '';

-- 2) Retroactively match legacy errors via sender_name (first + last token, single client)
WITH candidates AS (
  SELECT
    e.id AS event_id,
    e.organization_id,
    e.amount_detected,
    lower(translate(coalesce(e.ocr_payload->>'sender_name',''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) AS sender_norm
  FROM public.auto_settlement_events e
  WHERE e.status = 'erro'
    AND e.client_id IS NULL
    AND e.amount_detected IS NOT NULL
    AND coalesce(e.ocr_payload->>'sender_name','') <> ''
),
matched AS (
  SELECT
    c.event_id,
    c.organization_id,
    c.amount_detected,
    (
      SELECT cl.id FROM public.clients cl
      WHERE cl.organization_id = c.organization_id
        AND lower(translate(coalesce(cl.name,''),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
          LIKE '%' || split_part(c.sender_norm, ' ', 1) || '%'
        AND lower(translate(coalesce(cl.name,''),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
          LIKE '%' || split_part(c.sender_norm, ' ', array_length(string_to_array(c.sender_norm,' '),1)) || '%'
        AND char_length(split_part(c.sender_norm, ' ', 1)) >= 4
      LIMIT 2
    ) AS guess_id,
    (
      SELECT count(*) FROM public.clients cl
      WHERE cl.organization_id = c.organization_id
        AND lower(translate(coalesce(cl.name,''),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
          LIKE '%' || split_part(c.sender_norm, ' ', 1) || '%'
        AND lower(translate(coalesce(cl.name,''),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
          LIKE '%' || split_part(c.sender_norm, ' ', array_length(string_to_array(c.sender_norm,' '),1)) || '%'
    ) AS match_count
  FROM candidates c
)
UPDATE public.auto_settlement_events e
SET client_id = m.guess_id,
    status = 'recebido',
    error_message = NULL
FROM matched m
WHERE e.id = m.event_id
  AND m.guess_id IS NOT NULL
  AND m.match_count = 1;
