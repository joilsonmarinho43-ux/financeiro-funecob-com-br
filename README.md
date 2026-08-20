# FUNecob

SaaS multi-tenant de gestão de cobranças (funerárias e crediários): clientes,
planos, faturas, baixa manual e automática por comprovante PIX, portal do
cliente, relatórios, robô de cobrança e envio de mensagens por WhatsApp via
**Evolution API**.

- **Frontend:** React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui (SPA)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions em Deno)
- **WhatsApp:** Evolution API v1.6.0 (instalada separadamente na sua VPS)
- **Empacotamento:** Docker (nginx servindo o build de produção)

> Documentação detalhada em [`docs/`](./docs):
> [Instalação](./docs/INSTALL.md) ·
> [Produção](./docs/PRODUCTION.md) ·
> [Variáveis de ambiente](./docs/ENVIRONMENT.md) ·
> [Arquitetura](./docs/ARCHITECTURE.md) ·
> [Webhooks](./docs/WEBHOOKS.md) ·
> [Banco de dados](./docs/DATABASE.md) ·
> [Backup](./docs/BACKUP.md) ·
> [**Fase 1 — VPS**](./docs/PHASE1-VPS.md) ·
> [Edge Functions (futuro)](./docs/EDGE-FUNCTIONS-FUTURE.md) ·
> [Segurança](./docs/SECURITY.md)

---

## Requisitos da VPS

| Item | Versão mínima | Observação |
|---|---|---|
| Docker Engine | 24+ | com plugin `docker compose` |
| Git | 2.x | para clonar/atualizar |
| Evolution API | v1.6.0 | serviço próprio na VPS (não incluído neste repositório) |
| Projeto Supabase | — | hospedado ou self-hosted (ver [docs/DATABASE.md](./docs/DATABASE.md)) |
| Node.js | 20 | apenas para desenvolvimento local |
| CPU / RAM | 2 vCPU / 2 GB | mínimo confortável |

Portas: `8080` (app, configurável via `APP_PORT`) e a porta da sua Evolution
API (tipicamente `8080` no host dela). Em produção, coloque um proxy reverso
(Nginx/Caddy/Traefik) com HTTPS na frente.

---

## Instalação rápida

```bash
git clone <URL_DO_REPOSITORIO> FUNECOB
cd FUNECOB
cp .env.example .env
nano .env                 # preencha as variáveis
docker compose up -d --build
```

> **Fase 1 (atual):** a VPS executa apenas o aplicativo web. Banco, Auth,
> Storage, RLS, Realtime, Edge Functions e cron continuam no Supabase atual.
> Nenhum processamento é duplicado na VPS. Detalhes e comandos completos em
> [docs/PHASE1-VPS.md](./docs/PHASE1-VPS.md).

Verificar, ver logs, reiniciar e atualizar:

```bash
docker compose ps
docker compose logs -f
docker compose restart
git pull && docker compose up -d --build
```

Health check: `curl -f http://localhost:8080/healthz` → `ok`.

> **Importante:** as variáveis `VITE_*` são embutidas no bundle em tempo de
> build. Ao alterá-las é obrigatório rodar `docker compose up -d --build`
> novamente (um `restart` não basta).

Passo a passo completo, incluindo deploy das Edge Functions e proxy HTTPS:
[docs/INSTALL.md](./docs/INSTALL.md).

---

## Variáveis de ambiente

Resumo (detalhes e exemplos em [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md)):

### Aplicação / build

| Variável | Para que serve |
|---|---|
| `NODE_ENV` | Modo de build; use `production`. |
| `APP_PORT` | Porta publicada do container web no host (padrão `8080`). |
| `TZ` | Timezone dos containers (`America/Sao_Paulo`). |

### Frontend (públicas — vão para o bundle)

| Variável | Para que serve |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase usada pelo cliente e para montar as URLs das Edge Functions. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon/publishable. Pública por definição — a proteção real é o RLS. |
| `VITE_SUPABASE_PROJECT_ID` | Referência do projeto; usada em chamadas auxiliares. |
| `VITE_PORTAL_BASE_URL` | Domínio público do Portal do Cliente usado nos links gerados no frontend. |

### Servidor / Edge Functions (segredos)

| Variável | Para que serve |
|---|---|
| `SUPABASE_URL` | URL do projeto para o código de servidor. |
| `SUPABASE_ANON_KEY` | Chave anon usada em chamadas com contexto de usuário. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave administrativa das Edge Functions. **Nunca** no frontend. |
| `SUPABASE_DB_URL` | Conexão direta ao Postgres (migrations, backup, cron). |
| `EVOLUTION_API_URL` | URL da Evolution API. Fallback global quando a instância/`global_settings` não define. |
| `EVOLUTION_API_KEY` | Global API Key da Evolution. Mesmo fallback. |
| `PORTAL_BASE_URL` | Domínio do portal usado pelas Edge Functions ao montar links de WhatsApp. |
| `GEMINI_API_KEY` | Opcional — OCR de comprovantes PIX. |
| `LOVABLE_API_KEY` | Opcional — provedor de OCR alternativo. Sem ele, o OCR por IA é pulado e o evento vai para revisão manual. |

Nenhum segredo é versionado: `.env` está no `.gitignore` e apenas
`.env.example` (com placeholders) vai para o GitHub.

---

## Banco de dados

O FUNecob usa **PostgreSQL via Supabase**, e depende de quatro componentes:
Postgres (com RLS multi-tenant por `organization_id`), Auth (`auth.users`),
Storage (buckets `logos` e `receipts`) e Edge Functions (Deno).

