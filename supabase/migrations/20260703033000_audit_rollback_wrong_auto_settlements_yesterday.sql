-- Auditoria: estorna baixas automáticas indevidas identificadas em 01/07/2026
-- e remove aprendizados de LID feitos por vínculo manual inseguro.

DO $$
DECLARE
  v_event_ids uuid[] := ARRAY[
    'f948b1f8-fd33-41a8-a8a6-ff978cf7f739'::uuid, -- Simone -> baixou Santana por telefone
    'c042594c-cb45-49e9-b888-8b87ad56ab79'::uuid, -- LID/Iara -> baixou Elizandra
    '2d57f32e-bc35-4253-890d-7b0ef580c37c'::uuid  -- Maria Lucilete -> baixou Antonia
  ];
BEGIN
  UPDATE public.invoices i
  SET status = 'aberto', paid_date = NULL, updated_at = now()
  WHERE i.id IN (
    SELECT a.invoice_id
    FROM public.auto_settlement_allocations a
    WHERE a.event_id = ANY(v_event_ids)
      AND coalesce(a.was_generated, false) = false
  );

  DELETE FROM public.auto_settlement_allocations a
  WHERE a.event_id = ANY(v_event_ids);

  UPDATE public.auto_settlement_events e
  SET status = 'pendente_revisao',
      client_id = NULL,
      processed_at = NULL,
      error_message = CASE e.id
        WHEN 'f948b1f8-fd33-41a8-a8a6-ff978cf7f739'::uuid THEN 'estornado: telefone apontava para Santana, mas pagador do PIX parece Simone; revisar manualmente'
        WHEN 'c042594c-cb45-49e9-b888-8b87ad56ab79'::uuid THEN 'estornado: auto-resolução indevida por LID aprendido em vínculo manual; revisar manualmente'
        WHEN '2d57f32e-bc35-4253-890d-7b0ef580c37c'::uuid THEN 'estornado: pagador do PIX é Maria Lucilete, mas foi baixado em Antonia; revisar manualmente'
        ELSE 'estornado por auditoria'
      END,
      ocr_payload = coalesce(e.ocr_payload, '{}'::jsonb) || jsonb_build_object(
        '_audit_reverted_at', now(),
        '_audit_reason', 'baixa indevida identificada na auditoria de ontem'
      ),
      updated_at = now()
  WHERE e.id = ANY(v_event_ids);

  INSERT INTO public.auto_settlement_logs(organization_id, event_id, client_id, action, details)
  SELECT e.organization_id, e.id, NULL, 'audit_reverted', jsonb_build_object(
    'reason', e.error_message,
    'reverted_at', now()
  )
  FROM public.auto_settlement_events e
  WHERE e.id = ANY(v_event_ids);

  DELETE FROM public.whatsapp_lid_map
  WHERE lid IN ('255142699999474','213095238602809');
END $$;
