# Migração futura das Edge Functions (Fase 2+) — apenas planejamento

Na **Fase 1 nada disso é executado**. As 14 Edge Functions e os 4 cron jobs
continuam rodando no Supabase. Este documento existe para que a Fase 2 seja
feita sem improviso.

## Inventário

| Função | Gatilho | Efeito colateral | Risco de duplicar |
|---|---|---|---|
| `whatsapp-webhook` | Webhook Evolution | grava mensagens, dispara OCR | **Alto** |
| `pix-ocr-settlement` | Interno/webhook | baixa PIX automática | **Crítico** |
| `pix-ocr-retry` | cron 2 min | reprocessa OCR | **Crítico** |
| `billing-cron` | cron 08:00 | gera cobranças/lembretes | **Crítico** |
| `whatsapp-sender` | cron 2 min | consome `whatsapp_queue` | **Alto** |
| `baixa-manual` | UI | baixa + confirmação | Médio |
| `bip-receiver` | Extensão / gateway | baixa por código de barras | **Alto** |
| `gateway-create-payment` | UI/portal | cria cobrança Mercado Pago | Médio |
| `send-now` | UI | envio imediato | Médio |
| `whatsapp-manager` | UI | instâncias, QR, logout, reset | Baixo |
| `register-pix-webhook` | Manual | registra webhooks na Evolution | Baixo |
| `client-portal` | Portal | leitura por token | Baixo |
| `auto-settlement-assign-client` | UI | vincula cliente ao evento | Baixo |
| `pix-ocr-sandbox` | Testes | nenhum | Nenhum |

## Regra de ouro do cutover

Para cada função, o fluxo é **desligar no Supabase → ligar na VPS**, nunca as
duas ao mesmo tempo. Ordem sugerida:

1. Funções sem efeito colateral (`client-portal`, `pix-ocr-sandbox`,
   `whatsapp-manager`).
2. Funções acionadas por UI (`send-now`, `baixa-manual`,
   `gateway-create-payment`, `auto-settlement-assign-client`).
3. Webhooks (`whatsapp-webhook`, `bip-receiver`) — exigem reapontar as URLs
   na Evolution, no Mercado Pago e na extensão Chrome.
4. Cron (`billing-cron`, `whatsapp-sender`, `pix-ocr-retry`) — só depois de
   `cron.unschedule()` dos jobs equivalentes no Supabase.

## Pré-requisitos técnicos

- Runtime Deno em container (`denoland/deno:alpine`), uma rota por função sob
  `/functions/v1/<nome>`, atrás do mesmo Nginx.
- Segredos via `.env` do compose (nunca no bundle do frontend):
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL`,
  `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `PORTAL_BASE_URL`,
  `GEMINI_API_KEY`, `LOVABLE_API_KEY` (opcional).
- Substituto de `pg_cron` → `ofelia`/`cron` do host chamando as rotas HTTP,
  com **lock distribuído** (advisory lock no Postgres) para impedir execução
  concorrente.
- Verificar `verify_jwt` das funções públicas (`pix-ocr-settlement`,
  `whatsapp-webhook`) — na VPS a autenticação passa a ser responsabilidade do
  Nginx + segredo compartilhado.

## Rollback

Manter os endpoints do Supabase ativos (porém sem cron) por pelo menos 30
dias. Reverter = reapontar as URLs de webhook de volta e reativar os jobs.
