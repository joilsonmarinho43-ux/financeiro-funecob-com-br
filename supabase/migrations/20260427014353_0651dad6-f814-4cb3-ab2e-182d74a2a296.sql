ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS template_critical TEXT NOT NULL DEFAULT 'Olá *{nome}*! ⚠️

Sua fatura no valor de *{valor}* está em atraso há vários dias (vencimento original: *{vencimento}*).

━━━━━━━━━━━━━━━━━━
💰 *Valor:* {valor}
📅 *Vencimento:* {vencimento}
━━━━━━━━━━━━━━━━━━

Para evitar restrições e encargos adicionais, regularize hoje mesmo:

{link_ou_chave_pix}

🔗 *Acesse seu portal:* {link_portal}

Caso já tenha pago, por favor envie o comprovante. Estamos à disposição.',
  ADD COLUMN IF NOT EXISTS reminder_days_critical INTEGER NOT NULL DEFAULT 7;