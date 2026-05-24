ALTER TABLE public.billing_settings
ADD COLUMN IF NOT EXISTS template_welcome text NOT NULL DEFAULT 'Olá {nome}! 👋

Seja muito bem-vindo(a)! Seu cadastro foi realizado com sucesso. 🎉

A partir de agora você receberá por aqui os avisos das suas mensalidades e comprovantes de pagamento.

Qualquer dúvida, estamos à disposição! 😊',
ADD COLUMN IF NOT EXISTS welcome_enabled boolean NOT NULL DEFAULT true;