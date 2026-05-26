// Vincula manualmente um evento auto_settlement_events a um cliente
// e dispara o processamento (quitação de faturas + WhatsApp).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sendPaymentConfirmation(
  supabase: any, organizationId: string, clientId: string, amount: number
) {
  try {
    const { data: client } = await supabase
      .from("clients").select("name, phone").eq("id", clientId).single();
    if (!client?.phone) return false;

    const { data: settings } = await supabase
      .from("billing_settings")
      .select("template_baixa, pix_holder_name")
      .eq("organization_id", organizationId).maybeSingle();

    const { getOrCreatePortalLink } = await import("../_shared/portalLink.ts");
    const portalLink = await getOrCreatePortalLink(supabase, clientId, organizationId);

    const valor = Number(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const tpl = settings?.template_baixa
      || "Pagamento confirmado! ✅\n\nCliente: {nome}\nValor: R$ {valor}\nData: {data_pagamento}\n\nObrigado pela pontualidade! 🙏";
    let message = tpl
      .replace(/{nome}/g, client.name || "Cliente")
      .replace(/{valor}/g, valor)
      .replace(/{data_pagamento}/g, new Date().toLocaleDateString("pt-BR"))
      .replace(/{titular_pix}/g, settings?.pix_holder_name || "")
      .replace(/{link_portal}/g, portalLink);
    if (portalLink && !tpl.includes("{link_portal}") && !message.includes(portalLink)) {
      message += `\n\n🔗 *Acesse seu portal:* ${portalLink}`;
    }

    const { data: instance } = await supabase
      .from("whatsapp_instances").select("*")
      .eq("organization_id", organizationId).eq("status", "connected")
      .limit(1).maybeSingle();
    const { data: gsRows } = await supabase
      .from("global_settings").select("key, value")
      .in("key", ["api_host", "global_api_key", "default_instance_name"]);
    const gs: Record<string, string> = {};
    (gsRows || []).forEach((s: any) => { gs[s.key] = s.value; });
    const apiUrl = (instance?.api_url || gs.api_host || "").replace(/\/$/, "");
    const apiKey = instance?.api_key || gs.global_api_key || "";
    const instanceName = instance?.name || gs.default_instance_name || "";
    if (!instanceName || !apiUrl || !apiKey) return false;

    const cleanPhone = client.phone.replace(/\D/g, "");
    const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: cleanPhone, textMessage: { text: message } }),
    });
    const ok = res.ok;
    await supabase.from("whatsapp_messages").insert({
      organization_id: organizationId,
      phone: client.phone,
      message,
      direction: "outgoing",
      status: ok ? "sent" : "failed",
      instance_id: instance?.id || null,
      client_id: clientId,
      sent_at: new Date().toISOString(),
    });
    return ok;
  } catch (e) {
    console.error("[assign-client] WA error", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { event_id, client_id } = await req.json();
    if (!event_id || !client_id) {
      return new Response(JSON.stringify({ error: "event_id e client_id obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Validate event + client are in the same org
    const { data: ev } = await supabase.from("auto_settlement_events")
      .select("*").eq("id", event_id).maybeSingle();
    if (!ev) {
      return new Response(JSON.stringify({ error: "evento não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: cli } = await supabase.from("clients")
      .select("id, organization_id, name").eq("id", client_id).maybeSingle();
    if (!cli || cli.organization_id !== ev.organization_id) {
      return new Response(JSON.stringify({ error: "cliente inválido para esta organização" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ev.status === "conciliado") {
      return new Response(JSON.stringify({ status: "already_processed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vincula cliente e marca como 'recebido' para reprocessar
    await supabase.from("auto_settlement_events")
      .update({ client_id, status: "recebido", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", event_id);

    await supabase.from("auto_settlement_logs").insert({
      organization_id: ev.organization_id, event_id, client_id,
      action: "manual_link",
      details: { linked_by_user: true, previous_status: ev.status },
    });

    // Dispara processamento (quita faturas / gera crédito)
    const { data: result, error: rpcErr } = await supabase
      .rpc("auto_settlement_process_payment", { p_event_id: event_id });

    if (rpcErr) {
      await supabase.from("auto_settlement_events")
        .update({ status: "erro", error_message: rpcErr.message })
        .eq("id", event_id);
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Envia confirmação WhatsApp (não bloqueante)
    let whatsapp_sent = false;
    if (ev.amount_detected) {
      whatsapp_sent = await sendPaymentConfirmation(
        supabase, ev.organization_id, client_id, Number(ev.amount_detected)
      );
    }

    return new Response(JSON.stringify({
      success: true, result, whatsapp_sent, client_name: cli.name,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[assign-client] error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
