# DEPLOY — FUNecob na VPS

Instalação independente. Nada aqui toca em outros projetos hospedados na mesma VPS
(incluindo o **Nexus 33**): projeto Compose `funecob`, rede `funecob_network`,
volumes `funecob_*` e Caddy próprio.

## 1. Requisitos

- Ubuntu 22.04+ / Debian 12+ com root ou sudo
- 4 vCPU · 8 GB RAM · 60 GB SSD (mínimo recomendado)
- Docker Engine 24+ e plugin `docker compose` v2
- Git, OpenSSL, Python 3

```bash
curl -fsSL https://get.docker.com | sh
apt-get install -y git openssl python3
```

## 2. Portas 80 e 443

O Caddy do FUNecob precisa das portas 80/443. Se outro serviço já as ocupa
(por exemplo o proxy de outro projeto), há duas saídas:

1. **Recomendado** — dedicar 80/443 ao `funecob-caddy` (não altere o proxy do outro projeto:
   apenas pare o que estiver escutando, ou use um IP secundário na VPS).
2. **Alternativa** — mudar `CADDY_HTTP_PORT`/`CADDY_HTTPS_PORT` no `.env` e apontar
   manualmente o proxy existente para essas portas. Neste caso o HTTPS deixa de ser
   emitido pelo Caddy do FUNecob.

## 3. DNS

Aponte três registros A para o IP da VPS:

```
financeiro.funecob.com.br   A   <IP-DA-VPS>
api.funecob.com.br          A   <IP-DA-VPS>
wa.funecob.com.br           A   <IP-DA-VPS>
```

O Let's Encrypt só emite após o DNS propagar. Confirme com `dig +short api.funecob.com.br`.

## 4. Clone e instalação

```bash
git clone https://github.com/joilsonmarinho43-ux/financeiro-funecob-com-br.git funecob
cd funecob
./deploy/install.sh
```

O instalador:

1. verifica Docker, Compose, Git e OpenSSL;
2. cria diretórios (`backups/`, `deploy/db/init`, `deploy/kong`);
3. cria `.env` a partir de `.env.example` **e gera todos os segredos**
   (`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, senhas do Postgres/Mongo,
   chaves do Realtime, `EVOLUTION_API_KEY`, `BIP_API_KEY`) — abre o editor para os domínios;
4. valida as variáveis obrigatórias e `docker compose config`;
5. cria a rede `funecob_network`;
6. constrói a imagem do frontend com as variáveis `VITE_*` corretas;
7. sobe o PostgreSQL e espera o healthcheck;
8. aplica as migrations (`deploy/migrate.sh`, idempotente);
9. sobe Auth, REST, Realtime, Storage, Edge Functions, Kong, MongoDB, Evolution, Web e Caddy;
10. cria os buckets `logos` e `receipts`;
11. roda o healthcheck e imprime o resumo.

**Rodar de novo é seguro**: o `.env` é preservado, volumes não são apagados e
migrations já aplicadas são puladas.

## 5. Primeiro acesso

1. Abra `https://financeiro.funecob.com.br`.
2. Crie a conta na tela de cadastro — o trigger `handle_new_user` cria perfil,
   organização, vínculo `organization_members` e assinatura trial.
3. Promova a conta a administrador global:

```bash
docker compose -p funecob exec funecob-db psql -U postgres -d postgres -c \
  "INSERT INTO public.user_roles(user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'voce@exemplo.com'
   ON CONFLICT DO NOTHING;"
```

## 6. WhatsApp (Evolution API)

1. Em **Configurações Globais** do app, informe:
   - URL: `http://funecob-evolution:8080` (interno) ou `https://wa.funecob.com.br`
   - API Key: valor de `EVOLUTION_API_KEY` do `.env`
2. Crie a instância pelo painel de WhatsApp e leia o QR Code.
3. Webhook das mensagens:
   `https://api.funecob.com.br/functions/v1/whatsapp-webhook`

## 7. Mercado Pago

No `.env`:

```
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
MERCADOPAGO_NOTIFICATION_URL=https://api.funecob.com.br/functions/v1/gateway-create-payment
```

Depois `./deploy/update.sh`. Links de pagamento antigos apontam para o ambiente anterior —
veja a estratégia de reemissão em [MIGRATION.md](MIGRATION.md).

## 8. Cron (pg_cron)

As rotinas rodam dentro do `funecob-db`. Após a instalação, agende:

```sql
SELECT cron.schedule('funecob-billing-cron', '0 11 * * *', $$
  SELECT net.http_post(
    url := 'http://funecob-kong:8000/functions/v1/billing-cron',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
$$);

SELECT cron.schedule('funecob-whatsapp-sender', '*/2 * * * *', $$
  SELECT net.http_post(
    url := 'http://funecob-kong:8000/functions/v1/whatsapp-sender',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
$$);
```

Confira duplicidades com `SELECT jobid, jobname, schedule FROM cron.job;` —
cada rotina deve aparecer **uma única vez**.

## 9. Verificação

```bash
./deploy/healthcheck.sh
./deploy/audit-dependencies.sh
```

## 10. Operação

```bash
docker compose -p funecob ps
docker compose -p funecob logs -f funecob-edge-functions
docker compose -p funecob restart funecob-web
```

Use **sempre** `-p funecob`. Nunca rode `docker compose down` na raiz de outro projeto.
