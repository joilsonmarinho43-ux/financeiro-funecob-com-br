/**
 * Biblioteca de tons predefinidos para templates de cobrança WhatsApp.
 * Cada template (reminder/due_date/overdue/critical) tem 3 versões: amigável, profissional, firme.
 * O usuário escolhe um tom no painel e o texto é substituído (mantendo as variáveis {nome}, {valor}, etc.).
 */

export type TemplateKind = "reminder" | "due_date" | "overdue" | "critical";
export type ToneKind = "amigavel" | "profissional" | "firme";

export const TONE_LABELS: Record<ToneKind, { label: string; emoji: string; desc: string }> = {
  amigavel: { label: "Amigável", emoji: "😊", desc: "Caloroso, próximo, com emojis" },
  profissional: { label: "Profissional", emoji: "💼", desc: "Formal, direto, neutro" },
  firme: { label: "Firme", emoji: "⚠️", desc: "Sério, assertivo, urgente" },
};

const SEPARATOR = "━━━━━━━━━━━━━━━━━━";

export const TONE_PRESETS: Record<TemplateKind, Record<ToneKind, string>> = {
  reminder: {
    amigavel: `Olá, *{nome}*! 🌿

Esperamos que esteja tudo bem com você e sua família.

Este é um lembrete amigável de que sua mensalidade vence em *{vencimento}*.

${SEPARATOR}
💰 *Valor:* {valor}
📅 *Vencimento:* {vencimento}
${SEPARATOR}

{link_ou_chave_pix}

🔗 *Acesse seu portal:* {link_portal}

Que tenha um excelente dia! 🙏`,

    profissional: `Prezado(a) *{nome}*,

Informamos que sua fatura no valor de *{valor}* possui vencimento em *{vencimento}*.

${SEPARATOR}
💰 Valor: {valor}
📅 Vencimento: {vencimento}
${SEPARATOR}

{link_ou_chave_pix}

🔗 Portal do cliente: {link_portal}

Atenciosamente.`,

    firme: `*{nome}*, atenção!

Sua fatura de *{valor}* vence em *{vencimento}*. Evite atrasos e encargos adicionais.

${SEPARATOR}
💰 *Valor:* {valor}
📅 *Vencimento:* {vencimento}
${SEPARATOR}

Pague agora:
{link_ou_chave_pix}

🔗 Portal: {link_portal}`,
  },

  due_date: {
    amigavel: `Olá, *{nome}*! ⏰

Passando para lembrar com carinho que sua mensalidade vence *HOJE* ({vencimento}).

${SEPARATOR}
💰 *Valor:* {valor}
📅 *Vence hoje:* {vencimento}
${SEPARATOR}

{link_ou_chave_pix}

🔗 *Seu portal:* {link_portal}

Caso já tenha pago, desconsidere essa mensagem. 🙏`,

    profissional: `Prezado(a) *{nome}*,

Sua fatura de *{valor}* vence *HOJE* ({vencimento}).

${SEPARATOR}
💰 Valor: {valor}
📅 Vencimento: {vencimento}
${SEPARATOR}

{link_ou_chave_pix}

🔗 Portal: {link_portal}

Caso o pagamento já tenha sido efetuado, favor desconsiderar.`,

    firme: `*{nome}*, sua fatura vence HOJE!

*Valor:* {valor} — *Vencimento:* {vencimento}

${SEPARATOR}
Para evitar suspensão dos serviços, pague agora:

{link_ou_chave_pix}

🔗 Portal: {link_portal}`,
  },

  overdue: {
    amigavel: `Olá, *{nome}*! 📩

Identificamos que sua mensalidade com vencimento em *{vencimento}* ainda consta em aberto em nosso sistema.

${SEPARATOR}
💰 *Valor:* {valor}
📅 *Vencimento:* {vencimento}
${SEPARATOR}

Para regularizar, segue abaixo:

{link_ou_chave_pix}

🔗 *Acesse seu portal:* {link_portal}

Se já realizou o pagamento, por favor envie o comprovante. Seguimos à disposição! 🙏`,

    profissional: `Prezado(a) *{nome}*,

Consta em nosso sistema fatura em aberto referente ao vencimento de *{vencimento}*.

${SEPARATOR}
💰 Valor: {valor}
📅 Vencimento: {vencimento}
${SEPARATOR}

Solicitamos a regularização:

{link_ou_chave_pix}

🔗 Portal: {link_portal}

Caso o pagamento já tenha sido efetuado, favor desconsiderar.`,

    firme: `*{nome}*, sua fatura está EM ATRASO.

*Vencimento:* {vencimento} — *Valor:* {valor}

${SEPARATOR}
Regularize imediatamente para evitar restrições:

{link_ou_chave_pix}

🔗 Portal: {link_portal}

Em caso de pagamento já efetuado, envie o comprovante.`,
  },

  critical: {
    amigavel: `Olá, *{nome}*! 🙏

Notamos que sua fatura de *{valor}*, com vencimento em *{vencimento}*, ainda não foi regularizada e já está atrasada há vários dias.

${SEPARATOR}
💰 *Valor:* {valor}
📅 *Vencimento original:* {vencimento}
${SEPARATOR}

Sabemos que imprevistos acontecem. Vamos resolver juntos?

{link_ou_chave_pix}

🔗 *Portal:* {link_portal}

Estamos à disposição para conversar sobre opções. 💛`,

    profissional: `Prezado(a) *{nome}*,

Sua fatura referente ao vencimento de *{vencimento}* permanece em aberto há vários dias, no valor de *{valor}*.

${SEPARATOR}
💰 Valor: {valor}
📅 Vencimento original: {vencimento}
${SEPARATOR}

Solicitamos a regularização imediata para evitar a suspensão dos serviços e demais providências cabíveis:

{link_ou_chave_pix}

🔗 Portal: {link_portal}

Em caso de pagamento já efetuado, favor encaminhar o comprovante.`,

    firme: `*{nome}*, ÚLTIMO AVISO! ⚠️

Sua fatura de *{valor}* (venc. *{vencimento}*) está vencida há vários dias.

${SEPARATOR}
💰 *Valor:* {valor}
📅 *Vencimento:* {vencimento}
${SEPARATOR}

A não regularização poderá resultar em:
• Suspensão dos serviços
• Inclusão em órgãos de proteção ao crédito
• Cobrança judicial

Pague agora:
{link_ou_chave_pix}

🔗 Portal: {link_portal}`,
  },
};

/**
 * Detecta o tom mais provável de um texto comparando com os presets.
 * Útil para mostrar o tom atual quando o usuário abre a página.
 */
export function detectTone(text: string, kind: TemplateKind): ToneKind | null {
  if (!text) return null;
  const presets = TONE_PRESETS[kind];
  for (const tone of ["amigavel", "profissional", "firme"] as ToneKind[]) {
    if (presets[tone].trim() === text.trim()) return tone;
  }
  return null;
}
