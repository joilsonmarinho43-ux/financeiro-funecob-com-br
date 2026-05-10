## Diagnóstico

Rodei a query e confirmei o problema. **11 clientes** estão com mensalidades em dias diferentes do dia original cadastrado. Exemplos reais do banco:

| Cliente | Total faturas | Dias de vencimento encontrados |
|---|---|---|
| julia marinho | 12 | 1 e 5 |
| Vanessa | 2 | 6 e 27 |
| Layane Moura | 2 | 7 e 20 |
| Dalva Muniz | 2 | 7 e 25 |

### Onde está o bug

1. **`Dashboard.tsx`** já está correto — usa `parseDateLocal(inv.due_date).getDate()` (dia original da última fatura). ✅
2. **`client-portal/index.ts`** (geração via portal) — recebe `due_date` do cliente livre, não força o dia original. ⚠️
3. **`Invoices.tsx`** — criação manual usa data escolhida pelo usuário (ok, é manual).
4. **Não existe cron/trigger gerando faturas automaticamente** — toda recorrência é gerada sob demanda. Logo o "vazamento" do dia veio de geração manual onde alguém escolheu data diferente, ou da geração a partir de `paid_date`.

## Plano de correção

### Fase 1 — Relatório (sem alterar nada)
Gero CSV em `/mnt/documents/auditoria-mensalidades.csv` com:
- Cliente, dia original (mais antigo), faturas em aberto desalinhadas, nova data proposta.
- Você revisa antes de qualquer alteração.

### Fase 2 — Migração de correção (idempotente, transacional)
Cria função `public.repair_client_due_dates(p_organization_id uuid, p_dry_run boolean)`:

1. Para cada cliente, define **dia original** = `EXTRACT(DAY)` da fatura mais antiga (ordem `created_at`).
2. Para cada fatura **`status = 'aberto'`** desse cliente:
   - Calcula `nova_due_date = make_date(year, month, LEAST(dia_original, último_dia_do_mês))`.
   - Trata fevereiro / 30 / 31 / bissexto via `LEAST(...)`.
   - Se `nova_due_date <> due_date` **e** não existir outra fatura aberta do mesmo cliente nessa nova data → atualiza.
   - Se existir colisão → registra em log e **não** mexe (evita duplicar).
3. Faturas `pago`, `cancelado`, `vencido_pago` → **nunca tocadas**.
4. `paid_date`, `amount`, `id`, `client_id` → **preservados**.
5. Toda alteração registra em `system_logs` com `action = 'repair_due_date'` e `details = { invoice_id, old_due_date, new_due_date, reason }`.
6. Modo `dry_run = true` → só conta o que faria, não escreve.

Backup: como migração só faz `UPDATE invoices SET due_date = ...` em linhas `aberto`, o histórico em `system_logs` serve como trilha reversível.

### Fase 3 — Prevenção no código

1. **`client-portal/index.ts`**: ao gerar fatura via portal, ignora a `due_date` enviada e força `make_date(year, month, dia_original_do_cliente)`.
2. **`Dashboard.tsx`** (`confirmGenerateInvoice`): já está correto, mantém.
3. **`Clients.tsx`**: na criação inicial — já usa `due_day` do form. Manter.
4. Adicionar comentário/contrato: "Nunca usar `paid_date` como base de recorrência".

### Fase 4 — Validação final
- Rodar a query de detecção novamente → resultado deve ser **0 clientes inconsistentes** (exceto colisões reportadas).
- CSV de "antes/depois" em `/mnt/documents/`.

## Confirmação antes de executar

Faço **Fase 1 (só relatório)** primeiro e te mostro. Depois você aprova as Fases 2-4.

Posso seguir?
