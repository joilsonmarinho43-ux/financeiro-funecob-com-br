## Diagnóstico inicial

Rodei scanner de segurança e linter de DB. Mapa do código:

- **9.564 linhas** só em `src/pages/` — arquivos gigantes: `WhatsApp.tsx` (1.442), `BillingSettings.tsx` (1.229), `Clients.tsx` (1.002), `Invoices.tsx` (769), `Dashboard.tsx` (724).
- **18 findings de segurança** (todos `WARN`, nenhum crítico): bucket público lista arquivos, várias funções `SECURITY DEFINER` executáveis por anon/authenticated.
- **12 issues no linter Supabase** sobrepostos com os de segurança.
- 9 edge functions, 21 páginas.

Não há erros runtime ativos. Os fluxos críticos (cobrança automática, baixa, WhatsApp, portal) estão funcionando.

## Plano em 4 fases

Faço fase por fase, te entrego, valido antes da próxima. Assim nada quebra.

### Fase 1 — Segurança (DB + Storage)
1. Restringir `EXECUTE` das funções `SECURITY DEFINER` (`get_user_organization_id`, `is_collector`, `has_role`, `handle_new_user`, `update_updated_at`, `perform_baixa_manual`) — revogar de `anon`/`public`, manter só onde é usado em RLS.
2. Bucket `logos`: manter público para leitura, mas restringir LIST (só arquivos individuais visíveis).
3. Confirmar que toda query crítica filtra `organization_id` no client (já é regra do projeto, vou validar).
4. Adicionar validação Zod nas edge functions que recebem input externo (`bip-receiver`, `client-portal`, `send-now`).

### Fase 2 — Bugs e estabilidade
1. Varrer console/network logs em cada página principal.
2. Validar fluxos de data (UTC-3 com `parseDateLocal`), filtros `.gte/.lt`, divisões por zero, `null`/`undefined` em valores monetários.
3. Verificar memory leaks de polling (WhatsApp QR, robot monitor) — garantir `clearInterval` em unmount.
4. Garantir `window.confirm` em todos os deletes (regra do projeto).
5. Padronizar tratamento de erro: toast + log estruturado.

### Fase 3 — Organização do código
1. Quebrar os 5 arquivos gigantes em componentes menores:
   - `WhatsApp.tsx` → `InstancesList`, `QRPairing`, `MessageHistory`, `SendConfig`.
   - `BillingSettings.tsx` → `ReminderTemplates`, `PixSettings`, `GatewaySettings`, `RobotConfig`.
   - `Clients.tsx` → `ClientsTable`, `ClientForm`, `ClientDetailDialog`, `MessageDialog`, `InvoiceDialog`.
   - `Invoices.tsx` → `InvoicesTable`, `InvoiceFilters`, `NewInvoiceDialog`, `TestPixDialog`, `PayDialog`.
   - `Dashboard.tsx` → `KPICards`, `OverdueList`, `QuickActions`.
2. Mover hooks de fetch repetidos para `src/hooks/` (já tem `useOrganization`, criar `useInvoices`, `useClients`, `useBillingSettings`).
3. Centralizar formatadores (`formatCurrency`, `formatDate`, `formatPhone`) em `src/lib/format.ts`.
4. Remover `as any` onde possível, tipar com `Tables<>` do Supabase.

### Fase 4 — UX/UI e mobile
1. Padronizar headers de página (título + descrição + ações no mesmo molde).
2. Revisar mobile (390px): tabelas com scroll horizontal, dialogs com `max-h-[90vh] overflow-y-auto`, botões grandes o suficiente.
3. Estados de loading/empty/error consistentes em todas as listas.
4. Acessibilidade: todo `DialogContent` precisa de `DialogTitle` (vi warnings disso no console).
5. Skeleton loaders em vez de spinners em listas longas.

## Como prefiro executar

Fase 1 primeiro (segurança — são poucas linhas, alto impacto, sem risco visual). Depois te mostro e seguimos. Posso começar?

## Detalhes técnicos

- Nenhuma fase muda schema de tabela existente (só `GRANT`/`REVOKE` e políticas de storage).
- Refatorações da Fase 3 mantêm 100% do comportamento atual — só dividem arquivos.
- Tudo é feito com edits cirúrgicos para não invalidar `supabase/types.ts`.
- Memórias do projeto (parseDateLocal, `.gte/.lt`, `entrada`, IP da Evolution, etc.) serão respeitadas.