import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  phone: z.string().min(8).max(20),
  message: z.string().min(1).max(4096),
  organization_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Requisição inválida", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { phone, message, organization_id } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get WhatsApp instance
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    // Get global settings as fallback
    const { data: globalSettings } = await supabase
      .from("global_settings")
      .select("key, value")
      .in("key", ["api_host", "global_api_key", "default_instance_name"]);

    const gs: Record<string, string> = {};
    (globalSettings || []).forEach((s: { key: string; value: string }) => { gs[s.key] = s.value; });

    const apiUrl = (instance?.api_url || gs.api_host || "").replace(/\/$/, "");
    const apiKey = instance?.api_key || gs.global_api_key || "";
    const instanceName = instance?.name || gs.default_instance_name || "";

    if (!instanceName || !apiUrl || !apiKey) {
      return new Response(
        JSON.stringify({ error: "WhatsApp não configurado. Verifique instância e configurações globais." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const digits = phone.replace(/\D/g, "");
    const cleanPhone = (digits.startsWith("55") && (digits.length === 12 || digits.length === 13))
      ? digits
      : (digits.length === 10 || digits.length === 11) ? "55" + digits : digits;
    const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;

    const maskedKey = apiKey.length > 4 ? apiKey.slice(0, 2) + "***" + apiKey.slice(-2) : "***";
    console.log(`[send-now] Sending to ${cleanPhone.slice(0, 4)}**** via ${instanceName} (key: ${maskedKey})`);

    const response = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: cleanPhone, textMessage: { text: message } }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[send-now] API error: ${response.status} - ${errorBody.slice(0, 300)}`);

      // Detect common Evolution errors and return user-friendly messages
      let userMsg = "Falha no envio. Verifique se seu WhatsApp está conectado.";
      const lower = errorBody.toLowerCase();
      if (lower.includes("connection closed") || lower.includes("not connected") || lower.includes("close")) {
        userMsg = "WhatsApp desconectado. Reconecte sua instância em WhatsApp → Conectar.";
      } else if (lower.includes("not exists") || lower.includes("number does not exist") || lower.includes("invalid number")) {
        userMsg = "Número de WhatsApp inválido ou inexistente.";
      } else if (response.status === 401 || response.status === 403) {
        userMsg = "Credenciais do WhatsApp inválidas. Verifique a configuração da instância.";
      }

      return new Response(
        JSON.stringify({ error: userMsg, details: errorBody.slice(0, 200), status: response.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();

    // Log the sent message
    await supabase.from("whatsapp_messages").insert({
      organization_id,
      phone,
      message,
      direction: "outgoing",
      status: "sent",
      instance_id: instance?.id || null,
      sent_at: new Date().toISOString(),
    });

    console.log(`[send-now] Success for ${cleanPhone.slice(0, 4)}****`);

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-now] Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao enviar mensagem." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
