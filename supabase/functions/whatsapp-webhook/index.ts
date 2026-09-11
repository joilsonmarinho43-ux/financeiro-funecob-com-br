// WhatsApp Webhook → PIX OCR Auto-Settlement
// Receives Evolution API events (messages.upsert) and forwards PIX receipts
// to pix-ocr-settlement. Decoupled — never touches existing billing logic.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Evolution API: fallback por variáveis de ambiente (VPS própria) ---
// Precedência: whatsapp_instances > global_settings > ENV.
function envEvolutionUrl(): string {
  return (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
}
function envEvolutionKey(): string {
  return Deno.env.get("EVOLUTION_API_KEY") || "";
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Detects PIX-related keywords in text/caption to filter only receipt-like messages
const PIX_KEYWORDS = [
  "pix", "comprovante", "transfer", "transferência", "transferencia",
  "enviado", "pagamento", "pago", "recibo",
];
function looksLikePix(text: string): boolean {
  const t = (text || "").toLowerCase();
  return PIX_KEYWORDS.some((k) => t.includes(k));
}

// Extract amount from text like "R$ 44,00" or "R$44.00"
function extractAmountFromText(text: string): number | null {
  if (!text) return null;
  const m = text.match(/r\$?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:[,.][0-9]{2}))/i);
  if (!m) return null;
  const raw = m[1].replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
  const v = parseFloat(raw);
  return isNaN(v) ? null : v;
}

function normalizeEventName(event: string) {
  return String(event || "").toLowerCase().replace(/_/g, ".");
}

function asArray<T = any>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function jidToDigits(j: any): string {
  if (!j || typeof j !== "string") return "";
  return j.split("@")[0].replace(/:\d+$/, "").replace(/\D/g, "");
}

function looksLikeBrazilianPhone(d: string): boolean {
  const n = String(d || "").replace(/\D/g, "").replace(/^55/, "");
  // DDD + fixo/celular. Reject long Baileys/LID identifiers.
  return n.length === 10 || n.length === 11;
}

async function logWebhookReceipt(supabase: any, organizationId: string, event: string, payload: any, responseStatus = 200, responseBody = "received") {
  try {
    await supabase.from("webhook_logs").insert({
      organization_id: organizationId,
      event,
      payload,
      response_status: responseStatus,
      response_body: responseBody,
    });
  } catch (e) {
    console.warn("[wa-webhook] failed to persist webhook_logs", e);
  }
}

async function logAutoSettlement(supabase: any, organizationId: string, action: string, details: Record<string, any>) {
  try {
    await supabase.from("auto_settlement_logs").insert({
      organization_id: organizationId,
      action,
      details,
    });
  } catch (e) {
    console.warn(`[wa-webhook] failed to log ${action}`, e);
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function createFallbackEvent(supabase: any, body: any, status: string, errorMessage: string) {
  if (!body?.organization_id || !body?.phone) return null;

  const txid = body.manual_txid || (body.message_id ? `WA-MSG-${body.message_id}` : null);

  try {
    if (body.message_id) {
      const { data: existing } = await supabase
        .from("auto_settlement_events")
        .select("id")
        .eq("organization_id", body.organization_id)
        .eq("whatsapp_message_id", body.message_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) return existing.id;
    }

    const { data, error } = await supabase.from("auto_settlement_events").insert({
      organization_id: body.organization_id,
      phone: body.phone,
      raw_text: body.raw_text || null,
      ocr_payload: {
        push_name: body.push_name || null,
        webhook_error: errorMessage,
        media_mime_type: body.media_mime_type || null,
        receipt_hint: !!body.receipt_hint,
      },
      txid,
      amount_detected: body.manual_amount || extractAmountFromText(body.raw_text || "") || null,
      whatsapp_message_id: body.message_id || null,
      status,
      error_message: errorMessage,
    }).select("id").single();

    if (error) throw error;
    await logAutoSettlement(supabase, body.organization_id, "webhook_fallback_event_created", {
      event_id: data?.id,
      message_id: body.message_id || null,
      error: errorMessage,
    });
    return data?.id || null;
  } catch (e) {
    console.error("[wa-webhook] fallback event insert failed", e);
    return null;
  }
}

// Fetch base64 of media from Evolution API
async function fetchMediaBase64(
  apiUrl: string, apiKey: string, instance: string, messageObj: any
): Promise<string | null> {
  try {
    const url = `${apiUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instance}`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ message: messageObj, convertToMp4: false }),
    }, 8000);
    if (!res.ok) {
      console.error("[wa-webhook] media fetch failed", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.base64 || data.data?.base64 || null;
  } catch (e) {
    console.error("[wa-webhook] media fetch error", e);
    return null;
  }
}

