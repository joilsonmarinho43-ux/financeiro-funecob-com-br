# MIGRATION — do ambiente gerenciado para a VPS independente

Este guia leva o FUNecob do Supabase gerenciado (Lovable Cloud) para a instalação
própria na VPS. Nenhum passo utiliza infraestrutura do **Nexus 33**.

## Visão geral

| Componente      | Antes (gerenciado)                | Depois (VPS FUNecob)                        |
| --------------- | --------------------------------- | ------------------------------------------- |
| PostgreSQL      | Supabase Cloud                    | `funecob-db` (volume `funecob_db_data`)      |
| Auth            | Supabase Auth                     | `funecob-auth` (GoTrue self-hosted)          |
| Data API        | Supabase REST                     | `funecob-rest` (PostgREST)                   |
| Storage         | Supabase Storage                  | `funecob-storage` (volume próprio)           |
| Edge Functions  | Supabase Functions                | `funecob-edge-functions` (edge-runtime)      |
| Realtime        | Supabase Realtime                 | `funecob-realtime`                           |
| Cron            | pg_cron gerenciado                | pg_cron no `funecob-db`                      |
| WhatsApp        | Evolution API externa             | Evolution **já existente** na VPS (reutilizada) |
| Frontend        | Hospedagem Lovable                | `funecob-web` atrás do proxy da VPS          |

## Fase 0 — Preparação (sem downtime)

1. VPS pronta, DNS de `api.` e `wa.` já apontando para o novo IP
   (mantenha `financeiro.` no ambiente antigo até o corte).
2. `./deploy/install.sh` — sobe a stack limpa e cria o schema pelas migrations.
   (Não é criada nenhuma Evolution API: a existente é reutilizada.)
3. Valide com `./deploy/healthcheck.sh`.

## Fase 1 — Exportar os dados do ambiente atual

No ambiente gerenciado, gere o dump (roles + dados de `auth`, `public`, `storage`):

```bash
pg_dump "$OLD_DATABASE_URL" \
  --schema=public --schema=auth --schema=storage \
  --no-owner --no-privileges --format=custom \
  -f funecob_export.dump
```

Baixe também os arquivos dos buckets `logos` e `receipts`.

## Fase 2 — Importar na VPS

```bash
docker compose -p funecob stop funecob-rest funecob-edge-functions funecob-web

docker cp funecob_export.dump funecob-db:/tmp/
docker compose -p funecob exec funecob-db \
  pg_restore -U postgres -d postgres --no-owner --no-privileges \
             --disable-triggers /tmp/funecob_export.dump
```

Depois:

```bash
./deploy/seed-storage.sh          # garante os buckets
./deploy/migrate.sh               # aplica migrations ainda pendentes
docker compose -p funecob up -d
```

Arquivos do Storage:

```bash
docker run --rm -v funecob_storage_data:/data -v "$PWD/storage-export":/in alpine \
  cp -r /in/. /data/
```

## Fase 3 — Autenticação

O GoTrue self-hosted lê a mesma tabela `auth.users`. As **senhas continuam válidas**
(bcrypt em `encrypted_password`) desde que o schema `auth` seja restaurado inteiro.

Requisitos preservados e obrigatórios:

- `signInWithPassword` e `signUp` (GoTrue)
- JWT HS256 assinado com o **mesmo** `JWT_SECRET` usado por REST/Realtime/Storage
- `auth.uid()`, `auth.role()`, `auth.jwt()` — criadas por `deploy/db/init/00-funecob-init.sh`
- roles `anon`, `authenticated`, `service_role`, `authenticator`
- trigger `on_auth_user_created` → `handle_new_user()` (perfil + organização + trial)
- tabela `public.user_roles` + função `public.has_role()` (nunca guardar role no perfil)

Recursos do Supabase gerenciado **não utilizados** pelo FUNecob: OAuth social,
magic link obrigatório, MFA e SSO. Nada precisa ser reimplementado.

E-mail: sem SMTP configurado, mantenha `MAILER_AUTOCONFIRM=true` (comportamento atual).
Para recuperação de senha por e-mail, preencha o bloco `SMTP_*` do `.env`.

## Fase 4 — RLS e multi-tenant (auditoria obrigatória)

As migrations recriam todas as policies. Confirme que nenhuma tabela ficou aberta:

