# Arquitetura

```text
                    ┌──────────────────────────────┐
  Navegador ───────▶│  funecob-web (Docker/nginx)  │  SPA React + Vite
                    │  porta 8080 · /healthz       │  build estático
                    └──────────────┬───────────────┘
                                   │ HTTPS (supabase-js)
                    ┌──────────────▼───────────────┐
                    │        SUPABASE              │
                    │  Postgres + RLS              │
                    │  Auth (auth.users)           │
                    │  Storage (logos, receipts)   │
                    │  Edge Functions (Deno)       │
                    │  pg_cron (jobs)              │
                    └──────┬───────────────┬───────┘
                           │               │ webhooks
                           ▼               ▼
                  ┌────────────────┐  ┌──────────────────┐
                  │ Evolution API  │  │ Gateway pagamento│
                  │ (sua VPS)      │  │ (Mercado Pago)   │
                  └────────────────┘  └──────────────────┘
```

## Componentes

### Frontend (`src/`)
SPA React 18 + Vite + Tailwind + shadcn/ui, roteada por React Router.
Estado remoto com TanStack Query. Comunicação exclusivamente pelo
`@supabase/supabase-js` (`src/integrations/supabase/client.ts`) e por
`supabase.functions.invoke()`. Não existe servidor Node próprio: o build é
estático e servido por nginx com fallback de SPA.

### Backend
Não há backend monolítico. A lógica de servidor está em 14 Edge Functions
(Deno) em `supabase/functions/`:

| Função | Papel | `verify_jwt` |
|---|---|---|
| `whatsapp-sender` | Consome `whatsapp_queue` com limites anti-ban | true |
| `whatsapp-manager` | Instâncias, QR Code, status, reset/logout | true |
| `whatsapp-webhook` | Recebe eventos da Evolution API | **false** |
| `send-now` | Envio imediato de mensagem | true |
| `baixa-manual` | Baixa de fatura + confirmação por WhatsApp | true |
| `bip-receiver` | Recebe bips de código de barras (extensão Chrome) | true (chave de org) |
| `pix-ocr-settlement` | Pipeline de comprovantes PIX + baixa automática | **false** |
| `pix-ocr-retry` | Reprocessa OCR falho | true |
| `pix-ocr-sandbox` | Testes do pipeline de OCR | true |
| `auto-settlement-assign-client` | Vincula comprovante a cliente | true |
| `billing-cron` | Lembretes/faturamento diário | true |
| `client-portal` | Portal do cliente por token | true |
| `gateway-create-payment` | Link de pagamento (Mercado Pago) | true |
| `register-pix-webhook` | Registra webhooks nas instâncias | true |

Código compartilhado em `supabase/functions/_shared/`:
`evolutionSend.ts` (envio com compat v1.6.0/v2), `paymentReceipt.ts` (recibo PDF + envio),
`portalLink.ts`, `pix/*` (score, duplicidade, pagadores confiáveis,
estatísticas de OCR).

### Banco, auth e storage
Ver [DATABASE.md](./DATABASE.md). Multi-tenancy por `organization_id` com RLS;
papéis em `user_roles` + função `has_role` (security definer). Storage usa os
buckets `logos` (público) e `receipts` (privado, comprovantes).

### Jobs
`pg_cron` dispara as Edge Functions agendadas — ver
[PRODUCTION.md](./PRODUCTION.md#jobs-e-cron). Não há worker Node separado, e
por isso o `docker-compose.yml` contém apenas o serviço web.

### Integrações externas
- **Evolution API** (WhatsApp) — preservada integralmente.
- **Mercado Pago** — links de pagamento (`gateway-create-payment`).
- **Gemini / gateway de IA** — OCR de comprovantes, opcional.
- **Extensão Chrome** (`extension/`) — envia bips para `bip-receiver`.

## Dependências do ambiente de desenvolvimento (removidas/neutralizadas)

| Item | Situação |
|---|---|
| `lovable-tagger` (vite.config) | Ativo somente em `mode === "development"`; não entra no build de produção. |
| Metatags de preview no `index.html` | Removidas. |
| URL do projeto no `README` | Substituída pela documentação de produção. |
| Endpoint fixo em `src/pages/Settings.tsx` | Agora derivado de `VITE_SUPABASE_URL`. |
| Domínio fixo em `src/lib/portalUrl.ts` | Agora `VITE_PORTAL_BASE_URL` (com fallback). |
| IP fixo da Evolution nas Edge Functions | Agora `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`. |
| OCR via gateway de IA | Opcional: sem chave, o comprovante vai para revisão manual. |
