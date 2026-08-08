# Webhooks

Todas as URLs abaixo são derivadas de `SUPABASE_URL` — não há domínio de
desenvolvimento fixo em nenhuma delas. Substitua `{SUPABASE_URL}` pela URL do
seu projeto.

---

## 1. `whatsapp-webhook` — eventos da Evolution API

| Campo | Valor |
|---|---|
| URL | `POST {SUPABASE_URL}/functions/v1/whatsapp-webhook` |
| Origem | Evolution API (sua VPS) |
| Autenticação | Pública (`verify_jwt = false`); validação por instância/organização no corpo |
| Eventos | `MESSAGES_UPSERT`, `CONNECTION_UPDATE` |

Payload (resumo):

```json
{
  "event": "messages.upsert",
  "instance": "NomeDaInstancia",
  "data": {
    "key": { "remoteJid": "5599...@s.whatsapp.net", "id": "BAE5..." },
    "pushName": "Nome do contato",
    "message": { "conversation": "texto" }
  }
}
```

Processamento: identifica a instância e a organização, registra a mensagem em
`whatsapp_messages`, atualiza `status` em `whatsapp_instances` em eventos de
conexão e, para imagens/documentos, encaminha o comprovante ao pipeline
`pix-ocr-settlement`. Resposta: `200 {"ok":true}` (sempre 200, para a Evolution
não reenfileirar).

Configuração na Evolution:

```bash
curl -X POST "$EVOLUTION_API_URL/webhook/set/NomeDaInstancia" \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{"url":"'"$SUPABASE_URL"'/functions/v1/whatsapp-webhook",
       "enabled":true,
       "events":["MESSAGES_UPSERT","CONNECTION_UPDATE"]}'
```

Ou execute a função `register-pix-webhook`, que aplica isso a todas as
instâncias cadastradas.

---

## 2. `bip-receiver` — extensão Chrome / sistemas externos

| Campo | Valor |
|---|---|
| URL | `POST {SUPABASE_URL}/functions/v1/bip-receiver` |
| Origem | Extensão Chrome (`extension/`) e integrações externas |
| Autenticação | Chave de organização da tabela `org_api_keys` |

```json
{ "api_key": "...", "barcode": "0001202608...", "action": "baixa" }
```

Processamento idempotente (bips duplicados são ignorados): localiza o cliente
pelo código de barras conforme `barcode_configs`, executa a baixa e dispara a
confirmação por WhatsApp. A URL é exibida na tela **Configurações → API de
Integração** e é montada a partir de `VITE_SUPABASE_URL`.

---

## 3. `pix-ocr-settlement` — comprovantes PIX

| Campo | Valor |
|---|---|
| URL | `POST {SUPABASE_URL}/functions/v1/pix-ocr-settlement` |
| Origem | Chamada interna a partir do `whatsapp-webhook` |
| Autenticação | Pública (`verify_jwt = false`) |

Regras de negócio preservadas: só processa se o telefone remetente estiver
cadastrado; ignora comprovantes enviados pelo dono da instância; casos
ambíguos vão para revisão manual em `auto_settlement_events`.

---

## 4. Gateway de pagamento (Mercado Pago)

| Campo | Valor |
|---|---|
| URL de retorno | `notification_url` enviada por `gateway-create-payment` |
| Origem | Mercado Pago |
| Correlação | `external_reference` = id da fatura |

Configure a URL pública do seu domínio no painel do gateway apontando para a
função correspondente do seu projeto.

---

## Checklist ao migrar de domínio/VPS

- [ ] Atualizar o webhook de cada instância na Evolution API.
- [ ] Atualizar `PORTAL_BASE_URL` e `VITE_PORTAL_BASE_URL`.
- [ ] Atualizar a `notification_url` no gateway de pagamento.
- [ ] Regerar/redistribuir as chaves em `org_api_keys`, se necessário.
- [ ] Reconfigurar a extensão Chrome com o novo endpoint do `bip-receiver`.
