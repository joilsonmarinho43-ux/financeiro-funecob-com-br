-- =====================================================================
-- FUNecob — SQL aplicado SEMPRE após as migrations (idempotente).
-- Executado por ./deploy/migrate.sh, logo após deploy/db/grants.sql.
--
-- 1) public.admin_org_stats()        -> métricas REAIS por empresa (Super Admin)
-- 2) public.tenant_integrity_check() -> valida relacionamentos após a migração
-- 3) índices de apoio
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estatísticas reais por organização (somente Super Admin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_org_stats()
RETURNS TABLE (
  organization_id   uuid,
  clients_total     bigint,
  clients_active    bigint,
  invoices_open     bigint,
  invoices_overdue  bigint,
  open_amount       numeric,
  plans_total       bigint,
  members_total     bigint,
  last_activity_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    (SELECT count(*) FROM public.clients c WHERE c.organization_id = o.id),
    (SELECT count(*) FROM public.clients c WHERE c.organization_id = o.id AND coalesce(c.status,'ativo') = 'ativo'),
    (SELECT count(*) FROM public.invoices i WHERE i.organization_id = o.id AND i.status <> 'pago'),
    (SELECT count(*) FROM public.invoices i WHERE i.organization_id = o.id AND i.status <> 'pago' AND i.due_date < current_date),
    (SELECT coalesce(sum(i.amount),0) FROM public.invoices i WHERE i.organization_id = o.id AND i.status <> 'pago'),
    (SELECT count(*) FROM public.plans p WHERE p.organization_id = o.id),
    (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id),
    (SELECT max(i.created_at) FROM public.invoices i WHERE i.organization_id = o.id)
  FROM public.organizations o
  WHERE public.has_role(auth.uid(), 'admin');
$$;

REVOKE ALL ON FUNCTION public.admin_org_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_org_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_org_stats() TO service_role;

-- ---------------------------------------------------------------------
-- 2. Verificação de integridade pós-migração de um tenant
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_integrity_check(_org_id uuid)
RETURNS TABLE (verificacao text, quantidade bigint, situacao text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH checks AS (
    SELECT 'clientes'::text AS verificacao,
           (SELECT count(*) FROM public.clients WHERE organization_id = _org_id) AS quantidade,
           'informativo'::text AS regra
    UNION ALL
    SELECT 'mensalidades em aberto',
           (SELECT count(*) FROM public.invoices WHERE organization_id = _org_id AND status <> 'pago'),
           'informativo'
    UNION ALL
    SELECT 'faturas sem cliente correspondente',
           (SELECT count(*) FROM public.invoices i
             WHERE i.organization_id = _org_id
               AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = i.client_id)),
           'deve ser zero'
    UNION ALL
    SELECT 'faturas com plano inexistente',
           (SELECT count(*) FROM public.invoices i
             WHERE i.organization_id = _org_id AND i.plan_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = i.plan_id)),
           'deve ser zero'
    UNION ALL
    SELECT 'membros sem usuario em auth.users',
           (SELECT count(*) FROM public.organization_members m
             WHERE m.organization_id = _org_id
               AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id)),
           'deve ser zero'
    UNION ALL
    SELECT 'clientes duplicados (nome + telefone)',
           (SELECT coalesce(sum(qtd - 1), 0) FROM (
              SELECT count(*) AS qtd FROM public.clients
               WHERE organization_id = _org_id
               GROUP BY lower(name), coalesce(phone,'')
              HAVING count(*) > 1) d),
           'deve ser zero'
  )
  SELECT verificacao,
         quantidade,
         CASE WHEN regra = 'informativo' THEN 'OK'
              WHEN quantidade = 0 THEN 'OK'
              ELSE 'ATENCAO' END
  FROM checks;
$$;

REVOKE ALL ON FUNCTION public.tenant_integrity_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_integrity_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_integrity_check(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Índices de apoio (idempotentes)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_org         ON public.clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_due    ON public.invoices(organization_id, due_date);
CREATE INDEX IF NOT EXISTS idx_plans_org           ON public.plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org     ON public.organization_members(organization_id);
