import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreatePortalLink } from "../_shared/portalLink.ts";
import { removePaymentConfirmationLinks } from "../_shared/paymentReceipt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

// ─── Provider-specific webhook payload parsers ───
function parseWebhookPayload(provider: string, body: any): { paid: boolean; externalId?: string; amount?: number } | null {
  try {
    switch (provider) {
      case "mercadopago":
        // MP sends { action: "payment.updated", data: { id } } or full payment object
        if (body?.action === "payment.updated" || body?.action === "payment.created") {
          return { paid: body?.data?.status === "approved" || body?.type === "payment", externalId: String(body?.data?.id) };
        }
        if (body?.status === "approved") return { paid: true, externalId: String(body?.id), amount: body?.transaction_amount };
        return { paid: true, externalId: String(body?.data?.id || body?.id || "") };

      case "asaas":
        // Asaas: { event: "PAYMENT_RECEIVED", payment: { id, value, status } }
        if (body?.event === "PAYMENT_RECEIVED" || body?.event === "PAYMENT_CONFIRMED") {
          return { paid: true, externalId: body?.payment?.externalReference || body?.payment?.id, amount: body?.payment?.value };
        }
        return null;

      case "efi":
        // Efí/Gerencianet PIX webhook: { pix: [{ txid, valor, ... }] }
        if (body?.pix && Array.isArray(body.pix) && body.pix.length > 0) {
          const pix = body.pix[0];
          return { paid: true, externalId: pix.txid || pix.endToEndId, amount: parseFloat(pix.valor) };
        }
        return null;

      case "v3pay":
        if (body?.status === "paid" || body?.status === "approved") {
          return { paid: true, externalId: body?.reference || body?.id, amount: body?.amount };
        }
        return null;

      case "pagseguro":
        if (body?.status === "PAID" || body?.charges?.[0]?.status === "PAID") {
          return { paid: true, externalId: body?.reference_id || body?.id, amount: body?.charges?.[0]?.amount?.value ? body.charges[0].amount.value / 100 : undefined };
        }
        return null;

      case "cielo":
        if (body?.Payment?.Status === 2 || body?.Payment?.Status === "2") {
          return { paid: true, externalId: body?.MerchantOrderId, amount: body?.Payment?.Amount ? body.Payment.Amount / 100 : undefined };
        }
        return null;

      // Banks (BB, Itaú, Bradesco, Santander, Sicoob, Sicredi, Inter)
      case "bb":
      case "itau":
      case "bradesco":
      case "santander":
      case "sicoob":
      case "sicredi":
      case "inter":
        // Most bank APIs send PIX confirmation: { pix: [...] } or { pagamento: { status } }
        if (body?.pix && Array.isArray(body.pix)) {
          const pix = body.pix[0];
          return { paid: true, externalId: pix.txid || pix.endToEndId, amount: parseFloat(pix.valor || "0") };
        }
        if (body?.status === "CONCLUIDA" || body?.status === "REALIZADO" || body?.status === "paid") {
          return { paid: true, externalId: body?.txid || body?.id || body?.codigoSolicitacao, amount: body?.valor ? parseFloat(body.valor) : undefined };
        }
        return { paid: true, externalId: body?.txid || body?.id || "" };

      default:
        // Generic: trust any payload that explicitly says paid/approved
        if (body?.status === "paid" || body?.status === "approved" || body?.status === "CONCLUIDA") {
          return { paid: true, externalId: body?.id || body?.txid, amount: body?.amount || body?.valor };
        }
        return null;
    }
  } catch (e) {
    console.error("Error parsing webhook payload:", e);
    return null;
  }
}

