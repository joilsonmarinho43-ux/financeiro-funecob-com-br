/**
 * URL base das Edge Functions.
 *
 * Derivada de VITE_SUPABASE_URL para que o FUNecob funcione tanto no ambiente
 * gerenciado quanto na instalação própria da VPS (api.funecob.com.br).
 * Nunca monte URLs com "<projeto>.supabase.co" no código.
 */
const BASE = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");

export function functionUrl(name: string): string {
  return `${BASE}/functions/v1/${name}`;
}
