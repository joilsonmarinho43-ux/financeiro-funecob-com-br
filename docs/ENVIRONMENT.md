# Variáveis de ambiente

Todas as variáveis moram no `.env` da raiz (não versionado). O modelo
completo está em `.env.example`.

## Como cada camada lê as variáveis

| Camada | Fonte | Momento |
|---|---|---|
| Frontend (SPA) | `VITE_*` do `.env`, passadas como build args no Docker | **build** (inlineadas no bundle) |
| Edge Functions | `supabase secrets set` | runtime |
| Docker | `.env` lido pelo `docker compose` | build e runtime |

> Alterar qualquer `VITE_*` exige `docker compose up -d --build`.

---

## APP

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `NODE_ENV` | não | `production` | Modo de build do Vite. |
| `APP_PORT` | não | `8080` | Porta publicada no host pelo container web. |
| `TZ` | não | `America/Sao_Paulo` | Timezone dos containers; afeta logs e datas locais. |

## Frontend (públicas)

Estas chegam ao navegador. São públicas por design; a segurança dos dados vem
do RLS no banco.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | sim | URL do projeto Supabase. Usada pelo client e para montar `/functions/v1/...` (ex.: endpoint do `bip-receiver` na tela de Configurações). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | sim | Chave anon/publishable. |
| `VITE_SUPABASE_PROJECT_ID` | sim | Referência do projeto. |
| `VITE_PORTAL_BASE_URL` | recomendada | Domínio do Portal do Cliente usado por `src/lib/portalUrl.ts`. Sem ela, usa o domínio padrão do FUNecob. |

## Servidor / Edge Functions (segredos)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto para o código de servidor (injetada automaticamente no runtime). |
| `SUPABASE_ANON_KEY` | sim | Chave anon para chamadas com contexto de usuário. |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Acesso administrativo ao banco pelas Edge Functions. Jamais expor no frontend. |
| `SUPABASE_DB_URL` | não | Conexão direta ao Postgres para migrations, backup e `pg_cron`. |
| `PORTAL_BASE_URL` | recomendada | Base dos links do portal montados pelas funções (`_shared/portalLink.ts`). |
| `GEMINI_API_KEY` | não | OCR de comprovantes PIX. |
| `LOVABLE_API_KEY` | não | Provedor de OCR alternativo. Ausente, o OCR por IA é pulado e o comprovante vai para revisão manual — nada quebra. |

## Evolution API

| Variável | Obrigatória | Descrição |
|---|---|---|
| `EVOLUTION_API_URL` | recomendada | Base da Evolution API, sem barra final. Ex.: `http://10.0.0.5:8080`. |
| `EVOLUTION_API_KEY` | recomendada | Global API Key da Evolution. |

**Ordem de resolução** (implementada em `_shared/evolutionConfig.ts`):

1. `whatsapp_instances.api_url` / `api_key` — por organização;
2. `global_settings.api_host` / `global_api_key` — tela Configurações Globais;
3. `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` — ambiente.

Isso mantém o comportamento multi-tenant existente e, ao mesmo tempo, garante
que nenhuma instalação dependa de endereço fixo no código.

Funções que consomem esses valores: `whatsapp-sender`, `whatsapp-manager`,
`whatsapp-webhook`, `send-now`, `baixa-manual`, `bip-receiver`,
`register-pix-webhook` e `_shared/paymentReceipt.ts`.

## Checklist de segurança

- `.env` está no `.gitignore`; somente `.env.example` (placeholders) é versionado.
- `SUPABASE_SERVICE_ROLE_KEY` nunca aparece em código de frontend.
- Chaves da Evolution são mascaradas nos logs (`ab***yz`).
- Telefones são truncados nos logs.
- Segredos das Edge Functions ficam em `supabase secrets`, não em arquivos.
