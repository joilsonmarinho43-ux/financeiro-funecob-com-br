# TROUBLESHOOTING — FUNecob

Todos os comandos usam `-p funecob`. Nunca execute comandos Docker na raiz de outro projeto.

```bash
docker compose -p funecob ps
docker compose -p funecob logs -f <serviço>
./deploy/healthcheck.sh
```

## Instalação

**`docker compose config` falha**
Variável obrigatória vazia no `.env`. O erro cita o nome. Preencha e rode de novo
`./deploy/install.sh` (é idempotente).

**`Bind for 0.0.0.0:443 failed: port is already allocated`**
Outro proxy da VPS ocupa 80/443. Mantenha `USE_OWN_PROXY=false` (padrão) e aponte o proxy
existente para `127.0.0.1:54320` (frontend) e `127.0.0.1:54321` (API) — veja DEPLOY.md §3.
**Não altere o proxy do outro projeto.**

**`install.sh` aborta em "Conflito de portas"**
Alguma das portas `WEB_HTTP_PORT`/`KONG_HTTP_PORT`/`POSTGRES_PORT` já está em uso.
Troque os valores no `.env` e rode novamente. O script nunca para o serviço concorrente.

**WhatsApp não envia / "connection refused" nas Edge Functions**
`EVOLUTION_API_URL` provavelmente está como `http://localhost:8080` — dentro do container isso
é o próprio container. Use `http://host.docker.internal:8080` (ou `http://172.17.0.1:8080`).
Lembre-se: a URL gravada em `whatsapp_instances.api_url` / `global_settings.api_host` tem
precedência sobre o `.env`.

**Não crie uma segunda Evolution API**
Os containers `evolution` e `mongodb-lab` são da infraestrutura existente. O compose do
FUNecob não os define — confirme com `./deploy/audit-dependencies.sh`.

**`network funecob_network not found`**
`docker network create funecob_network` — ou rode `./deploy/install.sh`, que já cria.

## Banco de dados

**`funecob-db` reinicia em loop**
`docker compose -p funecob logs funecob-db`. Causa comum: `POSTGRES_PASSWORD` alterado
depois da primeira inicialização. A senha só é aplicada na criação do volume.
Para trocar: `ALTER ROLE ... WITH PASSWORD` em todas as roles de serviço e atualize o `.env`.

**Migration falhou no meio**
O `migrate.sh` para na primeira falha e não marca a versão como aplicada.
Corrija o SQL, e rode `./deploy/migrate.sh` novamente.

**`permission denied for table X`**
Falta `GRANT`. Toda tabela em `public` precisa de:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.X TO authenticated;
GRANT ALL ON public.X TO service_role;
```

## Autenticação

**Login retorna 401 com senha correta**
`JWT_SECRET` divergente entre `funecob-auth`, `funecob-rest`, `funecob-realtime` e
`funecob-storage`. Todos leem a **mesma** variável — confira e reinicie a stack.

**"Invalid API key"**
`ANON_KEY` do frontend foi gerada com outro `JWT_SECRET`. Regenere com
`./deploy/genkeys.sh "$JWT_SECRET"`, atualize `.env` e **reconstrua** o frontend
(`docker compose -p funecob build funecob-web && docker compose -p funecob up -d funecob-web`).

**Usuário loga e é deslogado sozinho**
Relógio do aparelho desajustado (o app já avisa em tela) ou várias abas abertas.
Ative data/hora automática no dispositivo.

## Frontend

**Página em branco após deploy**
As variáveis `VITE_*` são embutidas em tempo de build. Depois de mudar qualquer uma delas:
```bash
docker compose -p funecob build --no-cache funecob-web
docker compose -p funecob up -d funecob-web
```

**Bundle ainda aponta para o Supabase antigo**
```bash
./deploy/audit-dependencies.sh
```
Se `supabase.co` aparecer em `dist/`, o build usou o `.env` errado — corrija
`SUPABASE_PUBLIC_URL` e reconstrua sem cache.

## HTTPS / Caddy

**Certificado não é emitido**
1. DNS já propagou? `dig +short api.funecob.com.br`
2. Portas 80/443 chegam à VPS? (firewall/UFW/Cloud)
3. `docker compose -p funecob logs -f funecob-caddy`
4. `ACME_EMAIL` preenchido no `.env`?

O Let's Encrypt limita 5 falhas/hora por domínio — espere antes de repetir.

## Edge Functions

**404 em `/functions/v1/<nome>`**
A pasta precisa existir em `supabase/functions/<nome>/index.ts`. Após `git pull`:
`docker compose -p funecob restart funecob-edge-functions`.

**Função não enxerga um segredo**
Segredos vêm do `.env` via `docker-compose.yml`. Adicionou uma variável nova?
Inclua-a no bloco `environment` de `funecob-edge-functions` e reinicie o serviço.

## WhatsApp / Evolution

**QR Code não aparece**
A Evolution é a **já existente** na VPS: `docker logs -f evolution` (fora do compose do
FUNecob). Verifique `EVOLUTION_API_KEY` no app e a acessibilidade de `EVOLUTION_API_URL`
(`./deploy/healthcheck.sh` testa isso de dentro e de fora do container).


**Instância desconecta sozinha**
Nomes de instância colidindo entre organizações ou bloqueio do WhatsApp por volume.
Use nomes únicos por organização e respeite os limites de envio configurados.

**Cliente vê "aguardando esta mensagem"**
Dessincronização de chaves do Baileys. Despareie e pareie a instância novamente e
peça ao cliente que envie qualquer mensagem para restabelecer as chaves.

## PIX / OCR

**Comprovante não dá baixa automática**
Comportamento esperado e obrigatório: se o número remetente **não estiver cadastrado**,
o evento é ignorado — nada é criado nem alterado. Verifique também:
- `GEMINI_API_KEY` presente (`LOVABLE_API_KEY` é apenas fallback opcional);
- sem nenhuma chave de OCR, tudo vai para revisão manual, por segurança;
- comprovante enviado pelo próprio dono da instância é sempre ignorado.

Consulte a fila em **Baixa Automática → Pendentes de revisão**.

## Mercado Pago

**Pagamento aprovado sem baixa**
Confirme `MERCADOPAGO_NOTIFICATION_URL` acessível publicamente e o
`external_reference` gravado na fatura. Logs:
`docker compose -p funecob logs -f funecob-edge-functions | grep gateway`.

## Recuperação total

```bash
docker compose -p funecob down          # NÃO use -v (apagaria os volumes)
docker compose -p funecob up -d
./deploy/healthcheck.sh
```

Se os dados estiverem corrompidos: `./deploy/restore.sh backups/<último-backup-bom>`.
