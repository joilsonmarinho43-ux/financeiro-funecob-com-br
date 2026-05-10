import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  token: z.string().min(32).max(128).regex(/^[a-f0-9]+$/i, "token inválido"),
  action: z.enum(["generate_invoice"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida").optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Requisição inválida", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { token, action, due_date } = parsed.data;

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

    // === Action: Generate Invoice ===
    if (action === "generate_invoice") {
      if (!due_date) {
        return new Response(
          JSON.stringify({ error: "Data de vencimento é obrigatória" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get client's plan + ALL invoices to determine the original due_day
      // RULE: never use paid_date as base for recurrence — always honour the original due_day.
      const { data: allInvoices } = await supabase
        .from("invoices")
        .select("plan_id, amount, due_date, created_at")
        .eq("client_id", portalToken.client_id)
        .eq("organization_id", portalToken.organization_id)
        .order("created_at", { ascending: false });

      const latestInvoice = allInvoices?.[0];
      const planId = latestInvoice?.plan_id || null;
      const amount = latestInvoice?.amount || 0;

      if (!amount || amount <= 0) {
        return new Response(
          JSON.stringify({ error: "Não foi possível determinar o valor da mensalidade" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine original due_day = most frequent day across history (fallback: oldest)
      let originalDueDay = parseInt(due_date.split("-")[2], 10);
      if (allInvoices && allInvoices.length > 0) {
        const counts: Record<number, number> = {};
        for (const inv of allInvoices) {
          const day = parseInt((inv.due_date as string).split("-")[2], 10);
          counts[day] = (counts[day] || 0) + 1;
        }
        originalDueDay = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
      }

      // Force due_date to original day (clamped to month length — handles Feb / 30 / 31 / leap years)
      const [y, m] = due_date.split("-").map(Number);
      const lastDayOfMonth = new Date(y, m, 0).getDate();
      const safeDay = Math.min(originalDueDay, lastDayOfMonth);
      const normalizedDueDate = `${y}-${String(m).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;

      // Idempotency check
      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("client_id", portalToken.client_id)
        .eq("organization_id", portalToken.organization_id)
        .eq("due_date", normalizedDueDate)
        .eq("status", "aberto")
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "Já existe uma fatura aberta para este período" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get plan name
      let planName = "Mensalidade";
      if (planId) {
        const { data: plan } = await supabase.from("plans").select("name").eq("id", planId).single();
        if (plan) planName = plan.name;
      }

      const dueDateObj = new Date(normalizedDueDate + "T12:00:00Z");
      const desc = `${planName} — ${dueDateObj.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;

      const { data: newInvoice, error: insertErr } = await supabase.from("invoices").insert({
        client_id: portalToken.client_id,
        organization_id: portalToken.organization_id,
        plan_id: planId,
        amount,
        due_date: normalizedDueDate,
        status: "aberto",
        description: desc,
      }).select("id").single();

      if (insertErr) throw insertErr;

      // Log
      await supabase.from("system_logs").insert({
        action: "generate_invoice_portal",
        user_id: "00000000-0000-0000-0000-000000000000",
        organization_id: portalToken.organization_id,
        details: { client_id: portalToken.client_id, invoice_id: newInvoice.id, amount, due_date },
      });

      return new Response(
        JSON.stringify({ success: true, invoice_id: newInvoice.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === Default action: Get portal data ===
    const { data: invoices, error: invErr } = await supabase
      .from("invoices")
      .select("id, amount, due_date, paid_date, status, description, created_at")
      .eq("client_id", portalToken.client_id)
      .eq("organization_id", portalToken.organization_id)
      .order("due_date", { ascending: false });

    if (invErr) throw invErr;

    const { data: billingSettings } = await supabase
      .from("billing_settings")
      .select("pix_key, pix_key_type, pix_holder_name, billing_mode, gateway_provider")
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