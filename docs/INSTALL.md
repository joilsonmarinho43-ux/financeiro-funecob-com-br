# Instalação na VPS

## 1. Pré-requisitos

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
docker compose version

# Git
apt-get install -y git
```

Você também precisa de:

- um projeto **Supabase** (hospedado ou self-hosted) com as migrations aplicadas;
- uma **Evolution API v1.6.0** rodando (na mesma VPS ou em outra máquina);
- um domínio apontado para a VPS (recomendado) e certificado HTTPS.

## 2. Clone e configuração

```bash
git clone <URL_DO_REPOSITORIO> FUNECOB
cd FUNECOB
cp .env.example .env
nano .env
```

Preencha no mínimo:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
VITE_PORTAL_BASE_URL=
APP_PORT=8080
TZ=America/Sao_Paulo
```

## 3. Banco de dados

Com a CLI do Supabase, aplique as migrations versionadas:

```bash
npm i -g supabase
supabase login
supabase link --project-ref <SEU_PROJECT_REF>
supabase db push
```

Isso recria tabelas, índices, funções, triggers, policies e grants.
Confira os buckets de Storage `logos` (público) e `receipts` (privado).

## 4. Edge Functions

As funções em `supabase/functions/` rodam no runtime Deno do Supabase:

```bash
supabase functions deploy --project-ref <SEU_PROJECT_REF>

supabase secrets set \
  EVOLUTION_API_URL="http://IP_DA_EVOLUTION:8080" \
  EVOLUTION_API_KEY="SUA_GLOBAL_API_KEY" \
  PORTAL_BASE_URL="https://financeiro.seudominio.com.br" \
  --project-ref <SEU_PROJECT_REF>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são
injetadas automaticamente pelo runtime.

> As funções `pix-ocr-settlement` e `whatsapp-webhook` são públicas
> (`verify_jwt = false` em `supabase/config.toml`) porque recebem webhooks.

## 5. Subir a aplicação

```bash
docker compose up -d --build
docker compose ps
curl -f http://localhost:8080/healthz
```

## 6. Proxy reverso com HTTPS

Exemplo com Caddy (`/etc/caddy/Caddyfile`):

```
financeiro.seudominio.com.br {
    reverse_proxy 127.0.0.1:8080
}
```

Ou Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name financeiro.seudominio.com.br;
    ssl_certificate     /etc/letsencrypt/live/SEU_DOMINIO/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/SEU_DOMINIO/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 7. Evolution API e webhooks

Na tela **Configurações Globais** do FUNecob (ou via `EVOLUTION_API_URL` /
`EVOLUTION_API_KEY`), informe host e chave. Depois, em **WhatsApp → Conectar**,
gere o QR Code e pareie a instância.

Configure o webhook da Evolution para:

```
{SUPABASE_URL}/functions/v1/whatsapp-webhook
```

com os eventos `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.

## 8. Atualizações

```bash
git pull
docker compose up -d --build
supabase db push                 # se houver novas migrations
supabase functions deploy        # se houver mudanças nas Edge Functions
```
