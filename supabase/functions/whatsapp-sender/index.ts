import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEvolutionText } from "../_shared/evolutionSend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 3;

// Normaliza telefone BR para formato E.164 sem '+': adiciona 55 quando faltar.
// Aceita 10 dígitos (fixo: DDD+8) ou 11 dígitos (celular: DDD+9). Mantém intacto se já tiver 55 ou for internacional.
function normalizeBRPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

function extractEvolutionMessageId(payload: any): string | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const id = extractEvolutionMessageId(item);
      if (id) return id;
    }
    return null;
  }
  const candidates = [
    payload?.key?.id,
    payload?.message?.key?.id,
    payload?.data?.key?.id,
    payload?.data?.message?.key?.id,
    payload?.id,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim().length > 0) || null;
}

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

// ─── Advanced message variation (anti-ban) ──────────────
const greetingPools = [
  ["Olá", "Oi", "E aí", "Bom dia", "Boa tarde", "Prezado(a)"],
  ["Olá!", "Oi!", "Tudo bem?", "Bom dia!", "Boa tarde!"],
];
const closingPools = [
  ["", " 😊", " 🙏", " ✅", " 👍"],
  [" Obrigado!", " Agradecemos!", " Até logo!", " 🙂"],
];
const fillers = [
  " Gostaríamos de informar que",
  " Informamos que",
  " Segue a informação:",
  "",
  " Para seu conhecimento,",
];

