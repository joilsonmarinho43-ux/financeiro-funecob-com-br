# FUNecob

SaaS white-label de cobrança e crediário (funerárias e carnês) — multi-tenant, com WhatsApp,
PIX com OCR de comprovantes, gateway de pagamento e portal do cliente.

Esta instalação é **independente**: PostgreSQL, Supabase self-hosted e frontend são exclusivos
do FUNecob (rede `funecob_network`, volumes `funecob_*`, projeto compose `funecob`). Nenhum
recurso é compartilhado com outros projetos da VPS — em especial o **Nexus 33**.

> **Evolution API e MongoDB já existentes na VPS NÃO são recriados.**
> O FUNecob reutiliza o container `evolution` (`atendai/evolution-api:v1.6.0`, porta 8080) e o
> `mongodb-lab` (`mongo:7`) através de `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`.
> Detalhes em [DEPLOY.md](DEPLOY.md) §0.

## Instalação em um comando

```bash
git clone https://github.com/joilsonmarinho43-ux/financeiro-funecob-com-br.git funecob
cd funecob
cp .env.example .env
nano .env
./deploy/install.sh
```

| Ação        | Comando                                  |
| ----------- | ---------------------------------------- |
| Instalar    | `./deploy/install.sh`                    |
| Atualizar   | `git pull && ./deploy/update.sh`         |
| Backup      | `./deploy/backup.sh`                     |
| Restore     | `./deploy/restore.sh backups/<pasta>`    |
| Healthcheck | `./deploy/healthcheck.sh`                |
| Migrations  | `./deploy/migrate.sh`                    |
| Auditoria   | `./deploy/audit-dependencies.sh`         |

## Arquitetura

```text
                Internet 443 → proxy JÁ EXISTENTE na VPS
                (ou funecob-caddy, apenas se USE_OWN_PROXY=true)
                     │                          │
     financeiro.funecob.com.br        api.funecob.com.br
        127.0.0.1:54320                 127.0.0.1:54321
                     │                          │
              ┌──────▼─────┐            ┌───────▼──────┐
              │ funecob-web│            │ funecob-kong │
              └────────────┘            └──┬───────────┘
                                           │
   ┌──────────────┬────────────────┬───────┴──────┬──────────────────┐
┌──▼─────────┐ ┌──▼─────────┐ ┌────▼──────┐ ┌─────▼───────────┐ ┌────▼──────────┐
│funecob-auth│ │funecob-rest│ │ funecob-  │ │ funecob-edge-   │ │funecob-storage│
│  (GoTrue)  │ │(PostgREST) │ │ realtime  │ │   functions     │ │               │
└──────┬─────┘ └──────┬─────┘ └────┬──────┘ └─────┬───────────┘ └────┬──────────┘
       └──────────────┴────────────┴──────────────┴──────────────────┘
                                   │
                          ┌────────▼────────┐
                          │   funecob-db    │ PostgreSQL 15 (127.0.0.1:54322)
                          └─────────────────┘

  rede: funecob_network   │   projeto compose: funecob

  EXTERNO / REUTILIZADO (não gerenciado por este compose):
     container "evolution"   → EVOLUTION_API_URL=http://host.docker.internal:8080
     container "mongodb-lab" → pertence à Evolution existente
```

### Serviços

| Container                 | Imagem                    | Papel                              |
| ------------------------- | ------------------------- | ---------------------------------- |
| `funecob-caddy`           | caddy:2-alpine            | HTTPS + reverse proxy              |
| `funecob-web`             | build local (nginx)       | Frontend React/Vite                |
| `funecob-kong`            | kong:2.8.1                | API Gateway do Supabase            |
| `funecob-db`              | supabase/postgres:15.8.1  | PostgreSQL + pg_cron + pg_net      |
| `funecob-auth`            | supabase/gotrue           | Autenticação (JWT)                 |
| `funecob-rest`            | postgrest                 | Data API (RLS)                     |
| `funecob-realtime`        | supabase/realtime         | Subscriptions                      |
| `funecob-storage`         | supabase/storage-api      | Buckets `logos` / `receipts`       |
| `funecob-edge-functions`  | supabase/edge-runtime     | 14 funções Deno                    |
| `funecob-evolution`       | atendai/evolution-api     | WhatsApp                           |
| `funecob-mongodb`         | mongo:7                   | Base do Evolution API              |

### Redes, volumes e portas

- Rede: `funecob_network` (bridge, exclusiva)
- Volumes: `funecob_db_data`, `funecob_storage_data`, `funecob_mongo_data`,
  `funecob_evolution_data`, `funecob_caddy_data`, `funecob_caddy_config`
- Portas públicas: **80** e **443** (Caddy)
- Portas locais (só `127.0.0.1`): **54321** (Kong), **54322** (PostgreSQL)

### Domínios

| Domínio                      | Serviço                    |
| ---------------------------- | -------------------------- |
| `financeiro.funecob.com.br`  | Frontend + portal cliente  |
| `api.funecob.com.br`         | Supabase self-hosted (Kong)|
| `wa.funecob.com.br`          | Evolution API              |

## Stack do aplicativo

React 18 · Vite 5 · TypeScript · Tailwind · shadcn/ui · TanStack Query · Supabase JS

## Documentação

- [DEPLOY.md](DEPLOY.md) — instalação passo a passo na VPS
- [MIGRATION.md](MIGRATION.md) — sair do ambiente gerenciado e migrar os dados
- [BACKUP.md](BACKUP.md) — backup e restore
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — problemas comuns
- `docs/` — arquitetura, banco, webhooks e segurança (histórico)

## Segurança

Nunca versione `.env`, chaves ou backups. Veja `.gitignore` e `.env.example`.
