export const COMPACT_REMINDER_TEMPLATE = "Olá, {nome}! 🌿\n\n💰 Mensalidade: *{valor}*\n📅 Vencimento: *{vencimento}*\n\n{link_ou_chave_pix}\n\n{link_portal}";

export function compactPixBlock(key: string, holderName?: string | null): string {
  const holder = holderName?.trim();
  return `💳 *Pix:*\n\`\`\`\n${key}\n\`\`\`${holder ? `\n👤 Titular: ${holder}` : ""}\n\nApós pagar, envie o comprovante por aqui.`;
}
