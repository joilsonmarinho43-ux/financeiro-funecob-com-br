import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { sendEvolutionText } from "../_shared/evolutionSend.ts";

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

async function resolveWhatsAppNumber(apiUrl: string, apiKey: string, instanceName: string, phone: string): Promise<string> {
  const candidates = [phone];
  if (phone.startsWith("55") && phone.length === 13 && phone[4] === "9") {
    candidates.push(phone.slice(0, 4) + phone.slice(5));
  } else if (phone.startsWith("55") && phone.length === 12) {
    candidates.push(phone.slice(0, 4) + "9" + phone.slice(4));
  }

  try {
    const response = await fetch(`${apiUrl}/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ numbers: candidates }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body)) return phone;
    const match = body.find((item: any) => item?.exists === true);
    const resolved = String(match?.jid || match?.number || "").replace(/@.*$/, "").replace(/\D/g, "");
    return resolved || phone;
  } catch {
    return phone;
  }
}

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
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Global settings may supply VPS transport credentials, but never an
    // instance name: sessions are strictly owned by an organization.
    const { data: globalSettings } = await supabase
      .from("global_settings")
      .select("key, value")
      .in("key", ["api_host", "global_api_key"]);

    const gs: Record<string, string> = {};
    (globalSettings || []).forEach((s: { key: string; value: string }) => { gs[s.key] = s.value; });

    const apiUrl = (instance?.api_url || gs.api_host || "").replace(/\/$/, "");
    const apiKey = instance?.api_key || gs.global_api_key || "";
    const instanceName = instance?.name || "";

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
    const destination = await resolveWhatsAppNumber(apiUrl, apiKey, instanceName, cleanPhone);
    const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;

    const maskedKey = apiKey.length > 4 ? apiKey.slice(0, 2) + "***" + apiKey.slice(-2) : "***";
    console.log(`[send-now] Sending to ${cleanPhone.slice(0, 4)}**** via ${instanceName} (key: ${maskedKey})`);

    const sendResult = await sendEvolutionText(sendUrl, apiKey, destination, message);
    if (!sendResult.ok) {
      const errorBody = sendResult.body;
      console.error(`[send-now] API error: ${sendResult.status} - ${errorBody.slice(0, 300)}`);

      // Detect common Evolution errors and return user-friendly messages
      let userMsg = "Falha no envio. Verifique se seu WhatsApp está conectado.";
      const lower = errorBody.toLowerCase();
      if (lower.includes("connection closed") || lower.includes("not connected") || lower.includes("close")) {
        userMsg = "WhatsApp desconectado. Reconecte sua instância em WhatsApp → Conectar.";
      } else if (lower.includes("not exists") || lower.includes("number does not exist") || lower.includes("invalid number")) {
        userMsg = "Número de WhatsApp inválido ou inexistente.";
      } else if (sendResult.status === 401 || sendResult.status === 403) {
        userMsg = "Credenciais do WhatsApp inválidas. Verifique a configuração da instância.";
      }

      return new Response(
        JSON.stringify({ error: userMsg, details: errorBody.slice(0, 200), status: sendResult.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const providerMessageId = sendResult.messageId;
    if (!providerMessageId) throw new Error("Evolution accepted a message without an identifier");

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

    console.log(`[send-now] Accepted ${providerMessageId.slice(0, 8)} for ${cleanPhone.slice(0, 4)}****`);

    return new Response(
      JSON.stringify({ success: true, message_id: providerMessageId }),
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
