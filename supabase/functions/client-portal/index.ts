import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find valid token
    const { data: portalToken, error: tokenErr } = await supabase
      .from("client_portal_tokens")
      .select("*, clients(*), organizations(name, logo_url, primary_color)")
      .eq("token", token)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (tokenErr) throw tokenErr;
    if (!portalToken) {
      return new Response(
        JSON.stringify({ error: "Link inválido ou expirado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get invoices for this client
    const { data: invoices, error: invErr } = await supabase
      .from("invoices")
      .select("id, amount, due_date, paid_date, status, description, created_at")
      .eq("client_id", portalToken.client_id)
      .eq("organization_id", portalToken.organization_id)
      .order("due_date", { ascending: false });

    if (invErr) throw invErr;

    // Get billing settings for pix key
    const { data: billingSettings } = await supabase
      .from("billing_settings")
      .select("pix_key, pix_key_type, billing_mode, gateway_provider")
      .eq("organization_id", portalToken.organization_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        client: portalToken.clients,
        organization: portalToken.organizations,
        invoices: invoices || [],
        billing: billingSettings || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Client portal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
