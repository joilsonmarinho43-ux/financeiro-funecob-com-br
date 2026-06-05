
-- Revogar EXECUTE de funções SECURITY DEFINER sensíveis (PUBLIC + anon + authenticated)
-- Mantém apenas service_role (Edge Functions com SUPABASE_SERVICE_ROLE_KEY)

-- Funções de mutação financeira / administração (devem ser chamadas só via Edge Function com service_role)
REVOKE EXECUTE ON FUNCTION public.perform_baixa_manual(uuid, date, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_settlement_process_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_next_recurrence(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.repair_client_due_dates(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rebuild_client_recurrence(uuid, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_recurrence_integrity(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.perform_baixa_manual(uuid, date, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_settlement_process_payment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_recurrence(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.repair_client_due_dates(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_client_recurrence(uuid, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_recurrence_integrity(uuid) TO service_role;

-- rollback_due_date_change já tem check interno has_role('admin'), mas remove de anon
REVOKE EXECUTE ON FUNCTION public.rollback_due_date_change(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_due_date_change(uuid) TO authenticated, service_role;

-- Funções helper de datas (não precisam ser chamadas pelo cliente)
REVOKE EXECUTE ON FUNCTION public.client_original_due_day(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_original_due_day(uuid) TO service_role;

-- Funções de trigger / handler — não devem ser executáveis diretamente
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_invoices_protect_paid() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_invoices_validate_due_date() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_invoices_audit_due_date() FROM PUBLIC, anon, authenticated;

-- Funções usadas dentro de RLS policies — DEVEM permanecer acessíveis a authenticated
-- (has_role, get_user_organization_id, is_collector) — sem alteração, mas revoga anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_collector(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_collector(uuid) TO authenticated, service_role;
