import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreatePortalLink } from "../_shared/portalLink.ts";

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
    const { invoice_id, paid_date, organization_id, user_id } = await req.json();

    if (!invoice_id || !paid_date || !organization_id) {
      return new Response(
        JSON.stringify({ error: "invoice_id, paid_date e organization_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

        const amount = Number(result.amount).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        const template =
          settings?.template_baixa ||
          "Pagamento confirmado! ✅\nCliente: {nome}\nValor: R$ {valor}\nData: {data_pagamento}";
        const portalLink = await getOrCreatePortalLink(supabase, clientId, organization_id);
        let message = template
          .replace(/{nome}/g, client.name || "Cliente")
          .replace(/{valor}/g, amount)
          .replace(/{data_pagamento}/g, paid_date.split("-").reverse().join("/"))
          .replace(/{titular_pix}/g, (settings as any)?.pix_holder_name || "")
          .replace(/{link_portal}/g, portalLink);

        // Auto-append portal link if template didn't include the variable
        if (portalLink && !template.includes("{link_portal}") && !message.includes(portalLink)) {
          message += `\n\n🔗 *Acesse seu portal:* ${portalLink}`;
        }

        // Get WhatsApp instance
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("organization_id", organization_id)
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();

        const { data: globalSettings } = await supabase
          .from("global_settings")
          .select("key, value")
          .in("key", ["api_host", "global_api_key", "default_instance_name"]);

        const gs: Record<string, string> = {};
        (globalSettings || []).forEach((s: { key: string; value: string }) => {
          gs[s.key] = s.value;
        });

        const apiUrl = (instance?.api_url || gs.api_host || "").replace(/\/$/, "");
        const apiKey = instance?.api_key || gs.global_api_key || "";
        const instanceName = instance?.name || gs.default_instance_name || "";

        if (instanceName && apiUrl && apiKey) {
          const _d = (client.phone || "").replace(/\D/g, "");
          const cleanPhone = (_d.startsWith("55") && (_d.length === 12 || _d.length === 13)) ? _d : ((_d.length === 10 || _d.length === 11) ? "55" + _d : _d);
          const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;

          const maskedKey = apiKey.length > 4 ? apiKey.slice(0, 2) + "***" + apiKey.slice(-2) : "***";
          console.log(`[baixa-manual] Sending confirmation to ${cleanPhone.slice(0, 4)}**** (key: ${maskedKey})`);

          const response = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: apiKey },
            body: JSON.stringify({ number: cleanPhone, textMessage: { text: message } }),
          });

          whatsapp_sent = response.ok;
          if (!response.ok) {
            const errBody = await response.text();
            console.error(`[baixa-manual] WhatsApp error: ${response.status} - ${errBody.slice(0, 200)}`);
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
