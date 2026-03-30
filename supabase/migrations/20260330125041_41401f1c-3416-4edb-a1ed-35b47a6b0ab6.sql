
-- Add new template columns to billing_settings for baixa, retorno, remarcar
ALTER TABLE public.billing_settings 
  ADD COLUMN IF NOT EXISTS template_baixa text NOT NULL DEFAULT 'Pagamento confirmado! ✅

Cliente: {nome}
Valor: R$ {valor}
Data: {data_pagamento}

Obrigado pela pontualidade! 🙏',
  ADD COLUMN IF NOT EXISTS template_retorno text NOT NULL DEFAULT 'Olá {nome}! 👋

Nosso cobrador esteve no endereço cadastrado e não encontrou ninguém.
Por favor, entre em contato para agendar uma nova visita.

{link_ou_chave_pix}',
  ADD COLUMN IF NOT EXISTS template_remarcar text NOT NULL DEFAULT 'Olá {nome}! 📅

Sua fatura no valor de R$ {valor} foi remarcada.
Nova data de vencimento: {nova_data}

Qualquer dúvida, estamos à disposição!';
