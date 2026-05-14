## Módulo: Motor de Antecipação e Liquidação Automática via WhatsApp (PIX OCR)

Camada **complementar e desacoplada**. Não toca em: `perform_baixa_manual`, `generate_next_recurrence`, `billing-cron`, gateways, fluxos de cobrança atuais.

---

### 1. Banco de Dados (migration)

**Feature flag global** (em `global_settings`):
- `auto_settlement_enabled` = `'false'` (default OFF — segurança)

**Novas tabelas (sufixo `auto_` para isolamento total):**

```text
auto_settlement_credits          -- saldo a favor do cliente
  id, organization_id, client_id, amount, source (pix_ocr|sobra_quitacao|manual),
  origin_event_id, status (disponivel|consumido|estornado), used_amount, created_at, updated_at

auto_settlement_events           -- cada comprovante PIX recebido (idempotência via txid)
  id, organization_id, client_id (nullable), phone, raw_text, ocr_payload (jsonb),
  txid (unique nullable), pix_end_to_end_id, amount_detected,
  status (recebido|processando|conciliado|erro|duplicado|ignorado),
  whatsapp_message_id, error_message, processed_at, created_at
  UNIQUE (organization_id, txid) WHERE txid IS NOT NULL

auto_settlement_logs             -- auditoria detalhada passo a passo
  id, organization_id, event_id, client_id, action, details (jsonb), created_at

auto_settlement_allocations      -- alocação valor → fatura (rastreabilidade)
  id, event_id, invoice_id, amount_applied, was_generated (bool), created_at
```

**RLS:** todas com `organization_id = get_user_organization_id(auth.uid())` (SELECT/INSERT/UPDATE), service_role bypass para a edge function.

**RPC `auto_settlement_process_payment(p_event_id uuid)`** — função SECURITY DEFINER que:
1. Trava o evento (`FOR UPDATE`)
2. Busca faturas `aberto` do cliente ordenadas por `due_date ASC`
3. Quita uma a uma (status='pago', paid_date=hoje) consumindo `amount_detected`
4. Se sobra > 0 e existem competências futuras a gerar: chama lógica equivalente a `rebuild_client_recurrence` (mês a mês até consumir saldo) e quita
5. Sobra final → cria registro em `auto_settlement_credits`
6. Insere logs em cada passo + allocations
7. Marca evento como `conciliado`

Idempotência: trigger ou check no início da RPC garante que evento já `conciliado` retorna early.

---

### 2. Edge Function: `pix-ocr-settlement`

`supabase/functions/pix-ocr-settlement/index.ts`

Endpoints (POST):
- `/ingest` — recebe payload do webhook WhatsApp com phone + image_url (ou base64) + message_id
  - Valida feature flag
  - Identifica cliente por phone (normalizado) dentro da org
  - Roda OCR via **Lovable AI Gateway** (`google/gemini-2.5-flash`) com prompt estruturado pedindo JSON: `{ amount, txid, end_to_end_id, paid_at, sender_name }`
  - Cria `auto_settlement_events`
  - Se `txid` já existe → marca `duplicado`, retorna sem processar
  - Chama RPC `auto_settlement_process_payment`
  - Envia confirmação via WhatsApp (reusa `whatsapp-sender` existente, sem alterá-lo) com resumo: faturas quitadas + crédito gerado

CORS habilitado, `verify_jwt = false` (recebe webhook externo + valida via header secret `AUTO_SETTLEMENT_WEBHOOK_SECRET`).

Processamento assíncrono: responde 202 imediatamente e processa em background via `EdgeRuntime.waitUntil`.

---

### 3. UI (mínima, não-invasiva)

Nova página admin `/admin/auto-settlement`:
- Toggle da feature flag
- Tabela de eventos recentes (status, cliente, valor, faturas quitadas, crédito gerado)
- Tabela de créditos disponíveis por cliente
- Drill-down em logs de um evento
- Link no menu lateral apenas para admin (mesmo padrão de `/admin/recurrence`)

Nenhuma alteração em Clientes, Faturas, Dashboard, BillingSettings.

---

### 4. Salvaguardas

- Feature flag OFF por default — nada roda até admin ligar
- Trigger `trg_invoices_validate_due_date` existente já bloqueia duplicidade no mês ✅
- `UNIQUE (organization_id, txid)` bloqueia reprocessamento
- Lock `FOR UPDATE` no evento previne race condition
- Logs imutáveis (sem UPDATE/DELETE policy)
- Mensagens de WhatsApp passam pela infra existente (sem novo provider)

---

### 5. Entregáveis

1. Migration: 4 tabelas + RPC + RLS + flag global
2. Edge function `pix-ocr-settlement` (ingest + process)
3. Página `/admin/auto-settlement` (read-only + toggle)
4. Item de menu admin
5. Doc curta em `README` da função explicando como apontar webhook do WhatsApp

**Não tocar:** `perform_baixa_manual`, `generate_next_recurrence`, `billing-cron`, `whatsapp-sender`, `bip-receiver`, gateways, Invoices.tsx, Clients.tsx, Dashboard.tsx.