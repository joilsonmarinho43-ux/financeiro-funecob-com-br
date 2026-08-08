# Banco de dados

## O que é usado hoje

O FUNecob usa **Supabase**, e usa de fato quatro componentes — nenhum deles é
supérfluo:

| Componente | Uso real | Substituível? |
|---|---|---|
| PostgreSQL + RLS | Todos os dados; isolamento multi-tenant por `organization_id` | Sim, é Postgres padrão (self-host possível) |
| Auth | Login, sessões, `auth.users`, trigger `handle_new_user` | Exigiria reescrever autenticação — **não recomendado** |
| Storage | Buckets `logos` (público) e `receipts` (privado) | Sim, mas exige adaptar uploads |
| Edge Functions | 14 funções em Deno com toda a lógica de servidor | Exigiria portar para um servidor Node — **não recomendado** |

Por isso o Supabase foi **preservado**. Ele pode rodar hospedado ou
self-hosted na própria VPS (`supabase/docker`), sem alterações no código: basta
apontar as variáveis de ambiente.

## Migrations

`supabase/migrations/` contém 62 migrations versionadas que recriam o schema
completo, incluindo grants e policies.

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push          # aplica tudo em um banco novo
supabase db diff          # confere divergências
```

## Tabelas principais

**Núcleo:** `organizations`, `organization_members`, `profiles`, `user_roles`,
`subscriptions`, `global_settings`, `org_api_keys`.

**Financeiro:** `clients`, `plans`, `invoices`, `transactions`,
`billing_settings`, `billing_reminders`, `barcode_configs`, `bips`.

**Baixa automática PIX:** `auto_settlement_events`, `auto_settlement_allocations`,
`auto_settlement_credits`, `auto_settlement_logs`, `pix_trusted_payers`,
`ocr_provider_stats`.

**WhatsApp:** `whatsapp_instances`, `whatsapp_messages`, `whatsapp_queue`,
`whatsapp_campaigns`, `whatsapp_send_config`, `whatsapp_lid_map`, `sms_messages`.

**Portal e auditoria:** `client_portal_tokens`, `system_logs`,
`recurrence_audit_logs`, `webhook_configs`, `webhook_logs`.

## Funções relevantes (todas `security definer`)

| Função | Papel |
|---|---|
| `has_role(uuid, app_role)` | Checagem de papel sem recursão de RLS |
| `get_user_organization_id(uuid)` | Organização do usuário |
| `is_collector(uuid)` | Identifica cobrador |
| `perform_baixa_manual(...)` | Baixa transacional + cancelamento de lembretes |
| `generate_next_recurrence(...)` | Gera a próxima mensalidade após a baixa |
| `auto_settlement_process_payment(uuid)` | Quita/gera faturas a partir de comprovante PIX |
| `rebuild_client_recurrence(...)` | Reconstrói o calendário de faturas |
| `repair_client_due_dates(...)` | Corrige vencimentos divergentes (somente admin) |
| `audit_recurrence_integrity(...)` | Auditoria de duplicidades, lacunas e datas inválidas |
| `rollback_due_date_change(uuid)` | Reverte alteração de vencimento (somente admin) |
| `handle_new_user()` | Cria perfil, papel, organização e trial no cadastro |

## Triggers

- `on_auth_user_created` (auth.users) → `handle_new_user`
- `invoices_validate_due_date` → impede vencimento nulo, retroativo (>365d) ou duplicado na competência
- `invoices_protect_paid` → bloqueia edição de valor/vencimento/cliente em faturas pagas
- `invoices_audit_due_date` → registra alterações em `recurrence_audit_logs`
- `update_*_updated_at` → mantém `updated_at`

## Segurança (RLS)

Toda tabela pública tem RLS habilitado, com policies por `organization_id` e
grants explícitos para `authenticated` / `service_role`. Papéis ficam em
`user_roles` (nunca em `profiles`), evitando escalonamento de privilégio.
As queries do frontend aplicam também um filtro explícito por
`organization_id`, como defesa em profundidade.

## Recriar em ambiente independente

1. Crie o projeto (hospedado ou `supabase/docker` self-hosted na VPS).
2. `supabase db push` para aplicar as migrations.
3. Crie os buckets `logos` (público) e `receipts` (privado).
4. `supabase functions deploy` e defina os secrets.
5. Cadastre o primeiro usuário; o trigger cria organização e trial.
6. Configure `global_settings` (host e chave da Evolution) pela UI.
7. Agende os jobs — ver [PRODUCTION.md](./PRODUCTION.md#jobs-e-cron).
