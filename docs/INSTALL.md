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

## Bootstrap do PostgreSQL (causa-raiz e solução)

**Sintoma:** em uma VPS que já possuía o volume `funecob_db_data`, a instalação
falhava na primeira migration com `ERROR: schema "auth" does not exist`.

**Causa-raiz:** os scripts de `/docker-entrypoint-initdb.d` só são executados
quando o volume é criado. Com o volume preexistente, o `00-funecob-init.sh`
nunca rodava e o banco ficava apenas com `public` e `extensions`.

**Solução (idempotente, não destrutiva):**

* `deploy/db/bootstrap.sql` — fonte única da infraestrutura interna: schemas
  `auth`, `storage`, `_realtime`, roles de serviço (com senhas alinhadas ao
  `.env`), owners/grants, extensões, `search_path` (`public, extensions`),
  publicação `supabase_realtime`, funções `auth.uid/role/jwt/email` e a tabela
  de controle `public.schema_migrations`. Termina validando a si mesmo.
* `deploy/db/init/00-funecob-init.sh` — apenas invoca esse SQL na criação do volume.
* `deploy/bootstrap-db.sh` — aplica **e valida** o mesmo SQL em todo
  `install.sh`/`update.sh`/`migrate.sh`, inclusive em volumes já existentes.
  `--verify` valida sem alterar nada. Nenhum `DROP`, `volume rm` ou `down -v`.
* `deploy/migrate.sh` — antes das migrations, garante o bootstrap e sobe
  `funecob-auth`/`funecob-storage`, aguardando `auth.users` e `storage.objects`
  (criadas pelas migrations internas desses serviços, das quais as migrations
  do FUNecob dependem via FK/policies). Uma migration que falha **não** é
  marcada como aplicada e o processo sai com código 3.

**Ordem do `install.sh`:** 1 Docker · 2 diretórios · 3 `.env` · 4 compose/Kong ·
5 portas · 6 Evolution existente (somente detecção) · 7 rede · 8 volumes ·
9 build · 10 PostgreSQL · 11 bootstrap · 12 validação do banco · 13 Auth/Storage
+ migrations · 14 demais serviços · 15 healthcheck e relatório.

**Rede:** quem cria e gerencia `funecob_network` é exclusivamente o Compose. O
instalador apenas diagnostica e, quando a rede é uma órfã do próprio FUNecob
(sem labels e sem containers de terceiros), a remove para o Compose recriá-la
com `com.docker.compose.project=funecob`. Rede de outro projeto ⇒ aborta sem
alterar nada. Evolution API, MongoDB, Caddy e Nexus 33 nunca são tocados.

## Correções críticas para VPS (auditoria)

1. **GRANTs do schema `public`** — no Supabase Cloud a plataforma aplica
   `ALTER DEFAULT PRIVILEGES` internos que não aparecem nas migrations
   exportadas. No self-hosted isso se perde e o PostgREST responde
   `permission denied for table ...` mesmo com RLS correta (o GRANT é
   checado ANTES da RLS). `deploy/db/grants.sql` roda automaticamente ao
   final de `./deploy/migrate.sh` e é idempotente.
2. **`PGRST_DB_SCHEMAS`** — `graphql_public` foi removido do padrão
   (`public,storage`), pois `pg_graphql` não é instalado nesta stack e o
   PostgREST falha ao subir referenciando um schema inexistente.
3. **Migrations em transação única** — `psql -1` em `migrate.sh`: uma falha
   não deixa mais estado parcial, então a reexecução é realmente segura.
   A migration do bucket `logos` virou idempotente (`ON CONFLICT` +
   `DROP POLICY IF EXISTS`).
4. **`EVOLUTION_WEBHOOK_SECRET` obrigatório** — sem ele o `whatsapp-webhook`
   recusa eventos com HTTP 503 (evita comprovantes PIX forjados). Gere com
   `openssl rand -hex 32`. Somente para migração: `WEBHOOK_ALLOW_INSECURE=true`.
5. **Edge Functions autenticadas** — `send-now`, `gateway-create-payment`,
   `auto-settlement-assign-client` e `pix-ocr-sandbox` agora exigem JWT
   válido e vínculo com a organização (`_shared/requireOrgAuth.ts`).
6. **Healthcheck do Edge Runtime** e CORS do Kong com `credentials: false`
   (obrigatório quando `origins: "*"`).
