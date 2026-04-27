DO $$
DECLARE
  v_reminder TEXT;
  v_due TEXT;
  v_overdue TEXT;
BEGIN
  v_reminder := E'Olá, *{nome}*! 🌿\n\nEsperamos que esteja tudo bem com você e sua família.\n\nEste é um lembrete amigável de que sua mensalidade vence em *{vencimento}*.\n\n━━━━━━━━━━━━━━━━━━\n💰 *Valor:* {valor}\n📅 *Vencimento:* {vencimento}\n━━━━━━━━━━━━━━━━━━\n\n{link_ou_chave_pix}\n\n🔗 *Acesse seu portal para ver detalhes e histórico:*\n{link_portal}\n\n_"Confia ao Senhor as tuas obras, e teus pensamentos serão estabelecidos."_\n_(Provérbios 16:3)_\n\nQue a graça do *Senhor* esteja com você hoje! 🙏\n*Sol da Vida Assistencial*';

  v_due := E'Olá, *{nome}*! ⏰\n\nPassando para lembrar que sua mensalidade vence *HOJE* ({vencimento}).\n\n━━━━━━━━━━━━━━━━━━\n💰 *Valor:* {valor}\n📅 *Vence hoje:* {vencimento}\n━━━━━━━━━━━━━━━━━━\n\n{link_ou_chave_pix}\n\n🔗 *Seu portal de acesso:*\n{link_portal}\n\nCaso já tenha efetuado o pagamento, por favor desconsidere esta mensagem. 🙏\n\nEstamos à disposição para qualquer dúvida.\n*Sol da Vida Assistencial*';

  v_overdue := E'Olá, *{nome}*! 📩\n\nIdentificamos que sua mensalidade com vencimento em *{vencimento}* ainda consta em aberto em nosso sistema.\n\n━━━━━━━━━━━━━━━━━━\n💰 *Valor:* {valor}\n📅 *Vencimento:* {vencimento}\n━━━━━━━━━━━━━━━━━━\n\nPara regularizar e manter sua proteção ativa, segue abaixo:\n\n{link_ou_chave_pix}\n\n🔗 *Acesse seu portal:*\n{link_portal}\n\n_"Que o Senhor te guie continuamente e fartará a tua alma em lugares secos."_\n_(Isaías 58:11)_\n\nSe já realizou o pagamento, por favor nos envie o comprovante. Seguimos à disposição! 🙏\n*Sol da Vida Assistencial*';

  UPDATE public.billing_settings bs
  SET
    template_reminder = v_reminder,
    template_due_date = v_due,
    template_overdue = v_overdue,
    updated_at = NOW()
  FROM public.organizations o
  WHERE bs.organization_id = o.id
    AND o.name ILIKE '%sol%vida%';
END $$;