Todas as 62 migrations estão versionadas em `supabase/migrations/` e recriam o
schema completo — tabelas, índices, funções, triggers, policies e grants — em
um projeto novo:

```bash
supabase link --project-ref <SEU_PROJECT_REF>
supabase db push
```

Detalhes de tabelas, funções (`perform_baixa_manual`, `has_role`,
`generate_next_recurrence`, …), triggers e policies:
[docs/DATABASE.md](./docs/DATABASE.md).

---

## Evolution API

A integração vive em `supabase/functions/_shared/evolutionSend.ts` (envio, com
compatibilidade v1.6.0 `textMessage` e fallback v2 `text`) e em
`supabase/functions/whatsapp-manager/index.ts` (criação de instância, QR Code,
status, reset de sessão, logout).

Resolução de credenciais, em ordem:

1. `whatsapp_instances.api_url` / `api_key` — por organização (prioridade máxima);
2. `global_settings.api_host` / `global_api_key` — tela **Configurações Globais**;
3. `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` — variáveis de ambiente (VPS).

Rota de envio: `POST {EVOLUTION_API_URL}/message/sendText/{instância}` com
header `apikey`. Não há mais IP, domínio ou chave fixa no código.

Configuração completa: [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md#evolution-api).

---

## Webhooks

| Endpoint | Origem | Auth |
|---|---|---|
| `POST {SUPABASE_URL}/functions/v1/whatsapp-webhook` | Evolution API (`messages.upsert`, `connection.update`) | pública (`verify_jwt=false`) |
| `POST {SUPABASE_URL}/functions/v1/bip-receiver` | Extensão Chrome / sistemas externos | `org_api_keys` |
| `POST {SUPABASE_URL}/functions/v1/pix-ocr-settlement` | Pipeline interno de comprovantes | pública (`verify_jwt=false`) |
| `POST {SUPABASE_URL}/functions/v1/gateway-create-payment` (retorno Mercado Pago) | Gateway de pagamento | `notification_url` + `external_reference` |

Payloads, respostas e como apontar cada URL para a sua VPS/domínio:
[docs/WEBHOOKS.md](./docs/WEBHOOKS.md).

---

## Jobs, cron e filas

- `billing-cron` — lembretes e faturamento diário (agendado via `pg_cron`).
- `whatsapp-sender` — consome a fila `whatsapp_queue` respeitando janela de
  envio e limites anti-ban (a cada 2 minutos).
- `pix-ocr-retry` — reprocessa comprovantes com OCR falho.

Todos rodam como Edge Functions agendadas pelo `pg_cron` no banco — nenhum
worker adicional é necessário na VPS. Comandos de agendamento em
[docs/PRODUCTION.md](./docs/PRODUCTION.md#jobs-e-cron).

---

## Produção

Build de produção, proxy HTTPS, logs com rotação, `restart: unless-stopped`,
timezone e health check já estão configurados no `Dockerfile` /
`docker-compose.yml`. Guia operacional: [docs/PRODUCTION.md](./docs/PRODUCTION.md).

## Docker, Nginx e domínio

```bash
docker compose config          # valida o compose e as variáveis do .env
docker compose up -d --build   # build + subida do container funecob-web
```

O container publica apenas em `127.0.0.1:${APP_PORT:-8080}`. O TLS e o domínio
ficam no Nginx do host: use o template
[`deploy/nginx/financeiro.funecob.com.br.conf`](./deploy/nginx/financeiro.funecob.com.br.conf)
(copie para `/etc/nginx/sites-available/`, crie o symlink em `sites-enabled/`,
rode `nginx -t && systemctl reload nginx` e emita o certificado com Certbot).
O domínio oficial de produção é `financeiro.funecob.com.br`.

## Relação com o Supabase (Fase 1)

A VPS executa **somente o frontend**. Permanecem no Supabase, sem alteração:

- PostgreSQL, RLS, RPCs, Realtime e Storage (`logos`, `receipts`);
- Auth (`auth.users`, sessões, e-mails de confirmação);
- **Edge Functions** — continuam rodando no runtime Deno do Supabase; a VPS
  não executa nenhuma delas;
- **Cron (`pg_cron`)** — `billing-cron`, `whatsapp-sender` e `pix-ocr-retry`
  continuam agendados no banco; nenhum worker ou cron roda na VPS.

Isso evita qualquer duplicidade de processamento (cobrança, baixa PIX, envio de
WhatsApp) entre a VPS e o Supabase.

## Backup

O que precisa de backup (banco, buckets de Storage, `.env`, segredos das Edge
Functions, sessões da Evolution API) e os comandos:
[docs/BACKUP.md](./docs/BACKUP.md).

## Rollback

Como a VPS serve apenas o frontend, o rollback é local e não afeta dados:

```bash
git log --oneline -n 10          # identifique o commit estável
git checkout <COMMIT_ESTAVEL>    # ou: git revert <COMMIT_RUIM>
docker compose up -d --build     # reconstrói o bundle com o código anterior
docker compose ps                # confirme healthy
curl -f http://localhost:8080/healthz
```

Se a imagem anterior ainda existir localmente
(`docker images funecob/web`), basta apontar a tag antiga em
`docker-compose.yml` e rodar `docker compose up -d`.
Rollback de banco/Edge Functions é feito no Supabase (migrations e
`supabase functions deploy`), nunca pela VPS.


## Desenvolvimento local

```bash
npm install
cp .env.example .env
npm run dev      # http://localhost:8080
npm run build    # build de produção
npm test         # testes (vitest)
```