// Resolve @lid → real phone via Evolution API.
// Phase 1: Evolution v1.6.0 + Baileys 6.5.0 frequently store LIDs of unsaved
// contacts using the "@s.whatsapp.net" suffix instead of "@lid". We therefore
// try BOTH suffixes in every endpoint, and add /chat/findMessages as a final
// fallback to inspect recent messages for a senderPn/participantPn.
async function resolveLidToPhone(
  apiUrl: string, apiKey: string, instance: string, lid: string
): Promise<{ phone: string | null; endpoint: string | null }> {
  if (!apiUrl || !apiKey || !lid) return { phone: null, endpoint: null };
  const base = apiUrl.replace(/\/$/, "");
  const lidJidLid = `${lid}@lid`;
  const lidJidWa = `${lid}@s.whatsapp.net`;

  const tryExtractFromList = (list: any[]): string | null => {
    for (const c of list || []) {
      // Some Evolution endpoints ignore unsupported filters and return the
      // whole contacts table. Never accept the first phone blindly; the record
      // must mention the requested LID in one of its identifiers.
      const recordText = JSON.stringify(c || {}).replace(/\D/g, "");
      if (!recordText.includes(lid)) continue;

      const fields = [
        c?.remoteJid, c?.jid, c?.wuid, c?.number, c?.phoneNumber, c?.phone,
        c?.participant, c?.participantPn, c?.remoteJidAlt, c?.senderPn,
        c?.key?.senderPn, c?.key?.participantPn, c?.key?.remoteJidAlt,
      ];
      for (const f of fields) {
        if (typeof f !== "string") continue;
        const jid = f.includes("@") ? f : `${f}@s.whatsapp.net`;
        if (jid.endsWith("@s.whatsapp.net")) {
          const digits = jid.split("@")[0].replace(/\D/g, "");
          if (digits !== lid && looksLikeBrazilianPhone(digits)) return digits;
        }
      }
    }
    return null;
  };

  // 1) findContacts — try both @lid and @s.whatsapp.net suffixes
  for (const body of [
    { where: { lid: lidJidLid } },
    { where: { remoteJid: lidJidLid } },
    { where: { id: lidJidLid } },
    { where: { remoteJid: lidJidWa } },
    { where: { id: lidJidWa } },
    { where: { remoteJid: lid } },
  ]) {
    try {
      const res = await fetchWithTimeout(`${base}/chat/findContacts/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(body),
      }, 1800);
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || data?.contacts || []);
      const found = tryExtractFromList(list);
      if (found) return { phone: found, endpoint: "findContacts" };
    } catch (e) { console.warn("[wa-webhook] findContacts error", e); }
  }

  // 2) whatsappNumbers
  try {
    const res = await fetchWithTimeout(`${base}/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ numbers: [lid, lidJidLid, lidJidWa] }),
    }, 1800);
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || []);
      const found = tryExtractFromList(list);
      if (found) return { phone: found, endpoint: "whatsappNumbers" };
    }
  } catch (e) { console.warn("[wa-webhook] whatsappNumbers error", e); }

  // 3) fetchProfile
  for (const num of [lidJidLid, lidJidWa, lid]) {
    try {
      const res = await fetchWithTimeout(`${base}/chat/fetchProfile/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: num }),
      }, 1800);
      if (!res.ok) continue;
      const data = await res.json();
      const found = tryExtractFromList([data, data?.data, data?.profile].filter(Boolean));
      if (found) return { phone: found, endpoint: "fetchProfile" };
    } catch (e) { console.warn("[wa-webhook] fetchProfile error", e); }
  }

  // 4) findChats — Evolution persists chats in store (DATABASE_SAVE_DATA_CHATS)
  for (const body of [
    { where: { remoteJid: lidJidLid } },
    { where: { remoteJid: lidJidWa } },
    { where: { id: lidJidLid } },
    { where: { id: lidJidWa } },
  ]) {
    try {
      const res = await fetchWithTimeout(`${base}/chat/findChats/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(body),
      }, 1800);
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || data?.chats || []);
      const found = tryExtractFromList(list);
      if (found) return { phone: found, endpoint: "findChats" };
    } catch (e) { console.warn("[wa-webhook] findChats error", e); }
  }

  // 5) findMessages — inspect recent messages of this chat for senderPn/participantPn.
  // Baileys 6.5.0 frequently exposes the real phone in message.key.senderPn even
  // when the chat itself is stored under @lid/@s.whatsapp.net with the LID id.
  for (const body of [
    { where: { key: { remoteJid: lidJidLid } }, limit: 20 },
    { where: { key: { remoteJid: lidJidWa } }, limit: 20 },
    { where: { keyRemoteJid: lidJidLid }, limit: 20 },
    { where: { keyRemoteJid: lidJidWa }, limit: 20 },
  ]) {
    try {
      const res = await fetchWithTimeout(`${base}/chat/findMessages/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(body),
      }, 2500);
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || data?.messages?.records || data?.messages || []);
      const found = tryExtractFromList(list);
      if (found) return { phone: found, endpoint: "findMessages" };
    } catch (e) { console.warn("[wa-webhook] findMessages error", e); }
  }

  return { phone: null, endpoint: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const expectedSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");

  // Shared-secret authentication is header-only. Never accept secrets in URLs.
  const getProvided = () =>
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-evolution-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  // Healthcheck / auth test endpoint — GET ?ping=1
  // Missing configuration is an error; never report an unauthenticated webhook as healthy.
  if (req.method === "GET" && url.searchParams.get("ping") === "1") {
    if (!expectedSecret) {
      return new Response(JSON.stringify({
        ok: false, auth: "misconfigured",
        message: "EVOLUTION_WEBHOOK_SECRET not configured",
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const provided = getProvided();
    const ok = provided === expectedSecret;
    console.log(JSON.stringify({
      tag: "wa-webhook",
      event: ok ? "webhook_auth_success" : "webhook_auth_failed",
      mode: "ping",
      ip: req.headers.get("x-forwarded-for") || "",
    }));
    return new Response(JSON.stringify({ ok, auth: ok ? "valid" : "invalid" }), {
      status: ok ? 200 : 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Shared-secret authentication is mandatory. Never allow an insecure escape hatch.
  if (!expectedSecret) {
    console.error(JSON.stringify({ tag: "wa-webhook", event: "webhook_secret_missing" }));
    return new Response(
      JSON.stringify({ error: "webhook não configurado: defina EVOLUTION_WEBHOOK_SECRET" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  {
    const provided = getProvided();
    if (provided !== expectedSecret) {
      console.warn(JSON.stringify({ tag: "wa-webhook", event: "webhook_auth_failed" }));
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventName = normalizeEventName(body?.event || body?.type || "");
  if (eventName !== "messages.upsert") {
    return new Response(JSON.stringify({ received: true, ignored: true, event: eventName || null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const instanceName = body?.instance || body?.instanceName || body?.data?.instance || "";
  const payload = body?.data || body?.payload || body;
  const msg = payload?.messages?.[0] || payload?.message || payload;

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    await handleMessage(supabase, payload, instanceName, msg);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wa-webhook] handler error", e);
    return new Response(JSON.stringify({ received: true, error: "internal handler error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleMessage(supabase: any, payload: any, instanceName: string, msg: any) {
  const key = msg?.key || msg?.message?.key || {};
  const remoteJid = key?.remoteJid || msg?.remoteJid || payload?.remoteJid || "";
  const messageId = key?.id || msg?.id || msg?.messageId || "";
  const pushName = msg?.pushName || msg?.push_name || payload?.pushName || "";
  const rawText = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || msg?.text || msg?.caption || "";
  const messageObj = msg?.message || msg;

  if (!instanceName || !remoteJid) return;

  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("id, organization_id, instance_name, api_url, api_key, webhook_enabled")
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (!instance?.organization_id) return;

  await logWebhookReceipt(supabase, instance.organization_id, "MESSAGES_UPSERT", {
    instance: instanceName,
    message_id: messageId,
    remote_jid: remoteJid,
    push_name: pushName,
    text: rawText,
  });

  const { data: flag } = await supabase
    .from("global_settings")
    .select("value")
    .eq("key", "auto_settlement_enabled")
    .maybeSingle();
  const autoEnabled = flag?.value === true || flag?.value === "true";
  if (!autoEnabled) return;

  const apiUrl = (instance.api_url || envEvolutionUrl()).replace(/\/+$/, "");
  const apiKey = instance.api_key || envEvolutionKey();
  const rawPhone = jidToDigits(remoteJid);
  let phone = looksLikeBrazilianPhone(rawPhone) ? rawPhone : "";
  let resolutionEndpoint: string | null = null;

  if (!phone && rawPhone) {
    const resolved = await resolveLidToPhone(apiUrl, apiKey, instanceName, rawPhone);
    phone = resolved.phone || "";
    resolutionEndpoint = resolved.endpoint;
  }

  if (!phone) {
    await logAutoSettlement(supabase, instance.organization_id, "webhook_unresolved_sender", {
      instance: instanceName,
      remote_jid: remoteJid,
      message_id: messageId,
      push_name: pushName,
      reason: "could_not_resolve_sender_phone",
    });
    return;
  }

  const receiptHint = looksLikePix(rawText);
  const hasMedia = !!(
    messageObj?.imageMessage ||
    messageObj?.documentMessage ||
    messageObj?.documentWithCaptionMessage?.message?.documentMessage ||
    messageObj?.imageMessage?.url ||
    messageObj?.documentMessage?.url
  );

  if (!receiptHint && !hasMedia) return;

  let mediaBase64: string | null = null;
  let mediaMimeType: string | null = null;
  if (hasMedia) {
    mediaMimeType =
      messageObj?.imageMessage?.mimetype ||
      messageObj?.documentMessage?.mimetype ||
      messageObj?.documentWithCaptionMessage?.message?.documentMessage?.mimetype ||
      null;
    mediaBase64 = await fetchMediaBase64(apiUrl, apiKey, instanceName, messageObj);
  }

  const body = {
    organization_id: instance.organization_id,
    phone,
    raw_text: rawText,
    push_name: pushName,
    media_base64: mediaBase64,
    media_mime_type: mediaMimeType,
    receipt_hint: receiptHint,
    message_id: messageId,
    instance_name: instanceName,
    remote_jid: remoteJid,
    lid_resolution_endpoint: resolutionEndpoint,
  };

  try {
    const baseUrl = SUPABASE_URL.replace(/\/$/, "");
    const res = await fetchWithTimeout(`${baseUrl}/functions/v1/pix-ocr-settlement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify(body),
    }, 12000);
    const t = await res.text();
    if (!res.ok) {
      console.error("[wa-webhook] pix-ocr-settlement failed", res.status, t.slice(0, 500));
      await createFallbackEvent(supabase, body, "erro", `pix-ocr-settlement retornou HTTP ${res.status}: ${t.slice(0, 200)}`);
    } else {
      await logAutoSettlement(supabase, instance.organization_id, "webhook_forwarded_to_pix_ocr", {
        message_id: messageId,
        remote_jid: remoteJid,
        phone,
        receipt_hint: receiptHint,
        has_media: hasMedia,
        resolution_endpoint: resolutionEndpoint,
        pix_ocr_response: t.slice(0, 500),
      });
    }
  } catch (e) {
    console.error("[wa-webhook] forward error", e);
    await createFallbackEvent(supabase, body, "erro", `falha ao encaminhar webhook para OCR: ${String((e as any)?.message || e)}`);
  }
}
