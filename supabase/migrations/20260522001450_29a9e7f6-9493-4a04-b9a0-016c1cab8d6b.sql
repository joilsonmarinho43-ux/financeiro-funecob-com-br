
-- Marcar eventos de erro antigos como ignorados (limpeza do painel Saúde do Sistema)
UPDATE public.auto_settlement_events
SET status = 'ignorado',
    error_message = COALESCE(error_message, '') || ' [auto-ignorado: limpeza de LID antigos]'
WHERE status = 'erro';

-- Log de auditoria
INSERT INTO public.auto_settlement_logs (organization_id, action, details)
SELECT DISTINCT organization_id, 'cleanup_legacy_errors',
       jsonb_build_object('reason', 'lid_protocol_unmatchable', 'cleaned_at', now())
FROM public.auto_settlement_events
WHERE status = 'ignorado' AND error_message LIKE '%limpeza de LID antigos%';
