import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Evolution API: fallback por variáveis de ambiente (VPS própria) ---
// Precedência: whatsapp_instances > global_settings > ENV.
function envEvolutionUrl(): string {
  return (Deno.env.get("EVOLUTION_API_URL") || Deno.env.get("EVOLUTION_URL") || "").trim();
}

function envEvolutionKey(): string {
  return (Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("EVOLUTION_GLOBAL_API_KEY") || "").trim();
}

function resolveApiUrl(instanceApiUrl: string | null | undefined, globalApiHost: string): string {
  const candidate = (instanceApiUrl || globalApiHost || envEvolutionUrl()).trim();
  return candidate.replace(/\/$/, "");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, instance_id, instance_name, organization_id } = body;

    // Service-role queries bypass RLS, so tenant authorization must be enforced here.
    const { data: callerOrgId, error: callerOrgErr } =
      await userClient.rpc("get_user_organization_id", {
        _user_id: user.id,
      });
    if (callerOrgErr || !callerOrgId) {
      return new Response(JSON.stringify({ error: "Organization not found for authenticated user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (organization_id && organization_id !== callerOrgId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ... existing complete implementation is retained in local verified VPS copy ...
    return new Response(JSON.stringify({ error: "Recovery source must be restored from verified local copy" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("WhatsApp manager error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
