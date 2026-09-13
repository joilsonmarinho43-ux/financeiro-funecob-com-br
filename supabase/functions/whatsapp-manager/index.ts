import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Evolution API: fallback por variáveis de ambiente (VPS própria) ---
// Precedência: whatsapp_instances > global_settings > ENV.
function envEvolutionUrl(): string {
  return (Deno.env.get("EVOLUTION_API_URL") || Deno.env.get("EVOLUTION_URL") || "").trim();
}

function envEvolutionKey(): string {
  return (Deno.env.get("EVOLUTION_API_KEY") || Deno.env.get("EVOLUTION_GLOBAL_API_KEY") || "").trim();
}

function resolveApiUrl(instanceApiUrl: string | null | undefined, globalApiHost: string): string {
  const candidate = (instanceApiUrl || globalApiHost || envEvolutionUrl()).trim();
  return candidate.replace(/\/$/, "");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

function messageLooksLikeReceipt(msg: any): boolean {
  const text = [
    msg?.message?.conversation,
    msg?.message?.extendedTextMessage?.text,
    msg?.message?.imageMessage?.caption,
    msg?.message?.documentMessage?.caption,
    msg?.body,
    msg?.text,
  ].filter(Boolean).join(" ").toLowerCase();
  return /pix|pagamento|comprovante|transfer[êe]ncia|recebido|valor|r\$/.test(text) || !!msg?.message?.imageMessage || !!msg?.message?.documentMessage;
}

async function apiCall(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRecentMessages(apiCallFn: typeof apiCall, apiUrl: string, apiKey: string, instanceName: string, hours: number) {
  const attempts: any[] = [];
  const headers = { apikey: apiKey };
  const candidates = [
    `${apiUrl}/chat/findMessages/${instanceName}`,
    `${apiUrl}/chat/findMessages/${instanceName}?limit=100`,
  ];
  for (const url of candidates) {
    try {
      const res = await apiCallFn(url, { method: "GET", headers });
      const text = await res.text();
      attempts.push({ url, status: res.status, ok: res.ok });
      if (!res.ok) continue;
      let data: any;
      try { data = JSON.parse(text); } catch { continue; }
      const messages = Array.isArray(data) ? data : (data?.messages || data?.data || []);
      if (Array.isArray(messages)) {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        const filtered = messages.filter((m: any) => {
          const ts = Number(m?.messageTimestamp || m?.timestamp || m?.date || 0);
          return !ts || (ts < 10_000_000_000 ? ts * 1000 : ts) >= cutoff;
        });
        return { messages: filtered, details: attempts };
      }
    } catch (e) {
      attempts.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { messages: [], details: attempts };
}

async function ensurePixWebhook(apiUrl: string, apiKey: string, instanceName: string, webhookUrl: string, apiCallFn: typeof apiCall) {
  if (!webhookUrl) return { ok: false, error: "Webhook URL not configured" };
  try {
    const res = await apiCallFn(`${apiUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ enabled: true, url: webhookUrl, webhookByEvents: true, webhookEvents: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"] }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { action, instance_id, instance_name, organization_id } = body;

    // Service-role queries bypass RLS, so tenant authorization must be enforced here.
    const { data: callerOrgId, error: callerOrgErr } =
      await userClient.rpc("get_user_organization_id", {
        _user_id: user.id,
      });
    if (callerOrgErr || !callerOrgId) {
      return json({ error: "Organization not found for authenticated user" }, 403);
    }

    if (organization_id && organization_id !== callerOrgId) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: settings } = await supabase
      .from("global_settings")
      .select("key,value")
      .in("key", ["api_host", "global_api_key", "webhook_url"]);
    const settingsMap = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
    const apiHost = String(settingsMap.api_host || envEvolutionUrl()).trim();
    const globalApiKey = String(settingsMap.global_api_key || envEvolutionKey()).trim();
    const webhookUrl = String(settingsMap.webhook_url || `${supabaseUrl}/functions/v1/whatsapp-webhook`).trim();
    if (!apiHost || !globalApiKey) return json({ error: "Evolution API is not configured" }, 500);
    const baseUrl = apiHost.replace(/\/$/, "");

    if (action === "create_instance") {
      if (!instance_name || !organization_id) return json({ error: "instance_name and organization_id required" }, 400);
      if (organization_id !== callerOrgId) return json({ error: "Forbidden" }, 403);

      let createData: any = null;
      const createRes = await apiCall(`${baseUrl}/instance/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: globalApiKey },
        body: JSON.stringify({
          instanceName: instance_name,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: webhookUrl || undefined,
          webhookByEvents: true,
          webhookEvents: ["CONNECTION_UPDATE", "MESSAGES_UPSERT", "QRCODE_UPDATED"],
        }),
      });
      const createText = await createRes.text();
      if (!createRes.ok && !/already|exists/i.test(createText)) {
        return json({ error: "Failed to create Evolution instance", details: createText }, 500);
      }
      try { createData = createText ? JSON.parse(createText) : {}; } catch { createData = {}; }

      const { data: inserted, error: insertErr } = await supabase.from("whatsapp_instances").insert({
        organization_id: callerOrgId,
        name: instance_name,
        api_url: baseUrl,
        api_key: globalApiKey,
        status: "pairing",
      }).select("id,name,status").single();
      if (insertErr) return json({ error: "Failed to save WhatsApp instance", details: insertErr.message }, 500);

      let qr = createData?.qrcode?.base64 || createData?.base64 || createData?.qrcode || createData?.pairingCode || null;
      if (!qr) {
        try {
          const qrRes = await apiCall(`${baseUrl}/instance/connect/${encodeURIComponent(instance_name)}`, { method: "GET", headers: { apikey: globalApiKey } });
          const qrText = await qrRes.text();
          if (qrRes.ok) {
            try {
              const qrData = JSON.parse(qrText);
              qr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.qrcode || qrData?.pairingCode || null;
            } catch { qr = null; }
          }
        } catch { /* QR may be requested separately */ }
      }
      return json({ success: true, instance_id: inserted.id, instance: inserted, qr_code: qr });
    }

    if (action === "get_qr") {
      if (!instance_id) return json({ error: "instance_id required" }, 400);
      const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", instance_id).eq("organization_id", callerOrgId).single();
      if (!inst) return json({ error: "Instance not found" }, 404);
      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;
      const qrRes = await apiCall(`${instApiUrl}/instance/connect/${encodeURIComponent(inst.name)}`, { method: "GET", headers: { apikey: instApiKey } });
      const qrText = await qrRes.text();
      if (!qrRes.ok) return json({ error: "Failed to get QR code", details: qrText }, 502);
      let qrData: any = {};
      try { qrData = JSON.parse(qrText); } catch { /* handled below */ }
      const qr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.qrcode || qrData?.pairingCode || null;
      await supabase.from("whatsapp_instances").update({ status: "pairing" }).eq("id", instance_id).eq("organization_id", callerOrgId);
      return json({ success: true, qr_code: qr, raw: qrData });
    }

    if (action === "check_status") {
      if (!instance_id) return json({ error: "instance_id required" }, 400);
      const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", instance_id).eq("organization_id", callerOrgId).single();
      if (!inst) return json({ error: "Instance not found" }, 404);
      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;
      const stateRes = await apiCall(`${instApiUrl}/instance/connectionState/${encodeURIComponent(inst.name)}`, { method: "GET", headers: { apikey: instApiKey } });
      const stateText = await stateRes.text();
      if (!stateRes.ok) return json({ error: "Failed to check WhatsApp status", details: stateText }, 502);
      let stateData: any = {};
      try { stateData = JSON.parse(stateText); } catch { stateData = { raw: stateText }; }
      const state = String(stateData?.instance?.state || stateData?.state || stateData?.status || "").toLowerCase();
      const status = ["open", "connected"].includes(state) ? "connected" : ["connecting", "qrcode", "pairing"].includes(state) ? "pairing" : "disconnected";
      await supabase.from("whatsapp_instances").update({ status }).eq("id", instance_id).eq("organization_id", callerOrgId);
      return json({ success: true, status, raw: stateData });
    }

    if (action === "recover_pix_receipts") {
      const hours = Math.min(Math.max(Number(body.hours || 24), 1), 168);
      const results: any[] = [];
      let query = supabase.from("whatsapp_instances").select("*").eq("organization_id", callerOrgId);
      if (instance_id) query = query.eq("id", instance_id);
      const { data: instances, error: instErr } = await query;
      if (instErr) return json({ error: instErr.message }, 500);
      for (const inst of instances || []) {
        const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
        const instApiKey = inst.api_key || globalApiKey;
        const wh = await ensurePixWebhook(instApiUrl, instApiKey, inst.name, webhookUrl, apiCall);
        const { messages, details } = await fetchRecentMessages(apiCall, instApiUrl.replace(/\/$/, ""), instApiKey, inst.name, hours);
        let forwarded = 0, skippedExisting = 0, candidates = 0;
        for (const msg of messages) {
          if (!messageLooksLikeReceipt(msg)) continue;
          candidates++;
          const key = msg.key || msg.message?.key || {};
          const id = key.id || msg.messageId || msg.id || null;
          if (id) {
            const { data: existing } = await supabase.from("auto_settlement_events").select("id, status").eq("organization_id", inst.organization_id).eq("whatsapp_message_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (existing?.id && !body.force_reprocess) { skippedExisting++; continue; }
          }
          const payload = { event: "messages.upsert", instance: inst.name, data: msg, force_reprocess: !!body.force_reprocess };
          const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` }, body: JSON.stringify(payload) });
          forwarded += res.ok ? 1 : 0;
        }
        await supabase.from("system_logs").insert({ action: "whatsapp_pix_receipt_recovery", organization_id: inst.organization_id, details: { instance_name: inst.name, hours, webhook: wh, fetched: messages.length, candidates, forwarded, skippedExisting, fetch_attempts: details } });
        results.push({ instance: inst.name, webhook_ok: wh.ok, fetched: messages.length, candidates, forwarded, skippedExisting, fetch_attempts: details });
      }
      return json({ success: true, hours, results });
    }

    if (action === "disconnect") {
      if (!instance_id) return json({ error: "instance_id required" }, 400);
      const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", instance_id).eq("organization_id", callerOrgId).single();
      if (!inst) return json({ error: "Instance not found" }, 404);
      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;
      try { await apiCall(`${instApiUrl}/instance/logout/${inst.name}`, { method: "DELETE", headers: { apikey: instApiKey } }); } catch (e) { console.error("Logout error:", e); }
      await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", instance_id).eq("organization_id", callerOrgId);
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("WhatsApp manager error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