async function trySendWhatsApp(instance: any, phone: string, message: string): Promise<boolean> {
  try {
    if (!instance.api_url || !instance.api_key || !instance.name) return false;
    const _d = (phone || "").replace(/\D/g, "");
    const cleanPhone = (_d.startsWith("55") && (_d.length === 12 || _d.length === 13)) ? _d : ((_d.length === 10 || _d.length === 11) ? "55" + _d : _d);
    const apiUrl = instance.api_url.replace(/\/$/, "");
    const apiKey = instance.api_key;
    const sendUrl = `${apiUrl}/message/sendText/${instance.name}`;
    const resp = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: cleanPhone, text: message, linkPreview: false }),
    });
    return resp.ok;
  } catch (e) {
    console.error("WhatsApp send failed (masked):", (e as Error).message?.replace(/apikey[=:]\s*\S+/gi, "apikey=***"));
    return false;
  }
}

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const orgParam = url.searchParams.get("org");
    const providerParam = url.searchParams.get("provider");

    // ─── MODE 1: Universal Webhook (org + provider in query params) ───
    if (orgParam && providerParam) {
      const body = await req.json();
      console.log(`[bip-receiver] Webhook from ${providerParam} for org ${orgParam.slice(0, 8)}***`);

      // Persistent log of every webhook received (audit trail)
      const logWebhook = async (event: string, status: number, responseBody: any) => {
        try {
          await supabase.from("webhook_logs").insert({
            organization_id: orgParam,
            event: `${providerParam}.${event}`,
            payload: body,
            response_status: status,
            response_body: typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody),
          });
        } catch (e) {
          console.error("[bip-receiver] failed to persist webhook_log:", (e as Error).message);
        }
      };

      // Verify org exists and is active
      const { data: org } = await supabase
        .from("organizations")
        .select("active, name")
        .eq("id", orgParam)
        .single();

      if (!org?.active) {
        await logWebhook("rejected_inactive_org", 403, { error: "Organization not found or inactive" });
        return new Response(JSON.stringify({ error: "Organization not found or inactive" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify billing_settings matches this provider
      const { data: billingSettings } = await supabase
        .from("billing_settings")
        .select("*")
        .eq("organization_id", orgParam)
        .eq("gateway_provider", providerParam)
        .maybeSingle();

      if (!billingSettings) {
        await logWebhook("rejected_provider_not_configured", 400, { error: "Provider not configured" });
        return new Response(JSON.stringify({ error: "Provider not configured for this organization" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Parse payload based on provider
      const parsed = parseWebhookPayload(providerParam, body);
      if (!parsed || !parsed.paid) {
        // Not a payment confirmation — acknowledge but do nothing
        await logWebhook("ignored_not_payment", 200, { received: true, action: "ignored" });
        return new Response(JSON.stringify({ received: true, action: "ignored", reason: "Not a payment confirmation" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try to find matching invoice by external ID or amount
      let invoice: any = null;

      if (parsed.externalId) {
        // Try matching by description containing the external ID
        const { data: invoices } = await supabase
          .from("invoices")
          .select("*, clients(name, phone, collector_id)")
          .eq("organization_id", orgParam)
          .eq("status", "aberto")
          .limit(50);

        if (invoices && invoices.length > 0) {
          // Match by external reference in description or by amount
          invoice = invoices.find((inv: any) =>
            inv.description?.includes(parsed.externalId) ||
            (parsed.amount && Math.abs(Number(inv.amount) - parsed.amount) < 0.01)
          );
          // Fallback: if only one open invoice with that amount
          if (!invoice && parsed.amount) {
            const amountMatches = invoices.filter((inv: any) => Math.abs(Number(inv.amount) - parsed.amount!) < 0.01);
            if (amountMatches.length === 1) invoice = amountMatches[0];
          }
        }
      }

      if (!invoice) {
        console.log(`[bip-receiver] No matching invoice found for ref=${parsed.externalId} amount=${parsed.amount}`);
        await logWebhook("no_match", 200, { externalId: parsed.externalId, amount: parsed.amount });
        return new Response(JSON.stringify({
          received: true, action: "no_match",
          message: "Payment received but no matching open invoice found",
          externalId: parsed.externalId,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark invoice as paid
      const paidDate = new Date().toISOString().split("T")[0];
      await supabase.from("invoices").update({
        status: "pago",
        paid_date: paidDate,
      }).eq("id", invoice.id);

      // Record transaction
      await supabase.from("transactions").insert({
        organization_id: orgParam,
        type: "entrada",
        amount: invoice.amount,
        description: `Baixa automática via ${providerParam} — ${invoice.clients?.name || "Cliente"}`,
        invoice_id: invoice.id,
      });

      // Send WhatsApp confirmation
      const client = invoice.clients;
      if (client?.phone) {
        const tpl = billingSettings.template_baixa ||
          "Pagamento confirmado! ✅\n\nCliente: {nome}\nValor: R$ {valor}\nData: {data_pagamento}\n\nObrigado pela pontualidade! 🙏";
        await getOrCreatePortalLink(supabase, client.id, orgParam);
        const valorFmt = Number(invoice.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const vencBR = invoice.due_date ? String(invoice.due_date).split("-").reverse().join("/") : "";
        const compBR = invoice.due_date ? new Date(invoice.due_date + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "";
        const reciboNo = "REC-" + String(invoice.id).replace(/-/g, "").slice(0, 10).toUpperCase();
        const message = removePaymentConfirmationLinks(tpl
          .replace(/{nome}/g, client.name || "Cliente")
          .replace(/{valor}/g, valorFmt)
          .replace(/{data_pagamento}/g, paidDate.split("-").reverse().join("/"))
          .replace(/{data_vencimento}/g, vencBR || paidDate.split("-").reverse().join("/"))
          .replace(/{competencia}/g, compBR)
          .replace(/{recibo}/g, reciboNo)
          .replace(/{link_portal}/g, ""));

        let directSent = false;
        if (client.collector_id) {
          const { data: ci } = await supabase
            .from("whatsapp_instances")
            .select("*")
            .eq("organization_id", orgParam)
            .eq("collector_id", client.collector_id)
            .eq("status", "connected")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (ci?.api_url && ci?.api_key) directSent = await trySendWhatsApp(ci, client.phone, message);
        }
        if (!directSent) {
          const { data: mi } = await supabase
            .from("whatsapp_instances")
            .select("*")
            .eq("organization_id", orgParam)
            .is("collector_id", null)
            .eq("status", "connected")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (mi?.api_url && mi?.api_key) directSent = await trySendWhatsApp(mi, client.phone, message);
        }
        if (!directSent) {
          // Last resort: queue
          await supabase.from("whatsapp_queue").insert({
            organization_id: orgParam,
            phone: client.phone,
            message,
            status: "queued",
          });
        }
      }

      await logWebhook("baixa_automatica", 200, { invoice_id: invoice.id, client: client?.name, amount: invoice.amount });
      return new Response(JSON.stringify({
        success: true,
        provider: providerParam,
        invoice_id: invoice.id,
        client: client?.name,
        action: "baixa_automatica",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── MODE 2: Legacy API key-based bip (barcode reader) ───
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key required or use ?org=&provider= for webhook" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const body = await req.json().catch(() => ({}));
    const { barcode, action, new_due_date } = body || {};

    // Golden rule: if no barcode OR no explicit action — act as if it never happened.
    if (!barcode) {
      console.log(`[bip-receiver] silent_ignore no_barcode`);
      return new Response(JSON.stringify({ success: true, ignored: true, reason: "no_barcode" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!action || !["baixa", "remarcacao", "retorno"].includes(String(action))) {
      console.log(`[bip-receiver] silent_ignore no_action_or_invalid action=${action}`);
      return new Response(JSON.stringify({ success: true, ignored: true, reason: "no_action" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: barcodeConfig } = await supabase
      .from("barcode_configs")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const config = barcodeConfig || { client_id_length: 7, year_length: 4, month_length: 2 };
    const clean = String(barcode).replace(/\D/g, "");
    const totalLen = config.client_id_length + config.year_length + config.month_length;

    // Use ONLY the org's configured pattern length — no generic floors.
    if (clean.length < totalLen) {
      console.log(`[bip-receiver] silent_ignore short_barcode len=${clean.length} required=${totalLen}`);
      return new Response(JSON.stringify({ success: true, ignored: true, reason: "short_barcode" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientCode = clean.substring(0, config.client_id_length);
    const year = clean.substring(config.client_id_length, config.client_id_length + config.year_length);
    const month = clean.substring(config.client_id_length + config.year_length, totalLen);

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("client_code", clientCode)
      .maybeSingle();

    if (!client) {
      // Silent ignore: barcode does not match any client in this org
      console.log(`[bip-receiver] silent_ignore client_not_found code=${clientCode}`);
      return new Response(JSON.stringify({ success: true, ignored: true, reason: "client_not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency
    const { data: existingBip } = await supabase
      .from("bips")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("barcode_raw", barcode)
      .eq("action", action)
      .eq("status", "processed")
      .maybeSingle();

    if (existingBip) {
      return new Response(JSON.stringify({
        success: true, duplicate: true, bip_id: existingBip.id,
        message: "Bip já processado anteriormente",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monthStart = `${year}-${month}-01`;
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const nextYear = monthNum === 12 ? yearNum + 1 : yearNum;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const { data: invoices } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_id", client.id)
      .eq("status", "aberto")
      .gte("due_date", monthStart)
      .lt("due_date", monthEnd)
      .order("due_date", { ascending: true })
      .limit(1);

    const invoice = invoices?.[0];

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

    // Send WhatsApp
    if (client.phone) {
      const { data: billingSettings } = await supabase
        .from("billing_settings")
        .select("template_baixa, template_retorno, template_remarcar")
        .eq("organization_id", organizationId)
        .maybeSingle();

      let message = "";
      const paidDate = new Date().toISOString().split("T")[0];
      const portalLink = await getOrCreatePortalLink(supabase, client.id, organizationId);
      if (action === "baixa") {
        const tpl = billingSettings?.template_baixa || "Pagamento confirmado! ✅\n\nCliente: {nome}\nValor: R$ {valor}\nData: {data_pagamento}\n\nObrigado pela pontualidade! 🙏";
        const valorFmt = Number(invoice?.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const vencBR = invoice?.due_date ? String(invoice.due_date).split("-").reverse().join("/") : "";
        const compBR = invoice?.due_date ? new Date(invoice.due_date + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "";
        const reciboNo = "REC-" + String(invoice?.id || "").replace(/-/g, "").slice(0, 10).toUpperCase();
        message = removePaymentConfirmationLinks(tpl
          .replace(/{nome}/g, client.name)
          .replace(/{valor}/g, valorFmt)
          .replace(/{data_pagamento}/g, paidDate.split("-").reverse().join("/"))
          .replace(/{data_vencimento}/g, vencBR || paidDate.split("-").reverse().join("/"))
          .replace(/{competencia}/g, compBR)
          .replace(/{recibo}/g, reciboNo)
          .replace(/{link_portal}/g, ""));
      } else if (action === "remarcacao") {
        const tpl = billingSettings?.template_remarcar || "Olá {nome}! 📅\n\nSua fatura no valor de R$ {valor} foi remarcada.\nNova data de vencimento: {nova_data}\n\nQualquer dúvida, estamos à disposição!";
        const valorFmt = Number(invoice?.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        message = tpl
          .replace(/{nome}/g, client.name)
          .replace(/{valor}/g, valorFmt)
          .replace(/{nova_data}/g, new_due_date ? new_due_date.split("-").reverse().join("/") : "")
          .replace(/{link_portal}/g, portalLink);
      } else {
        const tpl = billingSettings?.template_retorno || "Olá {nome}! 👋\n\nNosso cobrador esteve no endereço cadastrado e não encontrou ninguém.\nPor favor, entre em contato para agendar uma nova visita.";
        message = tpl
          .replace(/{nome}/g, client.name)
          .replace(/{link_portal}/g, portalLink);
      }

      let directSent = false;
      if (client.collector_id) {
        const { data: ci } = await supabase
          .from("whatsapp_instances").select("*")
          .eq("organization_id", organizationId)
          .eq("collector_id", client.collector_id)
          .eq("status", "connected")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ci?.api_url && ci?.api_key) directSent = await trySendWhatsApp(ci, client.phone, message);
      }
      if (!directSent) {
        const { data: mi } = await supabase
          .from("whatsapp_instances").select("*")
          .eq("organization_id", organizationId)
          .is("collector_id", null)
          .eq("status", "connected")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (mi?.api_url && mi?.api_key) directSent = await trySendWhatsApp(mi, client.phone, message);
      }
      if (!directSent) {
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
