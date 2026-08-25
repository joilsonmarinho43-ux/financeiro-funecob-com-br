# Fase 1 — FUNecob executando na VPS (Supabase permanece o backend)

Esta fase coloca **somente o aplicativo web** na VPS. Banco, Auth, Storage,
RLS, Realtime, Edge Functions e cron jobs **continuam no Supabase atual**,
sem qualquer alteração.

```
Internet
   |
   v
Nginx / HTTPS (host da VPS)   financeiro.funecob.com.br
   |
   v
Container funecob-web (nginx unprivileged, 127.0.0.1:8080)
   |
   +---> Supabase atual  (Postgres, Auth, Storage, RLS, Realtime, 14 Edge Functions, pg_cron)
   +---> Evolution API   (na VPS — chamada pelas Edge Functions)
   +---> Mercado Pago    (via gateway-create-payment)
   +---> Gemini          (OCR, via pix-ocr-settlement)
```

## Regra crítica: nada de processamento duplicado

A VPS roda **apenas nginx servindo arquivos estáticos**. Não há:

- Edge Functions na VPS;
- cron/worker de billing na VPS;
- consumidor da `whatsapp_queue` na VPS;
- pipeline de OCR na VPS;
- baixa PIX na VPS.

O `docker-compose.yml` tem um único serviço (`funecob-web`), justamente para
tornar impossível uma segunda execução desses fluxos.

---

## 1. Repositório (fonte oficial)

Presentes na raiz: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`.dockerignore`, `.gitignore`, `.env.example`, `README.md`, `docs/`,
`deploy/nginx/`, `src/`, `supabase/` (migrations + functions, versionadas mas
executadas no Supabase), `extension/`.

Nunca versionar: `.env` real, senhas, API keys, tokens, certificados
(`*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`) — todos já cobertos pelo
`.gitignore`.

> **Ação obrigatória no espelho GitHub:** o arquivo `.env` está atualmente
> rastreado no histórico deste repositório interno. Ao publicar no GitHub,
> execute uma única vez:
> ```bash
> git rm --cached .env
> git commit -m "chore: remove .env do versionamento"
> ```
> O conteúdo dele é apenas a URL do projeto e a chave *publishable/anon*
> (públicas por design, protegidas por RLS) — mas ele não deve ser versionado.

## 2. Frontend

Domínio oficial: **https://financeiro.funecob.com.br**

- `src/lib/portalUrl.ts` já usa `VITE_PORTAL_BASE_URL` com fallback para
  `https://financeiro.funecob.com.br`.
- `src/integrations/supabase/client.ts` lê `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Não há domínio Lovable/Elovolab em nenhuma configuração de produção
  (verificado por varredura no código: `src/`, `supabase/functions/`,
  `extension/`, `nginx.conf`, `Dockerfile`, `docker-compose.yml`).

## 3. Supabase — inalterado

Continuam ativos e intocados nesta fase: PostgreSQL, Auth (GoTrue), Storage
(`logos`, `receipts`), Realtime, 102 policies de RLS, RPCs
(`perform_baixa_manual`, `generate_next_recurrence`, `has_role`, …), as 14
Edge Functions e os 4 cron jobs do `pg_cron`. Nenhuma migration foi criada,
alterada ou executada.

## 4. Edge Functions (permanecem no Supabase)

`baixa-manual`, `billing-cron`, `bip-receiver`, `client-portal`,
`gateway-create-payment`, `pix-ocr-retry`, `pix-ocr-sandbox`,
`pix-ocr-settlement`, `register-pix-webhook`, `send-now`, `whatsapp-manager`,
`whatsapp-sender`, `whatsapp-webhook`, `auto-settlement-assign-client`.

Plano de migração futura: [EDGE-FUNCTIONS.md](./EDGE-FUNCTIONS.md).

## 5. Evolution API

Resolução de credenciais (inalterada, em ordem de prioridade):

1. `whatsapp_instances.api_url` / `api_key` — por organização;
2. `global_settings.api_host` / `global_api_key`;
3. `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` — ambiente das Edge Functions.

Não há IP fixo nem credencial hardcoded no código-fonte (o IP
`161.97.181.130` aparece apenas em migrations históricas — ver
[SECURITY.md](./SECURITY.md)). Preservados: fila, anti-ban, retries,
temperatura, isolamento por organização, confirmação por `messageId`,
mapeamento LID, webhooks, criação de instância, QR Code, conexão, logout e
reset.

`EVOLUTION_WEBHOOK_SECRET` foi adicionada ao `.env.example` como variável
reservada; **ainda não é validada** pelo `whatsapp-webhook`, para não alterar
o comportamento em produção.

## 6. Webhooks — nada foi alterado

Todos continuam apontando para o Supabase, e **devem continuar assim** na
Fase 1 (as funções rodam lá).

| Webhook | URL atual (mantida) | Quando muda |
|---|---|---|
| `whatsapp-webhook` | `{SUPABASE_URL}/functions/v1/whatsapp-webhook` | Somente na Fase 2, se as functions migrarem: `https://financeiro.funecob.com.br/functions/v1/whatsapp-webhook` |
| `pix-ocr-settlement` | `{SUPABASE_URL}/functions/v1/pix-ocr-settlement` | Idem |
| `register-pix-webhook` | `{SUPABASE_URL}/functions/v1/register-pix-webhook` (é quem *registra* as URLs nas instâncias) | Idem |
| `bip-receiver` | `{SUPABASE_URL}/functions/v1/bip-receiver?org=…&provider=…` | Idem |
| Mercado Pago (`notification_url`) | valor de `billing_settings.gateway_webhook_url`, hoje `{SUPABASE_URL}/functions/v1/bip-receiver?org=…&provider=…` | Idem |

