import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 3;

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

function varyMessage(msg: string, level: string): string {
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

    // Get global API settings
    const { data: globalSettings } = await supabase
      .from("global_settings")
      .select("key, value")
      .in("key", ["api_host", "global_api_key"]);

    const gs: Record<string, string> = {};
    (globalSettings || []).forEach((s: any) => { gs[s.key] = s.value; });

    // Fetch default_instance_name from global_settings
    const { data: instanceNameSetting } = await supabase
      .from("global_settings")
      .select("value")
      .eq("key", "default_instance_name")
      .maybeSingle();
    const defaultInstanceName = (instanceNameSetting as any)?.value || "";

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

      // Check send window (BRT approximation)
      const currentHour = now.getUTCHours() - 3;
      const windowStart = parseInt((config.send_window_start || "08:00").split(":")[0]);
      const windowEnd = parseInt((config.send_window_end || "18:00").split(":")[0]);
      const adjustedHour = currentHour < 0 ? currentHour + 24 : currentHour;

      if (adjustedHour < windowStart || adjustedHour >= windowEnd) {
        const tomorrow = new Date(now);
        tomorrow.setUTCHours(windowStart + 3, Math.floor(Math.random() * 59), 0);
        if (tomorrow <= now) tomorrow.setDate(tomorrow.getDate() + 1);
        await supabase.from("whatsapp_queue").update({ scheduled_for: tomorrow.toISOString() }).eq("id", item.id);
        paused++;
        continue;
      }

      // Check rate limits
      if (config.auto_pause_enabled) {
        if (limits.minute >= config.max_per_minute) { paused++; continue; }
        if (limits.hour >= config.max_per_hour) { paused++; continue; }
        if (limits.day >= config.max_per_day) {
          await supabase.from("whatsapp_queue").update({ status: "paused", error_message: "Limite diário atingido" }).eq("id", item.id);
          paused++;
          continue;
        }
      }

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
          .limit(1)
          .maybeSingle();

        const apiUrl = (instance?.api_url || gs.api_host || "").replace(/\/$/, "");
        const apiKey = instance?.api_key || gs.global_api_key || "";
        const instanceName = instance?.name || "";

        if (!apiUrl || !apiKey || !instanceName) {
          throw new Error("Nenhuma instância WhatsApp conectada com API configurada");
        }

        const phone = item.phone.replace(/\D/g, "");
        const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;
        const variedMessage = varyMessage(item.message, config.randomness_level || "medium");

        console.log(`[whatsapp-sender] Sending to ${phone} via ${sendUrl} (attempt ${retryCount + 1})`);

        const response = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify({ number: phone, textMessage: { text: variedMessage } }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`API ${response.status}: ${errorBody}`);
        }

        await response.text();
        console.log(`[whatsapp-sender] Success for ${phone}`);

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

        console.error(`[whatsapp-sender] Failed ${item.phone} (attempt ${nextRetry}):`, errorMsg);

        if (nextRetry < MAX_RETRIES) {
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
        }

        failed++;
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
