# FUNecob

SaaS white-label de cobrança e crediário (funerárias e carnês) — multi-tenant, com WhatsApp,
PIX com OCR de comprovantes, gateway de pagamento e portal do cliente.

Esta instalação é **totalmente independente**: PostgreSQL, Supabase self-hosted, Evolution API,
MongoDB e Caddy são exclusivos do FUNecob. Nenhum recurso é compartilhado com outros projetos
da VPS (em especial o **Nexus 33**): rede, volumes, containers, portas e proxy são próprios.

## Instalação em um comando

```bash
git clone https://github.com/joilsonmarinho43-ux/financeiro-funecob-com-br.git funecob
cd funecob
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
                         Internet (443)
                               │
                      ┌────────▼────────┐
                      │  funecob-caddy  │  HTTPS Let's Encrypt
                      └───┬────────┬────┘
        financeiro.…      │        │      api.…  /  wa.…
                  ┌───────▼──┐  ┌──▼───────────┐   ┌────────────────┐
                  │funecob-  │  │ funecob-kong │   │funecob-evolution│
                  │   web    │  │  API Gateway │   │   (WhatsApp)    │
                  └──────────┘  └──┬───────────┘   └────────┬────────┘
                                   │                        │
   ┌──────────────┬────────────────┼──────────────┐   ┌─────▼──────────┐
   │              │                │              │   │funecob-mongodb │
┌──▼─────────┐ ┌──▼─────────┐ ┌────▼──────┐ ┌─────▼───────────┐└────────┘
│funecob-auth│ │funecob-rest│ │funecob-   │ │funecob-edge-    │
│  (GoTrue)  │ │(PostgREST) │ │ realtime  │ │   functions     │
└──────┬─────┘ └──────┬─────┘ └────┬──────┘ └─────┬───────────┘
       │              │            │              │      ┌────────────────┐
       └──────────────┴────────────┴──────────────┴──────►│  funecob-db    │
                                          funecob-storage │ (PostgreSQL 15)│
                                                          └────────────────┘
                     rede: funecob_network   │   projeto compose: funecob
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
