# DEPLOY — FUNecob em VPS compartilhada

Instalação independente. **Nada aqui recria, altera ou remove serviços já existentes na VPS.**

## 0. Infraestrutura existente (NÃO MEXER)

| Recurso | Container | Imagem | Situação |
|---|---|---|---|
| Evolution API (WhatsApp) | `evolution` | `atendai/evolution-api:v1.6.0` | **REUTILIZADA** — nunca recriar |
| MongoDB da Evolution | `mongodb-lab` | `mongo:7` (rede `evolution-lab`) | **INTACTO** — o FUNecob não cria MongoDB |
| Nexus 33 (rede/volumes/Caddy/DB) | `deploy-*`, `nexus33_*` | — | **NÃO UTILIZADO** |

O `docker-compose.yml` do FUNecob **não define** Evolution nem MongoDB. A integração é
feita apenas por variáveis de ambiente (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`).

### Como o FUNecob alcança a Evolution existente

Dentro do Docker, `localhost` é o **próprio container**. Para chegar à Evolution
publicada na porta `8080` do host, o compose adiciona `host.docker.internal:host-gateway`
ao container de Edge Functions. No `.env`:

```
EVOLUTION_API_URL=http://host.docker.internal:8080
EVOLUTION_API_KEY=<a chave da Evolution JÁ EXISTENTE>
```

Alternativas válidas (não altere a rede da Evolution sem necessidade):

- IP do bridge do host: `http://172.17.0.1:8080`
- Domínio público já existente: `https://wa.seudominio.com.br`

> A `EVOLUTION_API_KEY` **não** é gerada pelo `genkeys.sh`: use a chave atual em produção.

Precedência em runtime: `whatsapp_instances.api_url` → `global_settings.api_host` → `EVOLUTION_API_URL`.
Se houver URLs antigas gravadas no banco, elas ganham do `.env` — confira após migrar:

```sql
SELECT id, instance_name, api_url FROM public.whatsapp_instances;
SELECT api_host FROM public.global_settings;
```

## 1. Requisitos

Ubuntu 22.04+/Debian 12+, Docker Engine 24+, plugin `docker compose` v2, Git, OpenSSL, Python 3.

## 2. Portas

O FUNecob publica **somente em `127.0.0.1`**:

| Porta host | Serviço |
|---|---|
| `127.0.0.1:54320` | Frontend (`funecob-web`) |
| `127.0.0.1:54321` | API / Kong (`funecob-kong`) |
| `127.0.0.1:54322` | PostgreSQL do FUNecob (nunca público) |

Nada é publicado em `80`, `443`, `8080`, `8000`, `5432` ou `6543`.
O `install.sh` verifica cada porta e **aborta** (sem parar nada) em caso de conflito.

## 3. Reverse proxy / HTTPS

### Opção A (recomendada) — usar o proxy que já existe na VPS

Mantenha `USE_OWN_PROXY=false`. O `funecob-caddy` fica desligado (profile `proxy`).
Adicione ao proxy existente:

**Caddy**
```
financeiro.funecob.com.br {
    reverse_proxy 127.0.0.1:54320
}
api.funecob.com.br {
    request_body { max_size 50MB }
    reverse_proxy 127.0.0.1:54321
}
```

**Nginx**
```nginx
server {
    server_name financeiro.funecob.com.br;
    location / { proxy_pass http://127.0.0.1:54320; proxy_set_header Host $host; }
}
server {
    server_name api.funecob.com.br;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:54321;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```
(HTTPS via `certbot --nginx -d financeiro.funecob.com.br -d api.funecob.com.br`.)

**Traefik** — publique os labels apontando para `http://127.0.0.1:54320` e `:54321`
no seu arquivo dinâmico; não altere a rede do FUNecob.

### Opção B — proxy dedicado do FUNecob

Só se `80/443` estiverem livres. No `.env`: `USE_OWN_PROXY=true` (ou mude
`CADDY_HTTP_PORT`/`CADDY_HTTPS_PORT`/`CADDY_BIND_IP`). O `deploy/Caddyfile` já serve
`APP_DOMAIN` e `API_DOMAIN` — a Evolution existente **não** é servida por ele.

## 4. DNS

```
financeiro.funecob.com.br   A   <IP-DA-VPS>
api.funecob.com.br          A   <IP-DA-VPS>
```

## 5. Instalação

```bash
git clone https://github.com/joilsonmarinho43-ux/financeiro-funecob-com-br.git funecob
cd funecob
cp .env.example .env
nano .env          # domínios, ACME_EMAIL, EVOLUTION_API_URL/KEY, Mercado Pago, Gemini
./deploy/install.sh
```

O instalador (15 etapas): Docker → diretórios → `.env` (+ segredos) → validação de
variáveis → **verificação de portas** → **detecção da Evolution existente** → rede
`funecob_network` → volumes `funecob_*` → build do frontend → PostgreSQL → migrations →
serviços → buckets → healthcheck → relatório final.

Rodar de novo é seguro: `.env` preservado, volumes intactos, migrations idempotentes.
O script **nunca** executa `prune`, `rm -f`, `volume rm` ou `network rm`.

## 6. Primeiro acesso

1. Abra `https://financeiro.funecob.com.br` e crie a conta (o trigger `handle_new_user`
   cria perfil, organização, vínculo e assinatura trial).
2. Promova a admin:

```bash
docker compose -p funecob exec funecob-db psql -U postgres -d postgres -c \
  "INSERT INTO public.user_roles(user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'voce@exemplo.com'
   ON CONFLICT DO NOTHING;"
```

## 7. WhatsApp

No painel **Configurações Globais**, informe a URL e a API Key da **Evolution existente**
(a mesma do `.env`). As instâncias já pareadas continuam funcionando — não recrie nada.

Webhook: `https://api.funecob.com.br/functions/v1/whatsapp-webhook`

## 8. Mercado Pago

```
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
MERCADOPAGO_NOTIFICATION_URL=https://api.funecob.com.br/functions/v1/gateway-create-payment
```
Depois `./deploy/update.sh`. Links antigos apontam para o ambiente anterior — veja [MIGRATION.md](MIGRATION.md).

## 9. Cron (pg_cron, dentro do `funecob-db`)

```sql
SELECT cron.schedule('funecob-billing-cron', '0 11 * * *', $$
  SELECT net.http_post(
    url := 'http://funecob-kong:8000/functions/v1/billing-cron',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb);
$$);

SELECT cron.schedule('funecob-whatsapp-sender', '*/2 * * * *', $$
  SELECT net.http_post(
    url := 'http://funecob-kong:8000/functions/v1/whatsapp-sender',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb);
$$);
```
Cada rotina deve aparecer **uma única vez** em `SELECT jobid, jobname, schedule FROM cron.job;`.

## 10. Operação

```bash
docker compose -p funecob ps
docker compose -p funecob logs -f funecob-edge-functions
./deploy/healthcheck.sh
./deploy/audit-dependencies.sh
./deploy/update.sh        # atualiza SOMENTE o FUNecob
./deploy/backup.sh
```

Use **sempre** `-p funecob`. Nunca rode `docker compose down` fora desta pasta.
