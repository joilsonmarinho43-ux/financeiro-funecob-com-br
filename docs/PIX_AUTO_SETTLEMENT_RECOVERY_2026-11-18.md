# Recuperação segura da baixa automática Pix — 18/11/2026

## Status
**Baixa automática bloqueada na branch deste PR.** Não implantar sem testes de homologação. Não reativar `auto_settlement_enabled` sem validação financeira independente.

## Falhas identificadas no código
1. `pix-ocr-settlement/index.ts` chamava `auto_settlement_process_payment` após identificação por telefone/nome e compatibilidade de valor. Um comprovante de WhatsApp não prova crédito bancário.
2. Eventos recebidos via OCR não verificavam `whatsapp_message_id` antes do insert; reentregas poderiam criar novos eventos.
3. `whatsapp-webhook/index.ts` enviava texto PIX ou imagem sem base64 ao endpoint que exige `image_base64`, gerando HTTP 400 e eventos de erro.
4. A escolha exata de competência e proteção transacional dependem da RPC SQL, cuja definição não foi encontrada no código consultado.

## Mitigações nesta branch
- Eventos OCR sem comprovação bancária são `pendente_revisao`; a RPC de liquidação não é chamada.
- Reentrega do mesmo ID retorna evento anterior (melhor esforço; não é trava transacional).
- Mensagens apenas de texto e mídia indisponível são registradas para revisão sem OCR.

## Pendências bloqueadoras antes de permitir baixa automática
- Obter definição da RPC `auto_settlement_process_payment` no banco efetivamente utilizado e auditar: bloqueio de parcela paga, competência, organização, transação, concorrência e rollback.
- Criar índice único parcial por `(organization_id, whatsapp_message_id)` para mensagens não nulas, **após** examinar/remediar duplicidades existentes. A checagem em aplicação sozinha não evita corrida.
- Validar recebimento por integração bancária confiável (consulta Pix/PSP), não por OCR. Vincular `end_to_end_id` único e crédito à conta beneficiária; comparar valor e beneficiário.
- Fixar IDs das faturas e competências antes da transação; impedir quitação de parcelas futuras sem seleção explícita.
- Testar cenários: comprovante antigo, fraudado, duplicado, outro cliente, duas mensagens simultâneas, dois pagamentos de mesmo valor, CPF divergente, LID, envio de confirmação com falha e retry.
- Verificar outros caminhos de baixa (cron, webhook bancário, `baixa-manual`, funções de retry) e se todos respeitam controles.
- Testar em homologação e realizar deploy supervisionado; manter flag desligada até aprovação.

## Importante
Este PR não comprova que os incidentes passados foram causados por qualquer uma das falhas acima. É necessária auditoria dos eventos e transações reais. Não alterar dados financeiros históricos sem conciliação.
