// Vincula manualmente um evento auto_settlement_events a um cliente
// e dispara o processamento (quitação de faturas + WhatsApp).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { deliverPaymentConfirmation } from "../_shared/paymentReceipt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


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

    // === Aprende o mapeamento LID → cliente para auto-resolver futuros PIX ===
    // Quando Evolution v2 entrega só @lid (14-16 dígitos sem telefone real),
    // gravamos esse LID associado ao cliente para que próximas mensagens do
    // mesmo remetente sejam reconhecidas automaticamente.
    const rawPhone = (ev.phone || "").replace(/\D/g, "");
    const looksLikeLid = rawPhone.length >= 14;
    let lid_learned = false;
    let auto_resolved_count = 0;
    if (looksLikeLid) {
      const { error: mapErr } = await supabase.from("whatsapp_lid_map").upsert({
        organization_id: ev.organization_id,
        lid: rawPhone,
        client_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,lid" });
      if (!mapErr) lid_learned = true;

      // Reprocessa outros eventos pendente_revisao do mesmo LID
      const { data: others } = await supabase
        .from("auto_settlement_events")
        .select("id")
        .eq("organization_id", ev.organization_id)
        .eq("phone", ev.phone)
        .is("client_id", null)
        .in("status", ["pendente_revisao", "erro"]);
      for (const o of others || []) {
        if (o.id === event_id) continue;
        await supabase.from("auto_settlement_events")
          .update({ client_id, status: "recebido", error_message: null, updated_at: new Date().toISOString() })
          .eq("id", o.id);
        const { error: rErr } = await supabase.rpc("auto_settlement_process_payment", { p_event_id: o.id });
        if (!rErr) auto_resolved_count++;
      }
    }

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
      // Trava o contexto: destino = ev.phone (origem do comprovante), nunca cadastro
      whatsapp_sent = await sendPaymentConfirmation(
        supabase, ev.organization_id, client_id, Number(ev.amount_detected),
        ev.phone || "", event_id,
      );
    }

    return new Response(JSON.stringify({
      success: true, result, whatsapp_sent, client_name: cli.name,
      lid_learned, auto_resolved_count,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[assign-client] error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
