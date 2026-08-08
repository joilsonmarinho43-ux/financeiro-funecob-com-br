/**
 * Base URL do portal do cliente.
 * Configurável por ambiente (VITE_PORTAL_BASE_URL) — nunca window.location.origin,
 * para que os links enviados por WhatsApp usem sempre o domínio oficial.
 */
const ENV_BASE = (import.meta.env.VITE_PORTAL_BASE_URL || "").trim();

export const PORTAL_BASE_URL = /^https?:\/\//i.test(ENV_BASE)
  ? ENV_BASE.replace(/\/+$/, "")
  : "https://financeiro.funecob.com.br";

export function buildPortalLink(token: string): string {
  return `${PORTAL_BASE_URL}/portal/${token}`;
}
