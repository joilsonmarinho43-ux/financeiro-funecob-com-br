# Auditoria da RPC de baixa automática — 18/11/2026

Fonte: definição integral (456 linhas) extraída pelo operador do PostgreSQL `funecob-db` com `pg_get_functiondef(public.auto_settlement_process_payment(uuid))`. Esta auditoria **não** executou alterações no banco.

## Achados confirmados

1. **Não há prova de liquidação bancária:** a função usa `auto_settlement_events.amount_detected` para quitar faturas sem consultar transação Pix liquidada, identificador bancário E2E ou confirmação do PSP. O OCR de um comprovante não prova crédito bancário.
2. **Competência não vinculada:** o laço seleciona todas as faturas `status='aberto'` do cliente e organização, ordenadas por vencimento, e quita quantas couberem no saldo. Não existe filtro por competência ou invoice explicitamente identificada no evento.
3. **Antecipação automática:** saldo restante pode gerar até 24 faturas futuras com `status='pago'` e `paid_date=CURRENT_DATE`, gerando alocações `was_generated=true`.
4. **Crédito sem prova bancária:** sobra vira `auto_settlement_credits` com `source='sobra_quitacao'`.
5. **Deduplicação parcial:** o evento é bloqueado por `FOR UPDATE`, há verificação de alocações e lock transacional por cliente; porém a detecção entre eventos é apenas por cliente, valor e `paid_date` nos últimos dois dias. Não há unicidade por E2E bancário.
6. **Estado possivelmente inconsistente:** se o evento tem qualquer alocação, a função o marca `conciliado` sem conferir o estado da fatura alocada.
7. **Privilégios:** a RPC é `SECURITY DEFINER`, `search_path='public'`; permissões `EXECUTE` e identidade do owner devem ser auditadas no banco. O corpo não valida um papel de chamador autorizado.

## Condição de liberação

**Não reativar a baixa automática.** O PR também impede que a Edge Function OCR invoque a RPC; o deploy efetivo deve ser validado, pois GitHub não comprova estado da VPS.

Antes de restaurar qualquer execução da RPC, implementar e testar:
- Evidência bancária verificável, persistida e imutável: organização, conta recebedora, E2E/txid, valor, data de liquidação e status liquidado, com unicidade por conta recebedora e E2E; validação servidor-a-servidor.
- Correspondência inequívoca da transação à fatura/competência; divergências para revisão manual.
- Proibição explícita de criação de faturas futuras pagas e de crédito automático com base apenas em OCR.
- Atualização condicional de fatura (`WHERE status='aberto'`) com checagem de `ROW_COUNT`, idempotência transacional e unicidade de alocação por transação.
- Verificação de alocações existentes e reconciliação de status; retries não podem produzir falsa conciliação.
- Restrição de `EXECUTE` a papel de serviço autorizado, com `search_path` seguro, e revisão de todos os chamadores.
- Testes de integração em staging: comprovante falso, comprovante repetido após 48h, dois eventos concorrentes, baixa manual prévia, pagamento de competência passada, adiantamento, saldo excedente, organização errada e falha parcial.

## Riscos de correção emergencial

Não aplicar substituição destrutiva da RPC sem backup, inspeção de privilégios, dependências e fluxo de baixa manual. A correção de aplicação no PR #15 é *fail-closed*; ainda não há migração SQL validada para produção. A causa exata dos incidentes históricos depende dos registros de eventos, alocações, logs, faturas e transações bancárias.
