## Objetivo
Elevar a taxa de conciliação automática de comprovantes PIX para >90%, com baixo índice de falsos positivos, sem quebrar o fluxo atual.

## Arquitetura proposta

Refatorar `pix-ocr-settlement` em módulos reutilizáveis dentro de `supabase/functions/_shared/pix/`, mantendo a Edge Function como orquestrador fino. Assim, o fluxo antigo (Evolution → webhook → pix-ocr-settlement → auto_settlement_process_payment) continua idêntico do ponto de vista externo.

```text
_shared/pix/
├── ocr.ts              (multi-provedor + retry + pré-processamento)
├── identify.ts         (cascata de identificação de cliente)
├── score.ts            (motor de pontuação 0-100)
├── duplicate.ts        (detecção multi-critério)
├── trustedPayers.ts    (histórico de pagadores → cliente)
└── logger.ts           (logs estruturados)
```

## Mudanças por item

### 1. Identificação em cascata (`identify.ts`)
Cascata determinística retornando candidatos com score:
1. Telefone E.164 (match exato) → 100
2. LID mapeado (`whatsapp_lid_map`) → 100
3. CPF/CNPJ do comprovante vs `clients.document` → 98
4. Nome exato (normalizado) → 92
5. Similaridade tokenizada (regra atual) → 60-90
6. `trusted_payers` (histórico já vinculado) → 88

Auto-link se top único ≥95. Caso contrário, retorna lista ordenada gravada em `auto_settlement_events.candidates` (novo campo jsonb).

### 2. PIX de terceiros (`trustedPayers.ts`)
Nova tabela `pix_trusted_payers(organization_id, client_id, payer_name_normalized, payer_document, payment_count, last_amount, last_paid_at)`. Populada automaticamente a cada conciliação bem-sucedida. Confiança aprovada quando: pagador já pagou ≥2x para o cliente + valor bate + só 1 fatura aberta compatível.

### 3. OCR resiliente (`ocr.ts`)
Provider chain: Lovable AI Gateway → Gemini Direct (2.0-flash) → Gemini (1.5-flash) → OCR.space (novo fallback opcional se `OCR_SPACE_API_KEY` existir).
- Retry com backoff exponencial (500ms, 1s, 2s, 4s).
- Pré-processamento de imagem: se primeira leitura falhar campos críticos, reenviar com prompt reforçado + para imagens, aplicar rotate/contrast via Canvas API do Deno (biblioteca `imagescript`).
- Métricas por provedor gravadas em `ocr_provider_stats`.

### 4. Créditos automáticos
Coluna `ocr_provider_stats(provider, success_count, fail_count, last_402_at, disabled_until)`. Ao receber 402/429, marca `disabled_until = now() + 10min` e emite log `ocr_credit_exhausted`. Próxima chamada pula esse provedor. Alerta exibido no dashboard.

### 5. Webhook resiliente
`whatsapp-webhook` já enfileira em `auto_settlement_events` antes de chamar OCR. Adicionar:
- Fila `ocr_retry_queue` com `attempts`, `next_attempt_at`.
- Cron a cada 2min chamando `pix-ocr-retry` para reprocessar `status='erro'` com attempts<5.
- Backoff: 1min, 5min, 15min, 60min, 4h.

### 6. Duplicidade multi-critério (`duplicate.ts`)
Substituir o check "mesmo valor em 48h" atual. Considerar duplicado somente se:
- MESMO `txid` OR
- (mesmo valor + mesmo pagador + mesma data + diferença de horário <10min) OR
- MESMO `end_to_end_id` do PIX

Caso contrário, prosseguir com pagamento.

### 7. Motor de score (`score.ts`)
Pontos exatamente conforme especificação. Grava `score`, `score_breakdown` (jsonb), `decision` em `auto_settlement_events`.
- ≥95: auto-aprovação
- 80-94: auto-aprovação + log destaque
- 60-79: `pendente_revisao` com sugestão
- <60: `pendente_revisao` sem sugestão forte

### 8. Logs estruturados
Padronizar `auto_settlement_logs.details` com `{stage, ocr_provider, elapsed_ms, score, rule_matched, failure_reason}`.

### 9. Dashboard
Nova página `/admin/pix-analytics`:
- Cards: taxa de automação (7/30d), taxa manual, tempo médio, score médio.
- Gráficos: causas de falha (pizza), performance por provedor OCR (barras), evolução diária.
- Alertas ativos: provedor desabilitado, fila de retry crescente.

## Migrações de banco
```sql
ALTER TABLE auto_settlement_events
  ADD COLUMN candidates jsonb DEFAULT '[]',
  ADD COLUMN score int,
  ADD COLUMN score_breakdown jsonb,
  ADD COLUMN decision text,
  ADD COLUMN ocr_provider text,
  ADD COLUMN ocr_elapsed_ms int,
  ADD COLUMN retry_attempts int DEFAULT 0,
  ADD COLUMN next_retry_at timestamptz;

CREATE TABLE pix_trusted_payers (...);
CREATE TABLE ocr_provider_stats (...);
```
Ambas com GRANTs e RLS por organization_id.

## Compatibilidade
- Fluxo atual (`auto_settlement_process_payment`, LID learning, deliverPaymentConfirmation, MissedSettlements) permanece intacto.
- Novas colunas são opcionais; código antigo continua funcionando se vier null.
- Novos módulos são aditivos.

## Entregáveis
1. Migração (colunas novas + 2 tabelas).
2. 6 arquivos novos em `_shared/pix/`.
3. `pix-ocr-settlement` refatorado usando os módulos.
4. Nova edge function `pix-ocr-retry` + cron pg_cron 2min.
5. Nova página `src/pages/PixAnalytics.tsx` + rota `/admin/pix-analytics` + item no sidebar.
6. Atualização do `MissedSettlements` para mostrar `score`, `candidates` e `decision`.

## Fora de escopo
- Rewrite do Evolution/WhatsApp webhook (já estabilizado).
- Mudança na UX de baixa manual.
- Novos provedores OCR pagos além do fallback opcional OCR.space.

## Confirmação
Posso prosseguir com a implementação completa? Se quiser cortar algo (ex.: pular OCR.space, pular a nova página de analytics, ou fase apenas o motor de score primeiro), me diga antes de começar.