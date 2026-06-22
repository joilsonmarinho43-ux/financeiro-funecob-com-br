// WhatsApp Webhook → PIX OCR Auto-Settlement
// Receives Evolution API events (messages.upsert) and forwards PIX receipts
// to pix-ocr-settlement. Decoupled — never touches existing billing logic.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

// Fetch base64 of media from Evolution API
async function fetchMediaBase64(
  apiUrl: string, apiKey: string, instance: string, messageObj: any
): Promise<string | null> {
  try {
    const url = `${apiUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instance}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ message: messageObj, convertToMp4: false }),
    });
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
// Tries findContacts → whatsappNumbers → fetchProfile → findChats.
// Returns { phone, endpoint } indicating which fallback succeeded.
async function resolveLidToPhone(
  apiUrl: string, apiKey: string, instance: string, lid: string
): Promise<{ phone: string | null; endpoint: string | null }> {
  if (!apiUrl || !apiKey || !lid) return { phone: null, endpoint: null };
  const base = apiUrl.replace(/\/$/, "");

  const tryExtractFromList = (list: any[]): string | null => {
    for (const c of list || []) {
      const fields = [c?.id, c?.remoteJid, c?.jid, c?.wuid, c?.number, c?.phoneNumber, c?.owner];
      for (const f of fields) {
        if (typeof f !== "string") continue;
        const jid = f.includes("@") ? f : `${f}@s.whatsapp.net`;
        if (jid.endsWith("@s.whatsapp.net")) {
          const digits = jid.split("@")[0].replace(/\D/g, "");
          if (digits.length >= 10 && digits.length <= 13) return digits;
        }
      }
    }
    return null;
  };

  // 1) findContacts — multiple where shapes
  for (const body of [
    { where: { lid: `${lid}@lid` } },
    { where: { remoteJid: `${lid}@lid` } },
    { where: { id: `${lid}@lid` } },
  ]) {
    try {
      const res = await fetch(`${base}/chat/findContacts/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || data?.contacts || []);
      const found = tryExtractFromList(list);
      if (found) return { phone: found, endpoint: "findContacts" };
    } catch (e) { console.warn("[wa-webhook] findContacts error", e); }
  }

  // 2) whatsappNumbers
  try {
    const res = await fetch(`${base}/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ numbers: [lid, `${lid}@lid`] }),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || []);
      const found = tryExtractFromList(list);
      if (found) return { phone: found, endpoint: "whatsappNumbers" };
    }
  } catch (e) { console.warn("[wa-webhook] whatsappNumbers error", e); }

  // 3) fetchProfile
  for (const num of [`${lid}@lid`, lid]) {
    try {
      const res = await fetch(`${base}/chat/fetchProfile/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: num }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const found = tryExtractFromList([data, data?.data, data?.profile].filter(Boolean));
      if (found) return { phone: found, endpoint: "fetchProfile" };
    } catch (e) { console.warn("[wa-webhook] fetchProfile error", e); }
  }

  // 4) findChats — Evolution persists chats in store (DATABASE_SAVE_DATA_CHATS)
  try {
    const res = await fetch(`${base}/chat/findChats/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ where: { remoteJid: `${lid}@lid` } }),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || data?.chats || []);
      const found = tryExtractFromList(list);
      if (found) return { phone: found, endpoint: "findChats" };
    }
  } catch (e) { console.warn("[wa-webhook] findChats error", e); }

  return { phone: null, endpoint: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const expectedSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");

  // Helper: extract provided secret from accepted headers (or ?secret= for GET test)
  const getProvided = () =>
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-evolution-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("secret") ||
    "";

  // Healthcheck / auth test endpoint — GET ?ping=1
  // Use to validate secret config before flipping Evolution to authenticated mode.
  if (req.method === "GET" && url.searchParams.get("ping") === "1") {
    if (!expectedSecret) {
      return new Response(JSON.stringify({
        ok: true, auth: "disabled",
        message: "EVOLUTION_WEBHOOK_SECRET not configured — webhook accepts all calls",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const provided = getProvided();
    const ok = provided === expectedSecret;
    console.log(JSON.stringify({
      tag: "wa-webhook",
      event: ok ? "webhook_auth_success" : "webhook_auth_failed",
      mode: "ping",
      ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
      ua: req.headers.get("user-agent") || null,
      provided_present: provided.length > 0,
    }));
    return new Response(JSON.stringify({
      ok, auth: "enabled",
      message: ok ? "secret matches" : "secret mismatch or missing",
    }), { status: ok ? 200 : 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Shared-secret authentication. If EVOLUTION_WEBHOOK_SECRET is set,
  // the webhook MUST include a matching header. Backward compatible: if the
  // env var is absent, the check is skipped, so existing Evolution installs
  // keep working until the secret is configured on both sides.
  if (expectedSecret) {
    const provided = getProvided();
    if (provided !== expectedSecret) {
      console.warn(JSON.stringify({
        tag: "wa-webhook",
        event: "webhook_auth_failed",
        ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
        ua: req.headers.get("user-agent") || null,
        provided_present: provided.length > 0,
      }));
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(JSON.stringify({
      tag: "wa-webhook",
      event: "webhook_auth_success",
      ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
    }));
  }


  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: corsHeaders }); }

  // ACK fast — Evolution doesn't retry forever
  const ack = new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  // Process async
  // @ts-ignore
  EdgeRuntime.waitUntil(handleEvent(payload).catch((e) => console.error("[wa-webhook] handle error", e)));
  return ack;
});

async function handleEvent(payload: any) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Evolution API v2 envelope: { event, instance, data: {...} }
  const event = payload?.event || payload?.type;
  const instanceName = payload?.instance || payload?.instanceName || payload?.data?.instance;
  if (!instanceName) { console.log("[wa-webhook] no instance"); return; }

  // Only process incoming messages
  if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") {
    return;
  }

  const msg = payload?.data || payload?.message || {};
  const key = msg.key || {};
  if (key.fromMe) return; // ignore our own sends

  const remoteJid: string = key.remoteJid || "";
  if (remoteJid.endsWith("@g.us")) return; // ignore groups

  // ===== Phone extraction tolerant to Evolution v2 @lid protocol =====
  // remoteJid may be "<phone>@s.whatsapp.net" (legacy) OR "<lid>@lid" (new).
  // Real phone often lives in: senderPn, remoteJidAlt, participantPn,
  // participantAlt, msg.pushName-related fields, or msg.contextInfo.
  // We collect all candidates and pick the first that LOOKS like a BR phone.
  function jidToDigits(j: any): string {
    if (!j || typeof j !== "string") return "";
    return j.split("@")[0].replace(/:\d+$/, "").replace(/\D/g, "");
  }
  function looksLikePhone(d: string): boolean {
    // BR phones: 10-13 digits. LIDs are typically 14-16.
    return d.length >= 10 && d.length <= 13;
  }
  const candidates: string[] = [
    jidToDigits(key.senderPn),
    jidToDigits(key.remoteJidAlt),
    jidToDigits(key.participantPn),
    jidToDigits(key.participantAlt),
    jidToDigits(key.participant),
    jidToDigits(msg?.senderPn),
    jidToDigits(msg?.participantPn),
    // remoteJid LAST — only if it's @s.whatsapp.net (not @lid)
    remoteJid.endsWith("@lid") ? "" : jidToDigits(remoteJid),
    // Absolute fallback — accept LID as last resort so we still log the event
    jidToDigits(remoteJid),
  ].filter(Boolean);

  let phone = candidates.find(looksLikePhone) || "";
  const isLidOnly = !phone && candidates.length > 0;
  if (!phone) phone = candidates[0]; // log the LID so admin sees the event
  if (!phone) return;

  if (isLidOnly) {
    console.log("[wa-webhook] only @lid available, phone may not match clients", {
      remoteJid, candidates,
    });
  }

  // Resolve instance → org + api creds
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("id, name, organization_id, api_url, api_key")
    .eq("name", instanceName)
    .maybeSingle();

  if (!instance?.organization_id) {
    console.log("[wa-webhook] instance not found", instanceName);
    return;
  }

  // Feature flag check (early exit — saves OCR credits)
  const { data: flag } = await supabase
    .from("global_settings").select("value").eq("key", "auto_settlement_enabled").maybeSingle();
  if (!flag || flag.value !== "true") return;

  const messageType: string = msg.messageType || "";
  const messageObj = msg.message || {};
  const caption: string = messageObj?.imageMessage?.caption ||
                          messageObj?.documentMessage?.caption || "";
  const textBody: string = messageObj?.conversation ||
                           messageObj?.extendedTextMessage?.text || "";

  // WhatsApp contact display name — used downstream to identify clients when
  // remoteJid is @lid and the OCR can't extract a sender_name from the image.
  const pushName: string = msg?.pushName || msg?.push_name || payload?.data?.pushName || "";

  const documentMime: string = messageObj?.documentMessage?.mimetype || "";
  const documentFileName: string = messageObj?.documentMessage?.fileName || "";
  const isImage = !!messageObj?.imageMessage || messageType === "imageMessage";
  const isDocImage = !!messageObj?.documentMessage && documentMime.startsWith("image/");
  const isPdf = !!messageObj?.documentMessage && (
    documentMime === "application/pdf" || documentFileName.toLowerCase().endsWith(".pdf")
  );

  // Decision: forward to PIX-OCR if (a) image with PIX-ish caption or no caption,
  // or (b) text mentioning PIX with an amount.
  const messageId = key.id || msg.messageId || crypto.randomUUID();

  // Resolve API creds (instance first, then global fallback)
  let apiUrl = instance.api_url || "";
  let apiKey = instance.api_key || "";
  if (!apiUrl || !apiKey) {
    const { data: gs } = await supabase
      .from("global_settings").select("key,value")
      .in("key", ["api_host", "global_api_key"]);
    const map: Record<string, string> = {};
    (gs || []).forEach((s: any) => { map[s.key] = s.value; });
    apiUrl = apiUrl || map.api_host || "";
    apiKey = apiKey || map.global_api_key || "";
  }

  // Se só temos o @lid, tenta resolver para telefone real.
  // Ordem: (1) cache whatsapp_lid_map → (2) Evolution API fallbacks.
  if (isLidOnly && apiUrl && apiKey) {
    const lidDigits = phone;
    const orgId = instance.organization_id;

    // ===== 1) Cache lookup =====
    let cacheHit = false;
    try {
      const { data: cached } = await supabase
        .from("whatsapp_lid_map")
        .select("client_id, lid")
        .eq("organization_id", orgId)
        .eq("lid", lidDigits)
        .maybeSingle();
      if (cached?.client_id) {
        cacheHit = true;
        console.log(JSON.stringify({
          tag: "wa-webhook", event: "lid_cache_hit",
          lid: lidDigits, client_id: cached.client_id, instance: instanceName,
        }));
        // Tenta recuperar o telefone real do cliente vinculado para os passos seguintes
        const { data: cli } = await supabase
          .from("clients").select("phone").eq("id", cached.client_id).maybeSingle();
        const phoneDigits = (cli?.phone || "").replace(/\D/g, "");
        if (phoneDigits.length >= 10) phone = phoneDigits;
      } else {
        console.log(JSON.stringify({
          tag: "wa-webhook", event: "lid_cache_miss",
          lid: lidDigits, instance: instanceName,
        }));
      }
    } catch (e) {
      console.warn("[wa-webhook] lid cache lookup failed (non-blocking)", e);
    }

    // ===== 2) Evolution API fallbacks (só se cache miss) =====
    if (!cacheHit) {
      const { phone: resolved, endpoint } = await resolveLidToPhone(apiUrl, apiKey, instanceName, lidDigits);
      if (resolved) {
        console.log(JSON.stringify({
          tag: "wa-webhook", event: "lid_resolve_success",
          lid: lidDigits, phone: resolved, endpoint, instance: instanceName,
        }));
        phone = resolved;
        // Auto-vincula LID→cliente se o telefone bate com algum cadastro
        try {
          const last10 = resolved.replace(/^55/, "").slice(-10);
          const { data: cli } = await supabase
            .from("clients").select("id, phone").eq("organization_id", orgId);
          const match = (cli || []).find((c: any) => {
            const p = (c.phone || "").replace(/\D/g, "").replace(/^55/, "");
            return p && (p === resolved.replace(/^55/, "") || p.slice(-10) === last10);
          });
          if (match) {
            await supabase.from("whatsapp_lid_map").upsert({
              organization_id: orgId,
              lid: lidDigits,
              client_id: match.id,
              updated_at: new Date().toISOString(),
            }, { onConflict: "organization_id,lid" });
            console.log(JSON.stringify({
              tag: "wa-webhook", event: "lid_auto_linked",
              lid: lidDigits, client_id: match.id,
            }));
          }
        } catch (e) {
          console.warn("[wa-webhook] lid auto-link failed (non-blocking)", e);
        }
      } else {
        console.warn(JSON.stringify({
          tag: "wa-webhook", event: "lid_resolve_failed",
          lid: lidDigits, instance: instanceName, message_id: messageId,
          push_name: pushName || null,
          endpoints_tried: ["findContacts", "whatsappNumbers", "fetchProfile", "findChats"],
        }));
        try {
          await supabase.from("auto_settlement_logs").insert({
            organization_id: orgId,
            action: "lid_resolve_failed",
            details: {
              lid: lidDigits, instance: instanceName, message_id: messageId,
              push_name: pushName || null,
              endpoints_tried: ["findContacts", "whatsappNumbers", "fetchProfile", "findChats"],
            },
          });
        } catch (e) {
          console.warn("[wa-webhook] failed to log lid_resolve_failed", e);
        }
      }
    }
  }

  let body: any = null;

  if (isImage || isDocImage || isPdf) {
    // Evolution v2 sometimes embeds base64 directly in the payload — use it first
    const inlineB64 = msg?.message?.base64
      || msg?.base64
      || messageObj?.imageMessage?.base64
      || messageObj?.documentMessage?.base64
      || null;
    const base64 = inlineB64
      || (apiUrl && apiKey
        ? await fetchMediaBase64(apiUrl, apiKey, instanceName, { key, message: messageObj })
        : null);
    const mediaMimeType = documentMime || (isImage ? "image/jpeg" : "application/octet-stream");
    const fallbackRawText = caption || `Comprovante PIX recebido (${documentFileName || mediaMimeType || "arquivo"})`;
    body = {
      organization_id: instance.organization_id,
      phone,
      push_name: pushName || null,
      image_base64: base64,
      media_mime_type: mediaMimeType,
      receipt_hint: true,
      message_id: messageId,
      raw_text: fallbackRawText,
    };
    if (!base64) {
      console.error("[wa-webhook] media WITHOUT base64 — enviando para revisão manual", {
        instance: instanceName,
        phone,
        messageId,
        mediaMimeType,
        hasApiCreds: !!(apiUrl && apiKey),
      });
      body.ocr_error = "media_fetch_failed";
    }
  } else if ((textBody && looksLikePix(textBody))) {
    const amount = extractAmountFromText(textBody);
    if (!amount) return;
    body = {
      organization_id: instance.organization_id,
      phone,
      push_name: pushName || null,
      raw_text: textBody,
      manual_amount: amount,
      manual_txid: `WA-TXT-${messageId}`,
      message_id: messageId,
    };
  } else {
    return; // not a PIX receipt — ignore
  }

  // Forward to pix-ocr-settlement
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pix-ocr-settlement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const t = await res.text();
    console.log("[wa-webhook] forwarded", res.status, t.slice(0, 200));
  } catch (e) {
    console.error("[wa-webhook] forward error", e);
  }
}
