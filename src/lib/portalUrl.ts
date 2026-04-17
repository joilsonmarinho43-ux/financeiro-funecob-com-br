/**
 * Base URL fixa do portal do cliente para o domínio FuneCob.
 * SEMPRE usar este valor — nunca window.location.origin (evita links com lovable.app).
 */
export const PORTAL_BASE_URL = "https://financeiro.funecob.com.br";

export function buildPortalLink(token: string): string {
  return `${PORTAL_BASE_URL}/portal/${token}`;
}