// Normaliza URLs malformadas (domínios sem protocolo / com hífens em vez de pontos)
// Garante que links do portal apareçam clicáveis no WhatsApp.
function normalizeLinks(msg: string): string {
  let out = msg;
  // Caso 1: "financeiro-funecob-com-br/..." -> "https://financeiro.funecob.com.br/..."
  out = out.replace(
    /\b(?:https?:\/\/)?financeiro[-.]funecob[-.]com[-.]br(\/[^\s]*)?/gi,
    (_m, path) => `https://financeiro.funecob.com.br${path || ""}`
  );
  // Caso 2: domínio funecob.com.br nu (sem protocolo)
  out = out.replace(
    /(^|[\s(])funecob\.com\.br(\/[^\s]*)?/gi,
    (_m, pre, path) => `${pre}https://funecob.com.br${path || ""}`
  );
  return out;
}

function looksLikePaymentConfirmation(msg: string): boolean {
  const lower = (msg || "").toLowerCase();
  return lower.includes("pagamento confirmado") ||
    lower.includes("pagamento foi identificado") ||
    lower.includes("pagamento com sucesso") ||
    lower.includes("mensalidade foi baixada") ||
    lower.includes("recebemos seu pagamento");
}

function removePaymentConfirmationLinks(msg: string): string {
  return (msg || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:financeiro[-.]funecob[-.]com[-.]br|funecob\.com\.br)\S*/gi, "")
    .split("\n")
    .filter((line) => {
      const cleaned = line.replace(/[\s:*_🔗👉➡️.-]/g, "").toLowerCase();
      if (!cleaned) return true;
      return !["acesse seu portal", "seu portal", "portaldocliente", "portal"].includes(cleaned);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function varyMessage(msg: string, level: string): string {
  msg = looksLikePaymentConfirmation(msg) ? removePaymentConfirmationLinks(msg) : normalizeLinks(msg);
  if (level === "low") return msg;

  const pool = greetingPools[Math.floor(Math.random() * greetingPools.length)];
  const greeting = pool[Math.floor(Math.random() * pool.length)];
  const closingPool = closingPools[Math.floor(Math.random() * closingPools.length)];
  const closing = closingPool[Math.floor(Math.random() * closingPool.length)];

  let varied = msg;

  // Replace greeting
  if (/^(Olá|Oi|Bom dia|Boa tarde|Prezado|E aí|Tudo bem)/i.test(msg)) {
    varied = msg.replace(/^(Olá!?|Oi!?|Bom dia!?|Boa tarde!?|Prezado\(a\)|E aí!?|Tudo bem\??)/i, greeting);
  }

  // Medium: vary structure slightly
  if (level === "medium") {
    // Randomly add/remove line breaks for structural variation
    if (Math.random() > 0.5) {
      varied = varied.replace(/\n\n/g, "\n");
    }
  }

  // High: add fillers and closings
  if (level === "high") {
    const filler = fillers[Math.floor(Math.random() * fillers.length)];
    if (filler && !varied.includes(filler.trim())) {
      const lines = varied.split("\n");
      if (lines.length > 1) {
        lines.splice(1, 0, filler.trim());
        varied = lines.join("\n");
      }
    }
    if (!varied.endsWith("😊") && !varied.endsWith("🙏") && !varied.endsWith("✅") && !varied.endsWith("👍")) {
      varied = varied + closing;
    }

    // Random long pause (1 in 5 chance) - simulates human behavior
    // This is handled at the delay level, not message level
  }

  return varied;
}

function getRandomDelay(min: number, max: number): number {
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

// Get client temperature-based priority multiplier
function getTemperatureDelay(temperature: string): number {
  switch (temperature) {
    case "quente": return 0.7; // faster for responsive clients
    case "inadimplente_cronico": return 1.5; // slower, less aggressive
    default: return 1.0;
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

    const now = new Date();
    const nowISO = now.toISOString();

    // Reclaim messages stuck in "sending" (worker died mid-flight) — evita fila travada
    const staleISO = new Date(Date.now() - 10 * 60_000).toISOString();
    await supabase
      .from("whatsapp_queue")
      .update({ status: "queued", scheduled_for: null })
      .eq("status", "sending")
      .lt("created_at", staleISO);

    // Get queued + retry messages

    const { data: queueItems, error: queueErr } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .or("status.eq.queued,status.eq.retry")
      .or(`scheduled_for.is.null,scheduled_for.lte.${nowISO}`)
      .order("created_at", { ascending: true })
      .limit(20);

    if (queueErr) throw queueErr;
    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ message: "No messages to process", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Global settings provide only VPS transport credentials. Instance names
    // are organization-owned and must never fall back across tenants.
    const { data: globalSettings } = await supabase
      .from("global_settings")
      .select("key, value")
      .in("key", ["api_host", "global_api_key"]);

    const gs: Record<string, string> = {};
    (globalSettings || []).forEach((s: any) => { gs[s.key] = s.value; });

    // Group by org and get anti-ban configs
    const orgIds = [...new Set(queueItems.map((q: any) => q.organization_id).filter(Boolean))];
    const orgConfigs: Record<string, any> = {};

    for (const orgId of orgIds) {
      const { data: config } = await supabase
        .from("whatsapp_send_config")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();

      orgConfigs[orgId] = config || {
        send_window_start: "08:00",
        send_window_end: "18:00",
        max_per_minute: 3,
        max_per_hour: 60,
        max_per_day: 500,
        min_delay: 30,
        max_delay: 60,
        randomness_level: "medium",
        auto_pause_enabled: true,
        shuffle_order: true,
      };
    }

    // Check rate limits per org
    const rateLimits: Record<string, { minute: number; hour: number; day: number }> = {};
    for (const orgId of orgIds) {
      const oneMinAgo = new Date(Date.now() - 60000).toISOString();
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

      const [minRes, hourRes, dayRes] = await Promise.all([
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "sent").gte("sent_at", oneMinAgo),
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "sent").gte("sent_at", oneHourAgo),
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "sent").gte("sent_at", oneDayAgo),
      ]);

      rateLimits[orgId] = {
        minute: minRes.count || 0,
        hour: hourRes.count || 0,
        day: dayRes.count || 0,
      };
    }

    // Shuffle for anti-pattern
    let itemsToProcess = [...queueItems];
    const shouldShuffle = orgIds.some(id => orgConfigs[id]?.shuffle_order);
    if (shouldShuffle) {
      for (let i = itemsToProcess.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [itemsToProcess[i], itemsToProcess[j]] = [itemsToProcess[j], itemsToProcess[i]];
      }
    }

    let sent = 0;
    let failed = 0;
    let paused = 0;

    for (const item of itemsToProcess) {
      const orgId = item.organization_id;
      const config = orgConfigs[orgId] || orgConfigs[orgIds[0]];
      const limits = rateLimits[orgId] || { minute: 0, hour: 0, day: 0 };

      // Check send window — use configurable BRT offset (UTC-3)
      const currentHour = now.getUTCHours() - 3;
      const currentMinute = now.getUTCMinutes();
      const [startH, startM] = (config.send_window_start || "08:00").split(":").map(Number);
      const [endH, endM] = (config.send_window_end || "18:00").split(":").map(Number);
      const adjustedHour = currentHour < 0 ? currentHour + 24 : currentHour;
      const currentTime = adjustedHour * 60 + currentMinute;
      const startTime = startH * 60 + (startM || 0);
      const endTime = endH * 60 + (endM || 0);

      if (currentTime < startTime || currentTime >= endTime) {
        // Outside window — reschedule for next window start, but DON'T change status
        const tomorrow = new Date(now);
        tomorrow.setUTCHours(startH + 3, Math.floor(Math.random() * 59), 0);
        if (tomorrow <= now) tomorrow.setDate(tomorrow.getDate() + 1);
        await supabase.from("whatsapp_queue").update({ scheduled_for: tomorrow.toISOString() }).eq("id", item.id);
        paused++;
        continue;
      }

      // Check rate limits — only pause temporarily, never change status to "paused"
      if (config.auto_pause_enabled) {
        if (limits.minute >= config.max_per_minute) {
          // Skip this cycle, will retry next invocation
          paused++;
          continue;
        }
        if (limits.hour >= config.max_per_hour) {
          paused++;
          continue;
        }
        if (limits.day >= config.max_per_day) {
          // Reschedule for tomorrow, but keep status as "queued"
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setUTCHours(startH + 3, Math.floor(Math.random() * 30), 0);
          await supabase.from("whatsapp_queue").update({ scheduled_for: tomorrow.toISOString() }).eq("id", item.id);
          paused++;
          continue;
        }
      }

      let selectedInstanceId: string | null = null;
      try {
        const retryCount = parseInt(item.error_message?.match(/\[retry:(\d+)\]/)?.[1] || "0");

        if (retryCount >= MAX_RETRIES) {
          await supabase.from("whatsapp_queue").update({ status: "failed", error_message: `Máximo de ${MAX_RETRIES} tentativas excedido. ${item.error_message || ""}` }).eq("id", item.id);
          failed++;
          continue;
        }

        // Mark as processing
        await supabase.from("whatsapp_queue").update({ status: "sending" }).eq("id", item.id);

        // Get WhatsApp instance
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("organization_id", item.organization_id)
          .eq("status", "connected")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        selectedInstanceId = instance?.id || null;

        const apiUrl = (instance?.api_url || gs.api_host || "").replace(/\/$/, "");
        const apiKey = instance?.api_key || gs.global_api_key || "";
        const instanceName = instance?.name || "";

        if (!instanceName || !apiUrl || !apiKey) {
          const retryAt = new Date(Date.now() + 5 * 60_000).toISOString();
          await supabase.from("whatsapp_queue").update({
            status: "queued",
            scheduled_for: retryAt,
            error_message: "Aguardando reconexão do WhatsApp — nenhuma tentativa consumida",
          }).eq("id", item.id);
          paused++;
          continue;
        }

        const phone = normalizeBRPhone(item.phone);
        const destination = await resolveWhatsAppNumber(apiUrl, apiKey, instanceName, phone);
        const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;
        const variedMessage = varyMessage(item.message, config.randomness_level || "medium");

        const maskedKey = apiKey.length > 4 ? apiKey.slice(0, 2) + "***" + apiKey.slice(-2) : "***";
        console.log(`[whatsapp-sender] Sending to ${phone.slice(0, 4)}**** via ${sendUrl} (key: ${maskedKey}, attempt ${retryCount + 1})`);

        const sendResult = await sendEvolutionText(sendUrl, apiKey, destination, variedMessage);
        if (!sendResult.ok || !sendResult.messageId) {
          throw new Error(`API ${sendResult.status} sem confirmação: ${sendResult.body.slice(0, 300)}`);
        }
        const providerMessageId = sendResult.messageId;
        console.log(`[whatsapp-sender] Accepted ${providerMessageId.slice(0, 8)} for ${phone.slice(0, 4)}****`);

        await supabase.from("whatsapp_queue").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", item.id);

        await supabase.from("whatsapp_messages").insert({
          organization_id: item.organization_id,
          phone: item.phone,
          message: variedMessage,
          direction: "outgoing",
          status: "sent",
          instance_id: instance?.id || null,
          sent_at: new Date().toISOString(),
        });

        limits.minute++;
        limits.hour++;
        limits.day++;
        sent++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const retryCount = parseInt(item.error_message?.match(/\[retry:(\d+)\]/)?.[1] || "0");
        const nextRetry = retryCount + 1;

        console.error(`[whatsapp-sender] Failed ${item.phone.slice(0, 4)}**** (attempt ${nextRetry}):`, errorMsg.replace(/apikey[=:]\s*\S+/gi, "apikey=***"));

        const lowerError = errorMsg.toLowerCase();
        const isConnectionClosed = lowerError.includes("connection closed") || lowerError.includes("not connected") || lowerError.includes("connection close");
        // Instância inexistente / credencial inválida no servidor: não gastar tentativas,
        // marcar instância como desconectada para o painel refletir a realidade.
        const isInstanceInvalid = lowerError.includes("does not exist") || lowerError.includes("api 401") || lowerError.includes("unauthorized");

        if (isInstanceInvalid) {
          if (selectedInstanceId) {
            await supabase
              .from("whatsapp_instances")
              .update({ status: "disconnected" })
              .eq("id", selectedInstanceId);
          }
          const retryAt = new Date(Date.now() + 10 * 60_000).toISOString();
          await supabase.from("whatsapp_queue").update({
            status: "queued",
            scheduled_for: retryAt,
            error_message: "Instância do WhatsApp inválida no servidor — reconecte para retomar os envios",
          }).eq("id", item.id);
          failed++;
        } else if (isConnectionClosed) {
          const retryAt = new Date(Date.now() + 5 * 60_000).toISOString();
          await supabase.from("whatsapp_queue").update({
            status: "queued",
            scheduled_for: retryAt,
            error_message: "Aguardando reconexão do WhatsApp — erro de sessão fechada",
          }).eq("id", item.id);
          failed++;
        } else if (nextRetry < MAX_RETRIES) {

          const backoffMs = 30000 * Math.pow(2, retryCount);
          const retryAt = new Date(Date.now() + backoffMs).toISOString();
          await supabase.from("whatsapp_queue").update({
            status: "retry",
            scheduled_for: retryAt,
            error_message: `[retry:${nextRetry}] ${errorMsg}`,
          }).eq("id", item.id);
        } else {
          await supabase.from("whatsapp_queue").update({
            status: "failed",
            error_message: `[retry:${nextRetry}] ${errorMsg}`,
          }).eq("id", item.id);
          failed++;
        }
      }

      // Dynamic delay with temperature awareness
      let baseDelay = getRandomDelay(config.min_delay || 30, config.max_delay || 60);

      // Random long pause (1 in 8 chance) - mimics human breaks
      if (config.randomness_level === "high" && Math.random() < 0.125) {
        baseDelay += getRandomDelay(60, 180);
        console.log(`[whatsapp-sender] Long pause triggered (anti-pattern)`);
      }

      console.log(`[whatsapp-sender] Waiting ${baseDelay}ms before next message`);
      await new Promise((r) => setTimeout(r, baseDelay));
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, paused, total: queueItems.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[whatsapp-sender] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
