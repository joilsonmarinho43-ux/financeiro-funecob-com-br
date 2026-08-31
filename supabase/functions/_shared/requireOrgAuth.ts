// Helper compartilhado de autenticação para Edge Functions.
// A rota /functions/v1/* do Kong não exige apikey e VERIFY_JWT=false,
// então CADA função sensível precisa validar o JWT e o vínculo com a organização.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type OrgAuthResult =
  | { ok: true; userId: string; isAdmin: boolean }
  | { ok: false; response: Response };

function jsonError(message: string, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Exige um JWT válido e (quando organizationId é informado) que o usuário
 * seja admin global ou membro daquela organização.
 */
export async function requireOrgAuth(
  req: Request,
  organizationId: string | null | undefined,
  corsHeaders: Record<string, string>,
  opts: { adminOnly?: boolean } = {},
): Promise<OrgAuthResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: jsonError("Unauthorized", 401, corsHeaders) };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return { ok: false, response: jsonError("Unauthorized", 401, corsHeaders) };
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });

  if (opts.adminOnly && !isAdmin) {
    return { ok: false, response: jsonError("Forbidden", 403, corsHeaders) };
  }

  if (!isAdmin && organizationId) {
    const { data: membership } = await admin
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!membership) {
      return { ok: false, response: jsonError("Forbidden", 403, corsHeaders) };
    }
  }

  return { ok: true, userId: user.id, isAdmin: !!isAdmin };
}
