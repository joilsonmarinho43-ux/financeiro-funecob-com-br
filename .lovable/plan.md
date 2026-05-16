# Auditoria Técnica Enterprise — Plano em Fases

Uma auditoria completa nas 7 áreas listadas é grande demais para uma única execução sem risco de quebrar funcionalidades. Proponho executar em **fases priorizadas**, cada uma com diagnóstico → correção → validação, sem tocar em fluxos que já funcionam.

## Fase 1 — Integridade Financeira (PRIORIDADE MÁXIMA)
Onde o risco de perda de dinheiro é maior.

1. Rodar `audit_recurrence_integrity()` em todas as orgs ativas → relatório de:
   - mensalidades desalinhadas (dia errado)
   - duplicadas na mesma competência
   - gaps (meses faltando)
   - datas inválidas
2. Conferir baixas duplicadas (mesma invoice paga 2x), pagamentos órfãos, valores zerados
3. Validar `perform_baixa_manual` + `generate_next_recurrence` + `auto_settlement_process_payment` quanto a race conditions e arredondamento
4. Correções via `repair_client_due_dates(dry_run=false)` somente após review

## Fase 2 — PIX / Liquidação Automática
1. Auditar eventos em `auto_settlement_events` com status `erro` — classificar causas
2. Validar idempotência de txid (índice único)
3. Conferir lógica de sobra → crédito → consumo de crédito
4. Garantir que pagamento parcial NÃO marca fatura como paga (já está OK no RPC, validar)

## Fase 3 — WhatsApp / Filas
1. Mensagens travadas em `queued`/`retry` há > 24h
2. Instâncias `disconnected` sem reconexão
3. Mensagens duplicadas (mesmo phone + message + janela < 5min)
4. Validar `whatsapp_send_config` (limites anti-ban)

## Fase 4 — Banco de Dados / Performance
1. Rodar `supabase--linter`
2. Identificar tabelas sem índice em colunas filtradas (`organization_id`, `client_id`, `due_date`, `status`)
3. Adicionar índices compostos faltantes (migration)
4. Revisar RLS para garantir isolamento e performance

## Fase 5 — Segurança
1. `security--run_security_scan`
2. Revisar políticas RLS overly-permissive
3. Edge functions: verificar inputs validados, secrets mascarados
4. Logs de auditoria → confirmar cobertura

## Fase 6 — Observabilidade
1. Criar view `system_health_metrics` (eventos/hora, taxa de erro, fila, baixas/dia)
2. Página admin `/system-health` com refresh em tempo real
3. Alertas em `system_logs` quando métricas críticas saem do baseline

## Restrições (não-negociáveis)
- Nenhuma alteração em `perform_baixa_manual`, `generate_next_recurrence`, `auto_settlement_process_payment` sem dry-run primeiro
- Toda correção de dados precisa de log em `system_logs`
- Migrations adicionam, nunca removem colunas/tabelas existentes
- Funcionalidades atuais permanecem intactas

## Próximo passo
Confirme se devo:
- **A)** Executar Fase 1 agora (diagnóstico financeiro completo + correções) e parar para revisão
- **B)** Executar todas as fases em sequência sem pausas (mais demorado, mais risco)
- **C)** Pular para uma fase específica que te preocupa mais
