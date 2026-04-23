// Helper compartilhado: gera link clicável do Portal do Cliente.
// Usa PORTAL_BASE_URL se for URL válida (http/https), senão fallback FuneCob.
// Sempre retorna URL absoluta (https://...) para o WhatsApp reconhecer como link clicável.

export function getPortalBaseUrl(): string {
  const env = Deno.env.get("PORTAL_BASE_URL") || "";
  if (/^https?:\/\//i.test(env)) return env.replace(/\/+$/, "");
  return "https://financeiro.funecob.com.br";
}

export async function getOrCreatePortalLink(
  supabase: any,
  clientId: string,
  organizationId: string
): Promise<string> {
  try {
    const base = getPortalBaseUrl();
    const { data: existing } = await supabase
      .from("client_portal_tokens")
      .select("token")
      .eq("client_id", clientId)
      .maybeSingle();
    if (existing?.token) return `${base}/portal/${existing.token}`;

    const { data: created } = await supabase
      .from("client_portal_tokens")
      .insert({ client_id: clientId, organization_id: organizationId })
      .select("token")
      .single();
    if (created?.token) return `${base}/portal/${created.token}`;
  } catch (e) {
    console.error("[portalLink] error:", e);
  }
  return "";
}
