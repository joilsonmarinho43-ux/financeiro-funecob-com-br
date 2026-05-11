# Sistema de Auditoria e Proteção de Recorrência

## Visão geral

Construir uma camada de blindagem em volta da geração e alteração de faturas (`invoices`), garantindo que **nenhuma mensalidade futura perca o `due_day` original**. Tudo transacional, reversível e auditável.

---

## 1. Banco de dados (migração única)

### 1.1 Tabela `recurrence_audit_logs`
Imutável (sem UPDATE/DELETE via RLS), particionável por org.

Colunas:
- `id`, `organization_id`, `client_id`, `invoice_id`
- `old_due_date`, `new_due_date`, `original_due_day`
- `changed_by` (uuid, nullable — system = NULL)
- `changed_at` (timestamptz default now())
- `reason` (text — `'manual_edit' | 'auto_generation' | 'repair' | 'migration' | 'baixa_manual' | 'portal_generation'`)
- `source` (text — `'automatic' | 'manual'`)
- `details` (jsonb — payload livre)

Índices: `(organization_id, changed_at desc)`, `(client_id, changed_at desc)`, `(invoice_id)`.

RLS: SELECT por org + admin global; INSERT só via SECURITY DEFINER funcs.

### 1.2 Função `client_original_due_day(client_id) RETURNS int`
`STABLE SECURITY DEFINER`. Retorna o dia mais frequente das faturas do cliente (desempate: mais antigo). Usada por triggers e validador.

### 1.3 Trigger `invoices_audit_due_date`
`AFTER INSERT OR UPDATE OF due_date ON invoices`. Compara com `client_original_due_day` e, se INSERT/UPDATE com divergência ou alteração, grava em `recurrence_audit_logs`. Nunca bloqueia — só registra.

### 1.4 Trigger `invoices_protect_paid`
`BEFORE UPDATE ON invoices`. Se `OLD.status IN ('pago','vencido_pago','cancelado')` e qualquer um de `due_date, amount, client_id, paid_date` mudou → `RAISE EXCEPTION` (a menos que `current_setting('app.allow_paid_edit', true) = 'on'` para casos administrativos explícitos).

### 1.5 Trigger `invoices_validate_due_date`
`BEFORE INSERT ON invoices`. Se já existe fatura `aberto` do mesmo `client_id` com mesma `(year, month)` da nova `due_date` → bloqueia (anti-duplicidade de competência). Se `due_date < CURRENT_DATE - interval '90 days'` → bloqueia (anti-retroativo absurdo, configurável).

### 1.6 Índices de performance
```sql
CREATE INDEX IF NOT EXISTS idx_invoices_client_due ON invoices(client_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status_due ON invoices(organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_month ON invoices(client_id, date_trunc('month', due_date));
```

### 1.7 Função `audit_recurrence_integrity(p_org uuid DEFAULT NULL) RETURNS jsonb`
Validador read-only. Retorna:
- `misaligned[]` — faturas abertas com `due_day` divergente do original
- `duplicates[]` — duas+ faturas abertas no mesmo mês para mesmo cliente
- `gaps[]` — saltos de competência (cliente com fatura jan + março, sem fevereiro)
- `invalid_dates[]` — `due_date` nulo ou fora de range razoável
- `summary` — contadores

### 1.8 Estender `repair_client_due_dates` existente
Adicionar parâmetro `p_reason text default 'repair'` e gravar em `recurrence_audit_logs` além de `system_logs`.

---

## 2. Edge function `recurrence-guardian` (cron diário)

`supabase/functions/recurrence-guardian/index.ts`:
- Roda `audit_recurrence_integrity(NULL)`
- Se detectar problemas, insere alerta em `system_logs` com `action='recurrence_alert'`
- Opcional: envia para `webhook_configs` com evento `recurrence.alert`
- Retorna JSON com summary

Agendar via `pg_cron` 1×/dia 03:00 (usar `supabase--insert` com URL+anon key específicos).

---

## 3. Frontend — Dashboard Admin

Nova página `src/pages/RecurrenceAudit.tsx` (rota `/admin/recurrence`, guarda `has_role admin`):

Seções:
1. **Status de integridade** — cards: total clientes, desalinhados, duplicidades, gaps
2. **Tabela de divergências** — cliente, fatura, due_date atual, due_day original, proposta, motivo
3. **Botões**:
   - `Simular correções (Dry-run)` → chama `repair_client_due_dates(org, true)` e mostra antes/depois
   - `Aplicar correções` → confirm window.confirm + chama com `false`
   - `Recarregar auditoria`
4. **Histórico** — últimas 100 entradas de `recurrence_audit_logs` filtráveis por org/cliente/motivo

Adicionar item no `AppSidebar` (visível só para admin) e card de atalho no `AdminPanel.tsx`.

---

## 4. Hardening de código (regras críticas)

- `client-portal/index.ts` — já força `due_day` original. Adicionar `INSERT INTO recurrence_audit_logs (..., reason='portal_generation', source='automatic')`.
- `Dashboard.tsx::confirmGenerateInvoice` — adicionar comentário "NUNCA usar paid_date" e gravar audit log com `reason='auto_generation'`.
- `baixa-manual` edge function — garante que **não toca em `due_date`** (já não toca, adicionar comentário-contrato).
- `Invoices.tsx` (edição manual) — ao alterar `due_date` de fatura aberta, exibir warning se diferir do `due_day` original e gravar audit com `reason='manual_edit'`.

---

## 5. Rollback

- `recurrence_audit_logs` é a trilha reversa: cada linha tem `old_due_date` → SQL de rollback gerável.
- Função utilitária `rollback_due_date_change(audit_log_id uuid)` que reverte uma alteração específica (apenas admin, apenas se fatura ainda `aberto`).

---

## Detalhes técnicos (resumo)

| Item | Tipo | Localização |
|---|---|---|
| Tabela audit | migration | nova |
| Triggers (3) | migration | nova |
| Funções SQL (4) | migration | nova |
| Índices (3) | migration | nova |
| Edge function guardian | TS | `supabase/functions/recurrence-guardian/` |
| Cron job | insert SQL | pg_cron |
| Página admin | TSX | `src/pages/RecurrenceAudit.tsx` |
| Rota + sidebar | edit | `App.tsx`, `AppSidebar.tsx` |
| Hooks portal/dashboard | edit | 3 arquivos |

---

## Ordem de execução

1. Migração (tabela + triggers + funções + índices)
2. Edge function `recurrence-guardian` + cron
3. Página admin + rota
4. Hardening dos pontos de geração
5. Rodar `audit_recurrence_integrity()` em todas orgs e mostrar relatório final

---

## Confirmação

Confirma para eu seguir? Se quiser ajustar (ex: pular cron, pular página admin, mudar janela de retroativo de 90d), me diz antes.
