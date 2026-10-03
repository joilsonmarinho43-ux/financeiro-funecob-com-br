export const SOL_DA_VIDA_LOGO = "https://financeiro.funecob.com.br/branding/sol-da-vida.png";

export function isSolDaVida(name?: string | null): boolean {
  const normalized = (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  return ["sol da vida", "sol da vida assistencial", "funeraria sol da vida"].includes(normalized);
}

export function organizationLogo(org?: { name?: string | null; logo_url?: string | null } | null): string | null {
  return org?.logo_url || (isSolDaVida(org?.name) ? SOL_DA_VIDA_LOGO : null);
}

