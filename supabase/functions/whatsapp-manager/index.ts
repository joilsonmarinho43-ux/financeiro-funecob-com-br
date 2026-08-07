import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Resolve the real API base URL: prefer the raw IP/port stored in global_settings
 *  over any HTTPS domain that may cause TLS handshake issues with self-signed certs. */
function resolveApiUrl(instanceUrl: string | null, globalHost: string | null): string {
  const url = (instanceUrl || globalHost || "").replace(/\/$/, "");
  return url;
}

const PIX_WEBHOOK_EVENTS = ["MESSAGES_UPSERT"];

function webhookPayloads(targetUrl: string) {
  const flat = {
    url: targetUrl,
    enabled: true,
    webhookByEvents: false,
    webhookBase64: true,
    events: PIX_WEBHOOK_EVENTS,
  };
  return [
    flat,
    { webhook: flat },
    {
      webhook: {
        enabled: true,
        url: targetUrl,
        byEvents: false,
        base64: true,
        events: PIX_WEBHOOK_EVENTS,
      },
    },
  ];
}

function normalizeEventName(event: string) {
  return String(event || "").toLowerCase().replace(/_/g, ".");
}

function asArray<T = any>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function extractQrCode(payload: any): string | null {
  const candidates = [
    payload?.base64,
    payload?.qrcode?.base64,
    payload?.qrcode?.code,
    payload?.qrcode?.qrCode,
    payload?.qrcode,
    payload?.code,
    payload?.qrCode,
    // NOTA: pairingCode NÃO entra aqui — é um código de 8 dígitos, não um QR.
    payload?.data?.base64,
    payload?.data?.qrcode?.base64,
    payload?.data?.qrcode?.code,
    payload?.data?.qrcode,
    payload?.data?.code,
    payload?.data?.qrCode,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

function responseShape(payload: any) {
  if (!payload || typeof payload !== "object") return { type: typeof payload };
  const shape: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") shape[key] = value.length > 80 ? `string(${value.length})` : "string";
    else if (Array.isArray(value)) shape[key] = `array(${value.length})`;
    else if (value && typeof value === "object") shape[key] = Object.keys(value as Record<string, unknown>);
    else shape[key] = typeof value;
  }
  return shape;
}

function extractMessages(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.flatMap(extractMessages);
  if (payload.key || payload.messageType || payload.message) return [payload];
  const candidates = [
    payload.messages,
    payload.data?.messages,
    payload.data,
    payload.rows,
    payload.result,
    payload.response,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function messageLooksLikeReceipt(msg: any): boolean {
  const m = msg?.message || msg;
  const caption =
    m?.imageMessage?.caption ||
    m?.documentMessage?.caption ||
    m?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    msg?.caption ||
    "";
  const text = m?.conversation || m?.extendedTextMessage?.text || msg?.text || "";
  const mime = m?.documentMessage?.mimetype || msg?.mimetype || "";
  const fileName = m?.documentMessage?.fileName || msg?.fileName || "";
  const hasImage = !!m?.imageMessage || msg?.messageType === "imageMessage";
  const hasPdf = mime === "application/pdf" || String(fileName).toLowerCase().endsWith(".pdf");
  const t = `${caption} ${text}`.toLowerCase();
  return hasImage || hasPdf || /pix|comprovante|transfer[eê]ncia|pagamento|recibo|r\$\s*\d/i.test(t);
}

async function fetchRecentMessages(apiCall: (url: string, options: RequestInit) => Promise<Response>, baseUrl: string, apiKey: string, instanceName: string, hours: number) {
  const since = Date.now() - Math.max(1, hours) * 60 * 60 * 1000;
  const attempts = [
    { path: `/chat/findMessages/${encodeURIComponent(instanceName)}`, body: { where: { messageTimestamp: { gte: Math.floor(since / 1000) } }, limit: 100 } },
    { path: `/chat/findMessages/${encodeURIComponent(instanceName)}`, body: { limit: 100 } },
    { path: `/chat/findChats/${encodeURIComponent(instanceName)}`, body: { limit: 100 } },
  ];
  const details: any[] = [];
  for (const a of attempts) {
    try {
      const res = await apiCall(`${baseUrl}${a.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(a.body),
      });
      const text = await res.text();
      details.push({ path: a.path, status: res.status, ok: res.ok, body: text.slice(0, 200) });
      if (!res.ok) continue;
      const json = text ? JSON.parse(text) : null;
      const messages = extractMessages(json).filter((m: any) => {
        const ts = Number(m?.messageTimestamp || m?.timestamp || m?.createdAt || 0);
        const ms = ts > 0 && ts < 10_000_000_000 ? ts * 1000 : ts;
        return !ms || ms >= since;
      });
      if (messages.length > 0) return { messages, details };
    } catch (e) {
      details.push({ path: a.path, ok: false, error: String(e instanceof Error ? e.message : e) });
    }
  }
  return { messages: [], details };
}

async function ensurePixWebhook(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  targetUrl: string,
  apiCall: (url: string, options: RequestInit) => Promise<Response>,
) {
  const base = apiUrl.replace(/\/$/, "");
  const attempts: any[] = [];
  for (const payload of webhookPayloads(targetUrl)) {
    const resp = await apiCall(`${base}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    attempts.push({ ok: resp.ok, status: resp.status, body: text.slice(0, 300), shape: payload.webhook ? "nested" : "flat" });
    if (resp.ok) return { ok: true, attempts };
  }
  return { ok: false, attempts };
}

async function requestQrCode(
  apiCall: (url: string, options: RequestInit) => Promise<Response>,
  baseUrl: string,
  apiKey: string,
  instanceName: string,
) {
  const url = `${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`;
  const maskedKey = apiKey.length > 4 ? `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}` : "***";
  console.log(`[whatsapp-manager] QR REQUEST url=${url} instance=${instanceName} key=${maskedKey}`);

  const qrResp = await apiCall(url, { method: "GET", headers: { apikey: apiKey } });
  const text = await qrResp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  const qrCode = qrResp.ok ? extractQrCode(data) : null;

  console.log(
    `[whatsapp-manager] QR RESPONSE instance=${instanceName} status=${qrResp.status} shape=${
      JSON.stringify(responseShape(data))
    } has_base64=${typeof data?.base64 === "string"} has_code=${typeof data?.code === "string"} qr_len=${
      qrCode ? qrCode.length : 0
    } body=${text.slice(0, 200)}`,
  );

  return {
    ok: qrResp.ok,
    status: qrResp.status,
    data,
    qrCode,
    body: text.slice(0, 300),
  };
}


async function createEvolutionInstance(
  apiCall: (url: string, options: RequestInit) => Promise<Response>,
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  webhookUrl: string,
) {
  const resp = await apiCall(`${baseUrl}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: webhookUrl,
      webhookByEvents: false,
      webhookBase64: true,
      webhookEvents: PIX_WEBHOOK_EVENTS,
    }),
  });
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: resp.ok, status: resp.status, data, qrCode: extractQrCode(data), body: text.slice(0, 300) };
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, instance_id, instance_name, organization_id } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get global API settings
    const { data: globalSettings } = await supabase
      .from("global_settings")
      .select("key, value")
      .in("key", ["api_host", "global_api_key", "webhook_url"]);

    const gs: Record<string, string> = {};
    (globalSettings || []).forEach((s: any) => { gs[s.key] = s.value; });

    const apiHost = gs.api_host;
    const globalApiKey = gs.global_api_key;
    const pixWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

    if (!apiHost || !globalApiKey) {
      return new Response(JSON.stringify({ 
        error: "API de WhatsApp não configurada. Vá em Configurações Globais e preencha o API Host e a Global API Key." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = apiHost.replace(/\/$/, "");

    // Helper to make API calls with error handling
    async function apiCall(url: string, options: RequestInit): Promise<Response> {
      try {
        return await fetch(url, options);
      } catch (e) {
        console.error(`[whatsapp-manager] API call failed to ${url}:`, e);
        // If HTTPS fails, try HTTP fallback
        if (url.startsWith("https://")) {
          const httpUrl = url.replace("https://", "http://");
          console.log(`[whatsapp-manager] Retrying with HTTP: ${httpUrl}`);
          return await fetch(httpUrl, options);
        }
        throw e;
      }
    }

    // ─── CREATE INSTANCE ───
    if (action === "create_instance") {
      if (!instance_name || !organization_id) {
        return new Response(JSON.stringify({ error: "instance_name and organization_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Evolution identifica a sessão pelo nome no servidor, não pela organização.
      // Reutilizar o mesmo nome faria duas empresas controlarem a mesma sessão.
      const { data: conflictingInstance } = await supabase
        .from("whatsapp_instances")
        .select("id, organization_id")
        .ilike("name", instance_name)
        .neq("organization_id", organization_id)
        .limit(1)
        .maybeSingle();
      if (conflictingInstance) {
        return new Response(JSON.stringify({
          error: "Este nome de instância já está em uso. Escolha um nome exclusivo para esta empresa.",
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const created = await createEvolutionInstance(apiCall, baseUrl, globalApiKey, instance_name, pixWebhookUrl);

      if (!created.ok) {
        console.error("API create error:", created.body);
        if (!created.body.includes("already") && !created.body.includes("exists")) {
          return new Response(JSON.stringify({ error: `Erro ao criar instância: ${created.status} - ${created.body}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Save instance in DB
      const { data: dbInstance, error: dbErr } = await supabase
        .from("whatsapp_instances")
        .insert({
          organization_id,
          name: instance_name,
          api_url: baseUrl,
          api_key: globalApiKey,
          status: "pairing",
        })
        .select()
        .single();

      if (dbErr) {
        return new Response(JSON.stringify({ error: dbErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const wh = await ensurePixWebhook(baseUrl, globalApiKey, instance_name, pixWebhookUrl, apiCall);
        await supabase.from("global_settings").upsert({
          key: "webhook_url",
          value: pixWebhookUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
        if (!wh.ok) {
          await supabase.from("system_logs").insert({
            action: "whatsapp_pix_webhook_config_failed",
            organization_id,
            details: { instance_name, attempts: wh.attempts },
          });
        }
      } catch (e) {
        console.error("PIX webhook setup failed:", e);
        await supabase.from("system_logs").insert({
          action: "whatsapp_pix_webhook_config_error",
          organization_id,
          details: { instance_name, error: String(e instanceof Error ? e.message : e) },
        });
      }

      // Get QR code
      let qrCode = created.qrCode;
      if (!qrCode) {
        try {
          const qr = await requestQrCode(apiCall, baseUrl, globalApiKey, instance_name);
          qrCode = qr.qrCode;
        } catch (e) {
          console.error("QR fetch error:", e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        instance_id: dbInstance.id,
        instance_name,
        qr_code: qrCode,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET QR CODE ───
    if (action === "get_qr") {
      if (!instance_id) {
        return new Response(JSON.stringify({ error: "instance_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instance_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;

      // A Evolution devolve o MESMO QR (já expirado) enquanto a instância está
      // presa em "connecting". Isso faz o WhatsApp mostrar "não foi possível conectar".
      // Então: se não estiver "open", derruba a sessão pendente antes de pedir o QR.
      let freshSession = false;
      try {
        const stateResp = await apiCall(`${instApiUrl}/instance/connectionState/${encodeURIComponent(inst.name)}`, {
          method: "GET",
          headers: { apikey: instApiKey },
        });
        const stateText = await stateResp.text();
        let stateData: any = null;
        try { stateData = stateText ? JSON.parse(stateText) : null; } catch { /* ignore */ }
        const state = stateData?.instance?.state || stateData?.state || "";
        if (state !== "open" && state !== "connected") {
          await apiCall(`${instApiUrl}/instance/logout/${encodeURIComponent(inst.name)}`, {
            method: "DELETE",
            headers: { apikey: instApiKey },
          }).catch(() => null);
          await new Promise((r) => setTimeout(r, 1500));
          freshSession = true;
        }
      } catch (e) {
        console.warn("[whatsapp-manager] state/logout pre-check failed", String(e));
      }

      const qr = await requestQrCode(apiCall, instApiUrl, instApiKey, inst.name);

      if (!qr.ok) {
        return new Response(JSON.stringify({ error: `Erro ao obter QR: ${qr.body}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const qrCode = qr.qrCode;

      if (!qrCode) {
        console.warn("[whatsapp-manager] QR not returned", {
          instance: inst.name,
          status: qr.status,
          shape: responseShape(qr.data),
        });
      }

      await supabase.from("whatsapp_instances").update({ status: "pairing" }).eq("id", instance_id);

      return new Response(JSON.stringify({
        success: true,
        qr_code: qrCode,
        instance_name: inst.name,
        status: qrCode ? "pairing" : "qr_unavailable",
        diagnostic: qrCode ? null : "A Evolution API respondeu sem QR Code. A instância pode estar travada em connecting/pairing; use reset_session ou reinicie a instância no servidor Evolution.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RESET STUCK SESSION ───
    if (action === "reset_session") {
      if (!instance_id) {
        return new Response(JSON.stringify({ error: "instance_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instance_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;
      const attempts: any[] = [];

      for (const step of [
        { label: "restart-put", method: "PUT", path: `/instance/restart/${encodeURIComponent(inst.name)}` },
        { label: "restart-post", method: "POST", path: `/instance/restart/${encodeURIComponent(inst.name)}` },
        { label: "logout-delete", method: "DELETE", path: `/instance/logout/${encodeURIComponent(inst.name)}` },
        { label: "delete-delete", method: "DELETE", path: `/instance/delete/${encodeURIComponent(inst.name)}` },
        { label: "delete-delete-force", method: "DELETE", path: `/instance/delete/${encodeURIComponent(inst.name)}?force=true` },
      ]) {
        try {
          const resp = await apiCall(`${instApiUrl}${step.path}`, { method: step.method, headers: { "Content-Type": "application/json", apikey: instApiKey } });
          const text = await resp.text();
          attempts.push({ step: step.label, ok: resp.ok, status: resp.status, body: text.slice(0, 200) });
        } catch (e) {
          attempts.push({ step: step.label, ok: false, error: String(e instanceof Error ? e.message : e) });
        }
      }

      const created = await createEvolutionInstance(apiCall, instApiUrl, instApiKey, inst.name, pixWebhookUrl);
      attempts.push({ step: "create", ok: created.ok, status: created.status, body: created.body, has_qr: !!created.qrCode });

      let qrCode = created.qrCode;
      if (!qrCode) {
        const qr = await requestQrCode(apiCall, instApiUrl, instApiKey, inst.name);
        attempts.push({ step: "connect", ok: qr.ok, status: qr.status, body: qr.body, has_qr: !!qr.qrCode, shape: responseShape(qr.data) });
        qrCode = qr.qrCode;
      }

      await supabase.from("whatsapp_instances").update({ status: qrCode ? "pairing" : "disconnected" }).eq("id", instance_id);
      await supabase.from("system_logs").insert({
        action: "whatsapp_instance_session_reset",
        organization_id: inst.organization_id,
        details: { instance_name: inst.name, attempts, has_qr: !!qrCode },
      });

      return new Response(JSON.stringify({
        success: true,
        instance_name: inst.name,
        qr_code: qrCode,
        attempts,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CHECK STATUS ───
    if (action === "check_status") {
      if (!instance_id) {
        return new Response(JSON.stringify({ error: "instance_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instance_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;

      let statusResp: Response;
      try {
        statusResp = await apiCall(`${instApiUrl}/instance/connectionState/${inst.name}`, {
          method: "GET",
          headers: { apikey: instApiKey },
        });
      } catch {
        await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", instance_id);
        return new Response(JSON.stringify({ 
          success: true, status: "disconnected", instance_name: inst.name,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!statusResp.ok) {
        return new Response(JSON.stringify({ 
          success: true, status: "disconnected", instance_name: inst.name,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const statusData = await statusResp.json();
      const state = statusData?.instance?.state || statusData?.state || "disconnected";

      let mappedStatus = "disconnected";
      if (state === "open" || state === "connected") mappedStatus = "connected";
      else if (state === "connecting" || state === "qrcode") mappedStatus = "pairing";

      // Keep only one authoritative connection for the same routing slot.
      // Main instances compete only with other main instances; collector
      // instances compete only with the same collector, preserving multi-instance routing.
      if (mappedStatus === "connected") {
        let staleQuery = supabase
          .from("whatsapp_instances")
          .update({ status: "disconnected" })
          .eq("organization_id", inst.organization_id)
          .eq("status", "connected")
          .neq("id", instance_id);
        staleQuery = inst.collector_id
          ? staleQuery.eq("collector_id", inst.collector_id)
          : staleQuery.is("collector_id", null);
        await staleQuery;
      }

      await supabase
        .from("whatsapp_instances")
        .update({ status: mappedStatus, updated_at: new Date().toISOString() })
        .eq("id", instance_id);

      // Connected instances must always point to the PIX OCR webhook. This
      // self-heals older instances that were created before the webhook fix.
      if (mappedStatus === "connected") {
        try {
          const wh = await ensurePixWebhook(instApiUrl, instApiKey, inst.name, pixWebhookUrl, apiCall);
          await supabase.from("global_settings").upsert({
            key: "webhook_url",
            value: pixWebhookUrl,
            updated_at: new Date().toISOString(),
          }, { onConflict: "key" });
          if (!wh.ok) {
            await supabase.from("system_logs").insert({
              action: "whatsapp_pix_webhook_config_failed",
              organization_id: inst.organization_id,
              details: { instance_name: inst.name, attempts: wh.attempts },
            });
          }
        } catch (e) {
          console.error("PIX webhook self-heal failed:", e);
          await supabase.from("system_logs").insert({
            action: "whatsapp_pix_webhook_config_error",
            organization_id: inst.organization_id,
            details: { instance_name: inst.name, error: String(e instanceof Error ? e.message : e) },
          });
        }
      }

      return new Response(JSON.stringify({
        success: true, status: mappedStatus, raw_state: state, instance_name: inst.name,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RESTART CONNECTION WITHOUT LOSING PAIRING ───
    if (action === "restart_connection") {
      if (!instance_id) {
        return new Response(JSON.stringify({ error: "instance_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instance_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;
      const restart = await apiCall(`${instApiUrl}/instance/restart/${encodeURIComponent(inst.name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: instApiKey },
      });
      const restartBody = await restart.text();

      if (!restart.ok) {
        return new Response(JSON.stringify({ error: "Falha ao reiniciar a conexão", status: restart.status, details: restartBody.slice(0, 200) }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let state = "restarting";
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          const stateResponse = await apiCall(`${instApiUrl}/instance/connectionState/${encodeURIComponent(inst.name)}`, {
            method: "GET",
            headers: { apikey: instApiKey },
          });
          const statePayload = await stateResponse.json().catch(() => null);
          state = statePayload?.instance?.state || statePayload?.state || "restarting";
          if (state === "open" || state === "connected") break;
        } catch { /* keep polling */ }
      }

      const mappedStatus = state === "open" || state === "connected" ? "connected" : "disconnected";
      await supabase.from("whatsapp_instances").update({ status: mappedStatus }).eq("id", instance_id);
      await supabase.from("system_logs").insert({
        action: "whatsapp_connection_restarted",
        organization_id: inst.organization_id,
        details: { instance_name: inst.name, final_state: state },
      });

      return new Response(JSON.stringify({ success: mappedStatus === "connected", instance_name: inst.name, status: mappedStatus, raw_state: state }), {
        status: mappedStatus === "connected" ? 200 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELIVERY DIAGNOSTIC ───
    if (action === "diagnose_delivery") {
      if (!instance_id) {
        return new Response(JSON.stringify({ error: "instance_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instance_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;
      const checks: Record<string, unknown> = {};

      for (const check of [
        { name: "connection", method: "GET", path: `/instance/connectionState/${encodeURIComponent(inst.name)}` },
        { name: "instance", method: "GET", path: `/instance/fetchInstances?instanceName=${encodeURIComponent(inst.name)}` },
        { name: "recent_messages", method: "POST", path: `/chat/findMessages/${encodeURIComponent(inst.name)}`, body: { limit: 20 } },
      ]) {
        try {
          const response = await apiCall(`${instApiUrl}${check.path}`, {
            method: check.method,
            headers: { "Content-Type": "application/json", apikey: instApiKey },
            body: check.body ? JSON.stringify(check.body) : undefined,
          });
          const text = await response.text();
          let payload: any = null;
          try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }

          if (check.name === "recent_messages") {
            const messages = extractMessages(payload).slice(0, 20).map((message: any) => ({
              id: message?.key?.id || message?.messageId || message?.id || null,
              from_me: message?.key?.fromMe ?? null,
              status: message?.status || message?.messageStatus || message?.deliveryStatus || null,
              timestamp: message?.messageTimestamp || message?.timestamp || message?.createdAt || null,
            }));
            checks[check.name] = { ok: response.ok, status: response.status, messages };
          } else {
            checks[check.name] = { ok: response.ok, status: response.status, payload };
          }
        } catch (error) {
          checks[check.name] = { ok: false, error: String(error instanceof Error ? error.message : error) };
        }
      }

      return new Response(JSON.stringify({ success: true, instance_name: inst.name, checks }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RECOVER MISSED PIX RECEIPTS ───
    if (action === "recover_pix_receipts") {
      const hours = Number(body.hours || 24);
      const targetInstances = instance_id
        ? (await supabase.from("whatsapp_instances").select("*").eq("id", instance_id)).data || []
        : (await supabase.from("whatsapp_instances").select("*").eq("organization_id", organization_id)).data || [];

      const results: any[] = [];
      for (const inst of targetInstances || []) {
        const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
        const instApiKey = inst.api_key || globalApiKey;
        const wh = await ensurePixWebhook(instApiUrl, instApiKey, inst.name, pixWebhookUrl, apiCall);
        const { messages, details } = await fetchRecentMessages(apiCall, instApiUrl.replace(/\/$/, ""), instApiKey, inst.name, hours);
        let forwarded = 0;
        let skippedExisting = 0;
        let candidates = 0;
        for (const msg of messages) {
          if (!messageLooksLikeReceipt(msg)) continue;
          candidates++;
          const key = msg.key || msg.message?.key || {};
          const id = key.id || msg.messageId || msg.id || null;
          if (id) {
            const { data: existing } = await supabase
              .from("auto_settlement_events")
              .select("id, status")
              .eq("organization_id", inst.organization_id)
              .eq("whatsapp_message_id", id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existing?.id && !body.force_reprocess) { skippedExisting++; continue; }
          }

          const payload = { event: "messages.upsert", instance: inst.name, data: msg, force_reprocess: !!body.force_reprocess };
          const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
            body: JSON.stringify(payload),
          });
          forwarded += res.ok ? 1 : 0;
        }
        await supabase.from("system_logs").insert({
          action: "whatsapp_pix_receipt_recovery",
          organization_id: inst.organization_id,
          details: { instance_name: inst.name, hours, webhook: wh, fetched: messages.length, candidates, forwarded, skippedExisting, fetch_attempts: details },
        });
        results.push({ instance: inst.name, webhook_ok: wh.ok, fetched: messages.length, candidates, forwarded, skippedExisting, fetch_attempts: details });
      }

      return new Response(JSON.stringify({ success: true, hours, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DISCONNECT ───
    if (action === "disconnect") {
      if (!instance_id) {
        return new Response(JSON.stringify({ error: "instance_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instance_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instApiUrl = resolveApiUrl(inst.api_url, apiHost);
      const instApiKey = inst.api_key || globalApiKey;

      try {
        await apiCall(`${instApiUrl}/instance/logout/${inst.name}`, {
          method: "DELETE",
          headers: { apikey: instApiKey },
        });
      } catch (e) {
        console.error("Logout error:", e);
      }

      await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", instance_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("WhatsApp manager error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
