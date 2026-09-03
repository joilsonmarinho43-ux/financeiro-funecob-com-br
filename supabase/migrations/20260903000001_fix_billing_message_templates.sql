-- Corrige os templates padrão de cobrança para sempre usar os dados reais da fatura.
-- Os valores são preenchidos por supabase/functions/billing-cron/index.ts.

UPDATE public.billing_settings
SET
  template_reminder = E'Olá, *{nome}*! 🌿\n\nEsperamos que esteja tudo bem com você e sua família.\n\nEste é um lembrete amigável de que sua mensalidade vence em *{vencimento}*.\n\n━━━━━━━━━━━━━━━━━━\n💰 *Valor:* {valor}\n📅 *Vencimento:* {vencimento}\n━━━━━━━━━━━━━━━━━━\n\n{link_ou_chave_pix}\n\n🔗 *Acesse seu portal:* {link_portal}\n\nQue tenha um excelente dia! 🙏',
  template_due_date = E'Olá, *{nome}*! 🌿\n\nSua mensalidade vence *hoje*, *{vencimento}*.\n\n━━━━━━━━━━━━━━━━━━\n💰 *Valor:* {valor}\n📅 *Vencimento:* {vencimento}\n━━━━━━━━━━━━━━━━━━\n\n{link_ou_chave_pix}\n\n🔗 *Acesse seu portal:* {link_portal}\n\nObrigado! 🙏',
  template_overdue = E'*{nome}*, sua fatura está *EM ATRASO*.\n\n*Vencimento:* {vencimento} — *Valor:* {valor}\n\n━━━━━━━━━━━━━━━━━━\nRegularize imediatamente para evitar restrições:\n\n{link_ou_chave_pix}\n\n🔗 *Acesse seu portal:* {link_portal}\n\nEm caso de pagamento já efetuado, envie o comprovante.',
  template_critical = E'*{nome}*, sua fatura continua *EM ATRASO*.\n\n*Vencimento:* {vencimento} — *Valor:* {valor}\n\n━━━━━━━━━━━━━━━━━━\nRegularize sua mensalidade para evitar restrições no atendimento.\n\n{link_ou_chave_pix}\n\n🔗 *Acesse seu portal:* {link_portal}\n\nSe o pagamento já foi realizado, envie o comprovante.';

-- Garante que nenhuma configuração fique sem template após a correção.
UPDATE public.billing_settings
SET template_critical = template_overdue
WHERE template_critical IS NULL OR btrim(template_critical) = '';
