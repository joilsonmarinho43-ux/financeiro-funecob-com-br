import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOrgAuth } from "../_shared/requireOrgAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreatePaymentResult {
  success: boolean;
  payment_url?: string;
  external_id?: string;
  cached?: boolean;
  error?: string;
}

/**
 * Create a Mercado Pago Preference (Checkout link).
 * Docs: https://www.mercadopago.com.br/developers/en/reference/preferences/_checkout_preferences/post
 */
async function createMercadoPagoPayment(opts: {
  accessToken: string;
  invoiceId: string;
  amount: number;
  description: string;
  payerEmail?: string;
  payerName?: string;
  notificationUrl?: string;
}): Promise<CreatePaymentResult> {
  // MP exige valor mínimo de R$ 0,50 para checkout
  const amount = Math.max(Number(opts.amount), 0.5);

  // Validar email - MP rejeita emails de teste tipo "test@test.com" ou inválidos
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validEmail = opts.payerEmail && emailRegex.test(opts.payerEmail) && !opts.payerEmail.includes("test@") ? opts.payerEmail : undefined;

  // Sanitizar título (MP limita a 256 chars e rejeita caracteres especiais excessivos)
  const title = (opts.description || "Pagamento de fatura").slice(0, 250);

  const payerObj: Record<string, string> = {};
  if (validEmail) payerObj.email = validEmail;
  if (opts.payerName) {
    const parts = opts.payerName.trim().split(/\s+/);
    payerObj.name = parts[0] || "Cliente";
    if (parts.length > 1) payerObj.surname = parts.slice(1).join(" ");
  }

  const body: any = {
    items: [
      {
        id: opts.invoiceId,
        title,
        quantity: 1,
        unit_price: amount,
        currency_id: "BRL",
      },
    ],
    external_reference: opts.invoiceId,
    metadata: { invoice_id: opts.invoiceId },
    payment_methods: {
      installments: 12,
    },
  };

  if (opts.notificationUrl) {
    body.notification_url = opts.notificationUrl;
  }

  if (Object.keys(payerObj).length > 0) {
    body.payer = payerObj;
  }

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { /* keep raw */ }

  if (!res.ok) {
    console.error("[mp] error:", res.status, text.slice(0, 500));
    return {
      success: false,
      error: data?.message || `Mercado Pago HTTP ${res.status}`,
    };
  }

  // Prefer init_point (production); fallback to sandbox
  const url = data?.init_point || data?.sandbox_init_point;
  if (!url) {
    return { success: false, error: "Resposta do Mercado Pago sem init_point" };
  }

  return {
    success: true,
    payment_url: url,
    external_id: String(data?.id || ""),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { invoice_id, organization_id, force } = body || {};

    if (!invoice_id || !organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "invoice_id e organization_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const auth = await requireOrgAuth(req, organization_id, corsHeaders);
    if (!auth.ok) return auth.response;

    // 1. Get invoice + client
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, amount, description, status, client_id, payment_link, payment_link_provider, payment_link_external_id, clients(name, email, phone)")
      .eq("id", invoice_id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (invErr || !invoice) {
      return new Response(
        JSON.stringify({ success: false, error: "Fatura não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.status === "pago") {
      return new Response(
        JSON.stringify({ success: false, error: "Fatura já está paga" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get gateway settings
    const { data: settings, error: settingsErr } = await supabase
      .from("billing_settings")
      .select("gateway_provider, gateway_api_key, billing_mode, gateway_webhook_url")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (settingsErr || !settings || settings.billing_mode !== "gateway" || !settings.gateway_provider || !settings.gateway_api_key) {
      return new Response(
        JSON.stringify({ success: false, error: "Gateway não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Return cached link if exists and same provider (unless force)
    if (!force && invoice.payment_link && invoice.payment_link_provider === settings.gateway_provider) {
      return new Response(
        JSON.stringify({
          success: true,
          payment_url: invoice.payment_link,
          external_id: invoice.payment_link_external_id,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create payment by provider
    const client = (invoice as any).clients;
    let result: CreatePaymentResult;

    // Normalize API key: accept raw token OR JSON like {"access_token":"..."}
    let apiKey = String(settings.gateway_api_key).trim();
    if (apiKey.startsWith("{")) {
      try {
        const parsed = JSON.parse(apiKey);
        apiKey = parsed.access_token || parsed.token || parsed.api_key || apiKey;
      } catch { /* keep original */ }
    }

    switch (settings.gateway_provider) {
      case "mercadopago":
        result = await createMercadoPagoPayment({
          accessToken: apiKey,
          invoiceId: invoice.id,
          amount: Number(invoice.amount),
          description: invoice.description || "Pagamento de fatura",
          payerEmail: client?.email || undefined,
          payerName: client?.name || undefined,
          notificationUrl: settings.gateway_webhook_url || undefined,
        });
        break;
      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: `Provedor '${settings.gateway_provider}' ainda não suportado para geração automática de links. Use Mercado Pago ou aguarde implementação.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    if (!result.success || !result.payment_url) {
      return new Response(
        JSON.stringify({ success: false, error: result.error || "Falha ao gerar link" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Cache link in invoice
    await supabase
      .from("invoices")
      .update({
        payment_link: result.payment_url,
        payment_link_provider: settings.gateway_provider,
        payment_link_external_id: result.external_id || null,
      })
      .eq("id", invoice.id);

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: result.payment_url,
        external_id: result.external_id,
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[gateway-create-payment] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
