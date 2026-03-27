import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate API key
    const { data: apiKeyRecord, error: keyErr } = await supabase
      .from("org_api_keys")
      .select("organization_id, active")
      .eq("api_key", apiKey)
      .maybeSingle();

    if (keyErr || !apiKeyRecord || !apiKeyRecord.active) {
      return new Response(JSON.stringify({ error: "Invalid or inactive API key" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const organizationId = apiKeyRecord.organization_id;

    // Check org is active
    const { data: org } = await supabase
      .from("organizations")
      .select("active, name")
      .eq("id", organizationId)
      .single();

    if (!org?.active) {
      return new Response(JSON.stringify({ error: "Organization suspended" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { barcode, action = "baixa", new_due_date } = body;

    if (!barcode) {
      return new Response(JSON.stringify({ error: "barcode is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get barcode config for this org
    const { data: barcodeConfig } = await supabase
      .from("barcode_configs")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const config = barcodeConfig || { client_id_length: 7, year_length: 4, month_length: 2 };
    const clean = barcode.replace(/\D/g, "");
    const totalLen = config.client_id_length + config.year_length + config.month_length;

    if (clean.length < totalLen) {
      return new Response(JSON.stringify({ error: "Invalid barcode format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientCode = clean.substring(0, config.client_id_length);
    const year = clean.substring(config.client_id_length, config.client_id_length + config.year_length);
    const month = clean.substring(config.client_id_length + config.year_length, totalLen);

    // Find client
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("client_code", clientCode)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "Client not found", clientCode }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find matching invoice
    const targetDate = `${year}-${month}`;
    const { data: invoices } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_id", client.id)
      .eq("status", "aberto")
      .like("due_date", `${targetDate}%`)
      .limit(1);

    const invoice = invoices?.[0];

    // Process action
    if (action === "baixa" && invoice) {
      await supabase.from("invoices").update({
        status: "pago",
        paid_date: new Date().toISOString().split("T")[0],
      }).eq("id", invoice.id);

      await supabase.from("transactions").insert({
        organization_id: organizationId,
        type: "entrada",
        amount: invoice.amount,
        description: `Baixa via API - ${client.name}`,
        invoice_id: invoice.id,
      });
    } else if (action === "remarcacao" && invoice && new_due_date) {
      await supabase.from("invoices").update({ due_date: new_due_date }).eq("id", invoice.id);
    }

    // Record bip
    const { data: bip } = await supabase.from("bips").insert({
      organization_id: organizationId,
      client_id: client.id,
      collector_id: client.collector_id,
      barcode_raw: barcode,
      action,
      amount: invoice?.amount,
      invoice_id: invoice?.id,
      new_due_date: action === "remarcacao" ? new_due_date : null,
      status: "processed",
    }).select().single();

    // Send WhatsApp via collector's instance if client has phone
    if (client.phone) {
      let message = "";
      if (action === "baixa") {
        message = `✅ Pagamento confirmado!\n\nCliente: ${client.name}\nValor: R$ ${Number(invoice?.amount || 0).toFixed(2)}\n\nObrigado!`;
      } else if (action === "remarcacao") {
        message = `📅 Fatura remarcada!\n\nCliente: ${client.name}\nNova data: ${new_due_date}`;
      } else {
        message = `🔔 Retorno registrado!\n\nCliente: ${client.name}\nNosso cobrador esteve no endereço.`;
      }

      // Try to send directly via collector's WhatsApp instance
      let directSent = false;

      // 1. Try collector's WhatsApp instance
      if (client.collector_id) {
        const { data: collectorInstance } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("collector_id", client.collector_id)
          .eq("status", "connected")
          .maybeSingle();

        if (collectorInstance?.api_url && collectorInstance?.api_key) {
          directSent = await trySendWhatsApp(collectorInstance, client.phone, message);
        }
      }

      // 2. Fallback: main org instance (no collector_id or collector_id is null)
      if (!directSent) {
        const { data: mainInstance } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("organization_id", organizationId)
          .is("collector_id", null)
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();

        if (mainInstance?.api_url && mainInstance?.api_key) {
          directSent = await trySendWhatsApp(mainInstance, client.phone, message);
        }
      }

      if (!directSent) {
        // Fallback: enqueue for whatsapp-sender to process
        await supabase.from("whatsapp_queue").insert({
          organization_id: organizationId,
          phone: client.phone,
          message,
          status: "queued",
        });
      }

      await supabase.from("bips").update({ whatsapp_sent: true }).eq("id", bip.id);
    }

    return new Response(JSON.stringify({
      success: true,
      bip_id: bip.id,
      client: { id: client.id, name: client.name },
      action,
      invoice_id: invoice?.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Bip receiver error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