```sql
-- Tabelas do schema public sem RLS habilitada
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (SELECT relname FROM pg_class WHERE relrowsecurity);

-- Tabelas com RLS mas sem policy (bloqueadas)
SELECT c.relname FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname
WHERE c.relrowsecurity AND p.policyname IS NULL;

-- GRANTs por tabela
SELECT table_name, grantee, string_agg(privilege_type, ',')
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','service_role')
GROUP BY 1,2 ORDER BY 1;
```

Tabelas que precisam de isolamento por `organization_id`:
`organizations`, `organization_members`, `user_roles`, `subscriptions`, `clients`,
`plans`, `invoices`, `transactions`, `billing_settings`, `billing_reminders`,
`whatsapp_instances`, `whatsapp_queue`, `whatsapp_messages`, `whatsapp_campaigns`,
`whatsapp_send_config`, `whatsapp_lid_map`, `auto_settlement_*`, `pix_trusted_payers`,
`bips`, `barcode_configs`, `client_portal_tokens`, `org_api_keys`, `webhook_configs`,
`webhook_logs`, `sms_messages`, `system_logs`, `recurrence_audit_logs`.

Regra mantida: além da RLS, as queries do frontend filtram `organization_id`
explicitamente (defesa em profundidade).

## Fase 5 — Integrações

**Evolution API** — a instância existente na VPS **continua como está**; não recrie nada.
Apenas garanta que as linhas do banco apontem para ela (elas têm precedência sobre o `.env`):

```sql
UPDATE public.whatsapp_instances
SET api_url = 'http://host.docker.internal:8080', api_key = '<EVOLUTION_API_KEY existente>';

UPDATE public.global_settings
SET api_host = 'http://host.docker.internal:8080';
```

**Mercado Pago** — links já emitidos apontam para o ambiente antigo. Não apague nada;
invalide para forçar reemissão sob demanda:

```sql
-- Preview do impacto
SELECT count(*) FROM public.invoices
WHERE status = 'aberto' AND payment_link IS NOT NULL;

-- Reemissão sob demanda (o app recria o link no próximo acesso)
UPDATE public.invoices
SET payment_link = NULL, payment_link_external_id = NULL
WHERE status = 'aberto' AND payment_link IS NOT NULL;
```

Faturas já pagas mantêm o histórico intacto.

**Portal do cliente** — os tokens continuam válidos; só o domínio muda. Garanta
`PORTAL_BASE_URL=https://financeiro.funecob.com.br` no `.env`.

**OCR** — provedor principal `GEMINI_API_KEY`. `LOVABLE_API_KEY` é **opcional**:
funciona apenas como fallback. Comportamento: tenta Gemini → se falhar e houver
`LOVABLE_API_KEY`, tenta o gateway → se ambos falharem, o comprovante vai para
**revisão manual** e **nenhuma baixa automática é feita**. Sem `LOVABLE_API_KEY`
o sistema opera normalmente.

**bip-receiver / extensão Chrome** — atualize a URL e a `BIP_API_KEY` no popup da extensão:
`https://api.funecob.com.br/functions/v1/bip-receiver`.

## Fase 6 — Corte

1. Coloque o ambiente antigo em modo leitura (avise os usuários).
2. Repita a Fase 2 com um dump fresco (janela curta).
3. Aponte `financeiro.funecob.com.br` para o IP da VPS.
4. Aguarde o Caddy emitir o certificado (`docker compose -p funecob logs -f funecob-caddy`).
5. `./deploy/healthcheck.sh` e `./deploy/audit-dependencies.sh`.
6. Rode o checklist final de [DEPLOY.md](DEPLOY.md) e o de aceite abaixo.

## Checklist de aceite

```
[ ] clone do GitHub
[ ] configuração do .env
[ ] docker compose config
[ ] build do frontend
[ ] PostgreSQL saudável
[ ] migrations aplicadas
[ ] Auth (login e cadastro)
[ ] REST (listagem com RLS)
[ ] Storage (upload de logo)
[ ] Edge Functions respondendo
[ ] Evolution API pareada
[ ] MongoDB saudável
[ ] frontend carregando
[ ] HTTPS válido nos 3 domínios
[ ] login com conta existente
[ ] criação de cliente
[ ] geração de cobrança
[ ] envio de WhatsApp
[ ] recebimento PIX
[ ] OCR de comprovante
[ ] pagamento via Mercado Pago
```
