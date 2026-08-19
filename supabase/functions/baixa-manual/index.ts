import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreatePortalLink } from "../_shared/portalLink.ts";
import { removePaymentConfirmationLinks } from "../_shared/paymentReceipt.ts";
import { sendEvolutionText } from "../_shared/evolutionSend.ts";

// --- Evolution API: fallback por variáveis de ambiente (VPS própria) ---
// Precedência: whatsapp_instances > global_settings > ENV.
function envEvolutionUrl(): string {
  return (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
}
function envEvolutionKey(): string {
  return Deno.env.get("EVOLUTION_API_KEY") || "";
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoice_id, paid_date, organization_id } = await req.json();

    if (!invoice_id || !paid_date || !organization_id) {
      return new Response(
        JSON.stringify({ error: "invoice_id, paid_date e organization_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(String(invoice_id)) || !uuidRe.test(String(organization_id)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(paid_date))) {
      return new Response(
        JSON.stringify({ error: "Parâmetros inválidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // === AUTH: exige JWT válido e vínculo com a organização ===
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

    const user_id = user.id;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user_id, _role: "admin" });
    if (!isAdmin) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", organization_id)
        .maybeSingle();
      if (!membership) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === ATOMIC TRANSACTION via RPC (SELECT FOR UPDATE inside PostgreSQL) ===
    const { data: rpcResult, error: rpcError } = await supabase.rpc("perform_baixa_manual", {
      p_invoice_id: invoice_id,
      p_paid_date: paid_date,
      p_organization_id: organization_id,
      p_user_id: user_id || "00000000-0000-0000-0000-000000000000",
    });

    if (rpcError) {
      console.error("[baixa-manual] RPC error:", rpcError.message);
      return new Response(
        JSON.stringify({ error: "Falha ao processar pagamento. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = rpcResult as Record<string, unknown>;

    if (!result?.success) {
      return new Response(
        JSON.stringify({ error: result?.error || "Operação não permitida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (result.already_paid) {
      return new Response(
        JSON.stringify({ success: true, already_paid: true, message: "Fatura já estava paga" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === ASYNC WhatsApp confirmation (outside transaction — resilient) ===
    let whatsapp_sent = false;
    try {
      const clientId = result.client_id as string;
      const { data: client } = await supabase
        .from("clients")
        .select("name, phone")
        .eq("id", clientId)
        .single();

      if (client?.phone) {
        const { data: settings } = await supabase
          .from("billing_settings")
          .select("template_baixa, pix_key, pix_key_type, pix_holder_name")
          .eq("organization_id", organization_id)
          .maybeSingle();

        // Buscar fatura para extrair vencimento/competência
        const { data: invRow } = await supabase
          .from("invoices")
          .select("id, due_date, amount")
          .eq("id", invoice_id)
          .maybeSingle();

        // {valor} sem prefixo "R$" para evitar duplicidade em templates
        // que já contêm "R$ {valor}".
        const amount = Number(result.amount).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const dueDate: string | null = (invRow?.due_date as string) || null;
        const vencimentoBR = dueDate ? dueDate.split("-").reverse().join("/") : "";
        let competenciaBR = "";
        if (dueDate) {
          const dt = new Date(dueDate + "T12:00:00");
          competenciaBR = dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        }
        const reciboNo = "REC-" + String(invoice_id).replace(/-/g, "").slice(0, 10).toUpperCase();

        const template =
          settings?.template_baixa ||
          "Pagamento confirmado! ✅\nCliente: {nome}\nValor: R$ {valor}\nData: {data_pagamento}";
        await getOrCreatePortalLink(supabase, clientId, organization_id);
        let message = template
          .replace(/\*?\{nome\}\*?/g, `*${(client.name || "Cliente").trim()}*`)
          .replace(/{valor}/g, amount)
          .replace(/{data_pagamento}/g, paid_date.split("-").reverse().join("/"))
          .replace(/{data_vencimento}/g, vencimentoBR || paid_date.split("-").reverse().join("/"))
          .replace(/{competencia}/g, competenciaBR)
          .replace(/{recibo}/g, reciboNo)
          .replace(/{titular_pix}/g, (settings as any)?.pix_holder_name || "")
          .replace(/{link_portal}/g, "");
        message = removePaymentConfirmationLinks(message);

        // Get WhatsApp instance
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("organization_id", organization_id)
          .eq("status", "connected")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: globalSettings } = await supabase
          .from("global_settings")
          .select("key, value")
          .in("key", ["api_host", "global_api_key"]);

        const gs: Record<string, string> = {};
        (globalSettings || []).forEach((s: { key: string; value: string }) => {
          gs[s.key] = s.value;
        });

        const apiUrl = (instance?.api_url || gs.api_host || envEvolutionUrl()).replace(/\/$/, "");
        const apiKey = instance?.api_key || gs.global_api_key || envEvolutionKey();
        const instanceName = instance?.name || "";

        if (instanceName && apiUrl && apiKey) {
          const _d = (client.phone || "").replace(/\D/g, "");
          const cleanPhone = (_d.startsWith("55") && (_d.length === 12 || _d.length === 13)) ? _d : ((_d.length === 10 || _d.length === 11) ? "55" + _d : _d);
          const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;

          const maskedKey = apiKey.length > 4 ? apiKey.slice(0, 2) + "***" + apiKey.slice(-2) : "***";
          console.log(`[baixa-manual] Sending confirmation to ${cleanPhone.slice(0, 4)}**** (key: ${maskedKey})`);

          let errBody = "";
          try {
            const result = await sendEvolutionText(sendUrl, apiKey, cleanPhone, message);
            whatsapp_sent = result.ok;
            if (!result.ok) {
              errBody = result.body || `Resposta ${result.status} sem identificador de mensagem`;
              console.error(`[baixa-manual] WhatsApp error: ${result.status} - ${errBody.slice(0, 200)}`);
            }
          } catch (fetchErr) {
            errBody = String(fetchErr);
            console.error(`[baixa-manual] WhatsApp fetch failed: ${errBody.slice(0, 200)}`);
          }

          // Log sent message
          await supabase.from("whatsapp_messages").insert({
            organization_id,
            phone: client.phone,
            message,
            direction: "outgoing",
            status: whatsapp_sent ? "sent" : "failed",
            instance_id: instance?.id || null,
            sent_at: new Date().toISOString(),
          });

          // FALLBACK: se envio direto falhou (ex.: "Connection Closed"),
          // enfileira na whatsapp_queue para o whatsapp-sender reprocessar
          if (!whatsapp_sent) {
            await supabase.from("whatsapp_queue").insert({
              organization_id,
              phone: cleanPhone,
              message,
              status: "queued",
              scheduled_for: new Date(Date.now() + 30_000).toISOString(),
              error_message: `baixa-manual fallback: ${errBody.slice(0, 200)}`,
            });
            console.log(`[baixa-manual] Confirmação enfileirada para retry (${cleanPhone.slice(0,4)}****)`);
          }
        } else {
          console.warn("[baixa-manual] WhatsApp not configured — skipping confirmation");
        }
      }
    } catch (e) {
      console.error("[baixa-manual] WhatsApp error (non-blocking):", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        already_paid: false,
        whatsapp_sent,
        message: "Pagamento confirmado com sucesso",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[baixa-manual] Error:", error);
    return new Response(
      JSON.stringify({ error: "Ocorreu um erro interno. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
