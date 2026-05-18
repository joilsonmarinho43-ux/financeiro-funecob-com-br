// Registers the whatsapp-webhook URL on each Evolution API instance
// so that incoming PIX receipts actually reach the PIX OCR motor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const WEBHOOK_TARGET = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

async function setWebhook(apiUrl: string, apiKey: string, instance: string) {
  const base = apiUrl.replace(/\/$/, "");
  const payload = {
    webhook: {
      enabled: true,
      url: WEBHOOK_TARGET,
      webhookByEvents: false,
      webhookBase64: true,
      events: ["MESSAGES_UPSERT"],
    },
  };
  // Evolution v2 endpoint
  const res = await fetch(`${base}/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 400) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: gs } = await supabase
      .from("global_settings").select("key,value")
      .in("key", ["api_host", "global_api_key"]);
    const gmap: Record<string, string> = {};
    (gs || []).forEach((s: any) => { gmap[s.key] = s.value; });

    const { data: instances } = await supabase
      .from("whatsapp_instances")
      .select("id, name, api_url, api_key, status, organization_id");

    const results: any[] = [];
    for (const inst of instances || []) {
      const apiUrl = inst.api_url || gmap.api_host || "";
      const apiKey = inst.api_key || gmap.global_api_key || "";
      if (!apiUrl || !apiKey) {
        results.push({ instance: inst.name, ok: false, error: "missing api creds" });
        continue;
      }
      try {
        const r = await setWebhook(apiUrl, apiKey, inst.name);
        results.push({ instance: inst.name, ...r });
      } catch (e: any) {
        results.push({ instance: inst.name, ok: false, error: String(e?.message || e) });
      }
    }

    return new Response(JSON.stringify({
      webhook_url: WEBHOOK_TARGET,
      total: results.length,
      ok: results.filter(r => r.ok).length,
      results,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
