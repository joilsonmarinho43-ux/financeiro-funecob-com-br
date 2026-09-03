# Migração dos dados REAIS (Sol da Vida) para a VPS

Este documento descreve como levar **todos os dados reais** de uma empresa
(organização) do ambiente atual para o PostgreSQL da VPS, sem depender do
Lovable depois do deploy.

> Nenhum dado real é versionado no Git. O repositório contém apenas o
> **schema, as funções e os scripts** de exportação/importação.

---

## 1. Visão geral

```text
Ambiente atual (Postgres)            VPS (funecob-db)
        │                                    │
  export-tenant.sh                     import-tenant.sh
        │  CSVs em ./migration-data/         │  INSERT ... ON CONFLICT DO NOTHING
        └──────────── scp ───────────────────┘
```

- **Idempotente**: reexecutar o import não duplica clientes, faturas ou histórico
  (chave primária `id` + `ON CONFLICT (id) DO NOTHING`).
- **UUIDs preservados**: todos os `id` originais são mantidos, portanto todos os
  relacionamentos (cliente → plano → fatura → transação) continuam válidos.
- **Tolerante a schema**: o import usa apenas as colunas presentes nos dois lados.

## 2. Tabelas migradas

Definidas em `deploy/tenant/tables.conf`, na ordem de chaves estrangeiras:

`organizations`, `profiles`, `user_roles`, `organization_members`,
`subscriptions`, `org_api_keys`, `billing_settings`, `barcode_configs`,
`whatsapp_send_config`, `whatsapp_instances`, `webhook_configs`, `plans`,
`clients`, `invoices`, `transactions`, `billing_reminders`,
`client_portal_tokens`, `bips`, `pix_trusted_payers`, `auto_settlement_events`,
`auto_settlement_allocations`, `auto_settlement_credits`,
`auto_settlement_logs`, `ocr_provider_stats`, `whatsapp_campaigns`,
`whatsapp_messages`, `whatsapp_queue`, `whatsapp_lid_map`, `sms_messages`,
`recurrence_audit_logs`, `webhook_logs`, `system_logs`
— além de `auth.users` (login preservado).

## 3. Autenticação — não se perde o acesso

O usuário responsável está ligado assim:

```text
auth.users.id = profiles.id = organization_members.user_id = user_roles.user_id
organization_members.organization_id = organizations.id
```

`export-tenant.sh` exporta `auth.users` **com a senha já criptografada**
(`encrypted_password`), então o login e a senha atuais continuam funcionando na
VPS. Nenhuma senha em texto puro é lida, gravada ou versionada.

Se preferir não migrar hashes, basta apagar `auth_users.csv` antes do import,
criar o usuário manualmente na VPS e rodar:

```sql
UPDATE public.organization_members SET user_id = '<novo-uuid>' WHERE organization_id = '<org>';
UPDATE public.user_roles         SET user_id = '<novo-uuid>' WHERE user_id = '<uuid-antigo>';
```

## 4. Passo a passo

### 4.1 Exportar (máquina com acesso ao banco atual)

```bash
export SOURCE_DB_URL="postgresql://usuario:senha@host:5432/postgres"
./deploy/export-tenant.sh "Sol da Vida"
# saída: ./migration-data/sol-da-vida/  (ignorado pelo Git)
cat migration-data/sol-da-vida/_meta.txt   # confira: public.clients=128
```

### 4.2 Enviar para a VPS

```bash
scp -r migration-data/sol-da-vida root@SEU_IP:~/funecob/migration-data/
```

### 4.3 Instalar/atualizar a VPS e importar

```bash
cd ~/funecob
git pull origin main
./deploy/install.sh          # ou ./deploy/update.sh se já instalado
./deploy/import-tenant.sh migration-data/sol-da-vida --dry-run
./deploy/import-tenant.sh migration-data/sol-da-vida
```

## 5. Como verificar

```bash
# quantidade real de clientes e mensalidades em aberto
docker exec -i funecob-db psql -U postgres -d postgres -c \
 "SELECT o.name,
   (SELECT count(*) FROM clients c  WHERE c.organization_id=o.id) AS clientes,
   (SELECT count(*) FROM invoices i WHERE i.organization_id=o.id AND i.status<>'pago') AS em_aberto
  FROM organizations o;"

# integridade de relacionamentos (tudo deve estar 'OK')
docker exec -i funecob-db psql -U postgres -d postgres -c \
 "SELECT * FROM tenant_integrity_check('<ORG_ID>');"

# duplicação (deve retornar 0 linhas)
docker exec -i funecob-db psql -U postgres -d postgres -c \
 "SELECT id, count(*) FROM clients GROUP BY id HAVING count(*)>1;"
```

O painel **Super Admin** também passa a mostrar os números reais por empresa
(clientes, mensalidades em aberto e vencidas), lidos da função
`public.admin_org_stats()`.

## 6. Rollback

Antes de importar, o `install.sh`/`update.sh` já gera backup. Manualmente:

```bash
./deploy/backup.sh                       # antes
./deploy/restore.sh <arquivo-do-backup>  # se algo der errado
```

Rollback cirúrgico de uma organização (apaga somente ela):

```sql
BEGIN;
DELETE FROM invoices     WHERE organization_id = '<ORG_ID>';
DELETE FROM transactions WHERE organization_id = '<ORG_ID>';
DELETE FROM clients      WHERE organization_id = '<ORG_ID>';
DELETE FROM plans        WHERE organization_id = '<ORG_ID>';
-- confira as contagens antes de confirmar
COMMIT;  -- ou ROLLBACK;
```

## 7. Variáveis de ambiente necessárias

| Variável | Para que serve | Onde é usada | Obrigatória |
|---|---|---|---|
| `SOURCE_DB_URL` | Conexão com o banco de ORIGEM para exportar | `deploy/export-tenant.sh` (só na exportação) | Sim, na exportação |
| `POSTGRES_PASSWORD` | Senha do Postgres da VPS | `.env`, `funecob-db` | Sim |
| `JWT_SECRET` | Assina os JWTs (Auth/PostgREST/Realtime) | `.env`, GoTrue/Kong | Sim |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | Chaves da API (geradas por `deploy/genkeys.sh`) | `.env`, frontend e Edge Functions | Sim |
| `SUPABASE_PUBLIC_URL` / `VITE_SUPABASE_URL` | Endpoint público da API na VPS | `.env`, build do frontend | Sim |
| `PORTAL_BASE_URL` | Monta os links do portal do cliente | Edge Functions | Sim |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | WhatsApp (instância já existente na VPS) | Edge Functions | Sim (para WhatsApp) |
| `SMTP_*` | E-mails de autenticação | GoTrue | Opcional |
| `MERCADOPAGO_ACCESS_TOKEN` | Gateway de pagamento | `gateway-create-payment` | Opcional |
| `GEMINI_API_KEY` | OCR dos comprovantes PIX | `pix-ocr-settlement` | Opcional (recomendado) |
| `BIP_API_KEY` | Autentica a extensão do Chrome | `bip-receiver` | Opcional |
| `BACKUP_PASSPHRASE` | Criptografa os backups | `deploy/backup.sh` | Recomendada |

Nenhum desses valores deve ser escrito em migrations ou no código — todos ficam
no `.env` da VPS, que está no `.gitignore`.
