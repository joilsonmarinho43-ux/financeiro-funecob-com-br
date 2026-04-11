import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // === TRANSAÇÃO ATÔMICA via RPC ou queries sequenciais com service_role ===

    // 1. Idempotency check
    const { data: invoice, error: fetchErr } = await supabase
      .from("invoices")
      .select("id, status, amount, client_id, due_date")
      .eq("id", invoice_id)
      .eq("organization_id", organization_id)
      .single();

    if (fetchErr || !invoice) {
      return new Response(
        JSON.stringify({ error: "Fatura não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.status === "pago") {
      return new Response(
        JSON.stringify({ success: true, already_paid: true, message: "Fatura já estava paga" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.status !== "aberto") {
      return new Response(
        JSON.stringify({ error: `Fatura com status '${invoice.status}' não pode receber baixa` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Atomic update with optimistic lock
    const { error: updateErr, count } = await supabase
      .from("invoices")
      .update({ status: "pago", paid_date })
      .eq("id", invoice_id)
      .eq("status", "aberto");

    if (updateErr) {
      console.error("[baixa-manual] Update error:", updateErr.message);
      // Log the failure
      await supabase.from("system_logs").insert({
        action: "baixa_manual_erro",
        user_id: user_id || "00000000-0000-0000-0000-000000000000",
        organization_id,
        details: { invoice_id, error: updateErr.message },
      });
      return new Response(
        JSON.stringify({ error: "Falha ao atualizar fatura" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Cancel pending reminders
    await supabase
      .from("billing_reminders")
      .update({ status: "cancelled" })
      .eq("invoice_id", invoice_id)
      .eq("status", "pending");

    // 4. Cancel queued WhatsApp messages for this invoice's client
    // (best effort — won't rollback if this fails)

    // 5. Audit log
    await supabase.from("system_logs").insert({
      action: "baixa_manual",
      user_id: user_id || "00000000-0000-0000-0000-000000000000",
      organization_id,
      details: {
        invoice_id,
        paid_date,
        amount: invoice.amount,
        client_id: invoice.client_id,
      },
    });

    // 6. Send WhatsApp confirmation OUTSIDE the transaction (async, resilient)
    let whatsapp_sent = false;
    try {
      const { data: client } = await supabase
        .from("clients")
        .select("name, phone")
        .eq("id", invoice.client_id)
        .single();

      if (client?.phone) {
        const { data: settings } = await supabase
          .from("billing_settings")
          .select("template_baixa, pix_key, pix_key_type, billing_mode, gateway_provider")
          .eq("organization_id", organization_id)
          .maybeSingle();

        const amount = Number(invoice.amount).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        const template =
          settings?.template_baixa ||
          "Pagamento confirmado! ✅\nCliente: {nome}\nValor: R$ {valor}\nData: {data_pagamento}";
        const message = template
          .replace(/{nome}/g, client.name || "Cliente")
          .replace(/{valor}/g, amount)
          .replace(/{data_pagamento}/g, paid_date.split("-").reverse().join("/"));

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
        (globalSettings || []).forEach((s: any) => {
          gs[s.key] = s.value;
        });

        const VPS_FALLBACK = "http://161.97.181.130:8080";
        const VPS_KEY_FALLBACK = "123456";
        const apiUrl = (instance?.api_url || gs.api_host || VPS_FALLBACK).replace(/\/$/, "");
        const apiKey = instance?.api_key || gs.global_api_key || VPS_KEY_FALLBACK;
        const instanceName = instance?.name || gs.default_instance_name || "";

        if (instanceName) {
          const cleanPhone = client.phone.replace(/\D/g, "");
          const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;

          const response = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: apiKey },
            body: JSON.stringify({ number: cleanPhone, textMessage: { text: message } }),
          });

          whatsapp_sent = response.ok;
          if (!response.ok) {
            const errBody = await response.text();
            console.error(`[baixa-manual] WhatsApp send error: ${response.status} - ${errBody.slice(0, 200)}`);
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
