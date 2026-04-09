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
    const { phone, message, organization_id, instance_id } = await req.json();

    if (!phone || !message || !organization_id) {
      return new Response(
        JSON.stringify({ error: "phone, message e organization_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    (globalSettings || []).forEach((s: any) => { gs[s.key] = s.value; });

    const VPS_FALLBACK = "http://161.97.181.130:8080";
    const VPS_KEY_FALLBACK = "123456";
    const apiUrl = (instance?.api_url || gs.api_host || VPS_FALLBACK).replace(/\/$/, "");
    const apiKey = instance?.api_key || gs.global_api_key || VPS_KEY_FALLBACK;
    const instanceName = instance?.name || gs.default_instance_name || "";

    if (!instanceName) {
      return new Response(
        JSON.stringify({ error: "Nenhuma instância WhatsApp configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanPhone = phone.replace(/\D/g, "");
    const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;

    console.log(`[send-now] Sending to ${cleanPhone.slice(0, 4)}**** via ${instanceName}`);

    const response = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: cleanPhone, textMessage: { text: message } }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[send-now] API error: ${response.status} - ${errorBody.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ error: `API ${response.status}: ${errorBody.slice(0, 200)}` }),
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
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
