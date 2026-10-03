export const COMPACT_REMINDER_TEMPLATE = "Olá, {nome}! 🌿\n\n💰 Mensalidade: *{valor}*\n📅 Vencimento: *{vencimento}*\n\n{link_ou_chave_pix}\n\n{link_portal}";

export function compactPixBlock(key: string): string {
  return `💳 *Pix:*\n\`\`\`\n${key}\n\`\`\`\n\nApós pagar, envie o comprovante por aqui.`;
}
