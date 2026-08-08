# Produção

## Build

O `Dockerfile` faz build multi-stage: `node:20-alpine` roda `npm ci` +
`npm run build`, e o resultado (`dist/`) é servido por `nginx:1.27-alpine` na
porta `8080`.

```bash
docker compose up -d --build
```

As variáveis `VITE_*` são build args — mudou uma, refaça o build.

## Operação

```bash
docker compose ps            # status e health
docker compose logs -f       # logs em tempo real
docker compose restart       # reiniciar
docker compose down          # parar e remover
git pull && docker compose up -d --build   # atualizar
```

- **Restart automático:** `restart: unless-stopped`.
- **Health check:** `GET /healthz` a cada 30s (container e compose).
- **Logs:** stdout/stderr com rotação em `json-file` (10 MB × 5 arquivos).
- **Timezone:** `TZ` (padrão `America/Sao_Paulo`) aplicado no container.

## Portas

| Porta | Serviço | Exposição |
|---|---|---|
| `8080` (`APP_PORT`) | FUNecob web | interna; publique via proxy reverso |
| `443` / `80` | Proxy reverso (Caddy/Nginx) | pública |
| porta da Evolution API | WhatsApp | preferencialmente **não** pública |

Recomendado: `ufw allow 22,80,443/tcp` e manter `8080` e a Evolution acessíveis
apenas na rede interna/localhost.

## HTTPS

Termine TLS no proxy reverso (Caddy emite certificados automaticamente; com
Nginx use certbot). O container web fala HTTP puro atrás do proxy.

## Persistência

O container web é **stateless** — não há volume a preservar. Todo o estado
vive no Supabase (Postgres + Storage) e nas sessões da Evolution API, que têm
volume próprio no compose dela.

## Jobs e cron

Agendados por `pg_cron` no banco, chamando as Edge Functions:

```sql
-- Robô diário de cobrança (08:00 America/Sao_Paulo = 11:00 UTC)
select cron.schedule('billing-cron-daily', '0 11 * * *', $$
  select net.http_post(
    url := '<SUPABASE_URL>/functions/v1/billing-cron',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);

-- Fila de WhatsApp (a cada 2 minutos)
select cron.schedule('whatsapp-sender-2min', '*/2 * * * *', $$
  select net.http_post(
    url := '<SUPABASE_URL>/functions/v1/whatsapp-sender',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);

-- Reprocessamento de OCR (a cada 15 minutos)
select cron.schedule('pix-ocr-retry', '*/15 * * * *', $$
  select net.http_post(
    url := '<SUPABASE_URL>/functions/v1/pix-ocr-retry',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

Conferir e remover:

```sql
select * from cron.job;
select cron.unschedule('billing-cron-daily');
```

Não existe worker Node separado — por isso o compose tem só o serviço web.

## Monitoramento

- `docker compose ps` / `logs -f` para o frontend.
- Logs das Edge Functions no painel do backend.
- Telas internas **Saúde do Sistema** e **Logs do Sistema**.
- Envio de WhatsApp: mensagem só é marcada como "Enviado" quando a Evolution
  devolve um `messageId` real.

## Tratamento de erros

- `ErrorBoundary` global no frontend, com limpeza de service workers obsoletos.
- Retentativas com backoff exponencial na fila de WhatsApp.
- Falha em uma instância de WhatsApp não desconecta as demais da organização.
- Erros das Edge Functions retornam status e corpo do provedor, sem mascarar.