## 7. Mercado Pago — `notification_url`

- Gerada em `supabase/functions/gateway-create-payment/index.ts`
  (`opts.notificationUrl` → `body.notification_url`), alimentada por
  `settings.gateway_webhook_url` (tabela de configurações da organização).
- O valor padrão é montado na UI em `src/pages/BillingSettings.tsx` e
  `src/pages/Gateways.tsx` a partir de `VITE_SUPABASE_URL`.
- **Nada foi alterado.** Cobranças antigas seguem válidas apontando para a URL
  atual; nenhum link foi invalidado.
- Quando (e se) o endpoint migrar, basta editar `gateway_webhook_url` por
  organização na tela de Gateways: novas cobranças passam a usar o domínio
  novo e as antigas continuam funcionando enquanto o endpoint antigo estiver
  no ar (período de convivência recomendado: 90 dias).

## 8. Cron — dois jobs às 08:00 (documentado, não alterado)

| jobid | jobname | schedule | alvo |
|---|---|---|---|
| 1 | `billing-reminders-daily` | `0 8 * * *` | `/functions/v1/billing-cron` |
| 2 | `billing-cron-daily` | `0 8 * * *` | `/functions/v1/billing-cron` |
| 3 | `whatsapp-sender-every-2min` | `*/2 * * * *` | `/functions/v1/whatsapp-sender` |
| 4 | `pix-ocr-retry-every-2min` | `*/2 * * * *` | `/functions/v1/pix-ocr-retry` |

**Sim, os jobs 1 e 2 são duplicados**: mesmo horário, mesma função, mesmo
payload. A função `billing-cron` é chamada duas vezes às 08:00 (UTC).

Risco:
- geração de cobrança/lembrete em duplicidade caso alguma etapa não seja
  idempotente;
- duas mensagens de WhatsApp para o mesmo cliente (mitigado hoje pelo índice
  único anti-spam da `whatsapp_queue`, que barra textos idênticos);
- ruído nos logs e consumo dobrado de execuções.

Correção recomendada (**executar manualmente, fora desta fase**):
`SELECT cron.unschedule('billing-reminders-daily');` mantendo apenas
`billing-cron-daily`. Nada foi executado automaticamente.

## 9. Extensão Chrome — URL do `bip-receiver`

| Item | Valor |
|---|---|
| Arquivo de armazenamento | `extension/background.js` (linha ~11, default `apiUrl: ""`) e `extension/popup.js` (leitura/gravação, linhas ~5, 19, 56) |
| Variável | `config.apiUrl` (persistida em `chrome.storage`) |
| Onde o usuário digita | `extension/popup.html`, input `#apiUrl` (placeholder `https://seu-projeto.supabase.co/functions/v1/bip-receiver`) |
| URL atual em produção | `{SUPABASE_URL}/functions/v1/bip-receiver` (configurada por usuário no popup) |
| URL futura (Fase 2) | `https://financeiro.funecob.com.br/functions/v1/bip-receiver` |

A extensão **não foi alterada**. Não há URL hardcoded nela — apenas o
placeholder do input. Referências fixas ao endpoint de produção existem
somente em testes: `extension-tests/tests/real-endpoint.spec.ts` e
`extension-tests/scripts/real-baixa-test.sh`.

## 10. Docker

- `Dockerfile`: build multi-stage; runtime `nginxinc/nginx-unprivileged:1.27-alpine`,
  executando como **UID 101 (não-root)**.
- `docker-compose.yml`: `restart: unless-stopped`, `healthcheck`,
  `no-new-privileges`, `cap_drop: ALL`, logs rotacionados (10 MB × 5).
- Porta publicada **apenas em `127.0.0.1:8080`** — nenhum serviço interno é
  exposto à internet; o acesso público passa obrigatoriamente pelo Nginx do
  host.

## 11. Nginx do host

Template pronto em `deploy/nginx/financeiro.funecob.com.br.conf`
(HTTP ativo + bloco HTTPS comentado, sem certificado real).

```bash
cp deploy/nginx/financeiro.funecob.com.br.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/financeiro.funecob.com.br.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## 12. Comandos finais na VPS

```bash
# 1) Pré-requisitos
curl -fsSL https://get.docker.com | sh
docker compose version
apt-get install -y git nginx

# 2) Código
git clone <URL_DO_REPOSITORIO> FUNECOB
cd FUNECOB
cp .env.example .env
nano .env      # preencher VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
               # VITE_SUPABASE_PROJECT_ID, VITE_PORTAL_BASE_URL, APP_PORT, TZ

# 3) Subir
docker compose config      # valida o compose
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:8080/healthz     # -> ok

# 4) Proxy do host
cp deploy/nginx/financeiro.funecob.com.br.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/financeiro.funecob.com.br.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 5) HTTPS (quando o DNS já apontar para a VPS)
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d financeiro.funecob.com.br

# 6) Atualizações futuras
git pull && docker compose up -d --build
```

> Lembrete: qualquer mudança em `VITE_*` exige `--build` (um `restart` não basta).
