import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 3;

// Message variations to avoid pattern detection
const greetings = ["Olá", "Oi", "Bom dia", "Prezado(a)"];
const closings = ["", " 😊", " 🙏", " ✅"];

function varyMessage(msg: string, level: string): string {
  if (level === "low") return msg;
  // Add subtle random variation
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const closing = closings[Math.floor(Math.random() * closings.length)];
  // Only vary if message starts with a common greeting
  let varied = msg;
  if (/^(Olá|Oi|Bom dia|Prezado)/i.test(msg)) {
    varied = msg.replace(/^(Olá|Oi|Bom dia|Prezado\(a\))/i, greeting);
  }
  if (level === "high" && !msg.endsWith("😊") && !msg.endsWith("🙏") && !msg.endsWith("✅")) {
    varied = varied + closing;
  }
  return varied;
}

function getRandomDelay(min: number, max: number): number {
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
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

    // Get queued + failed (retry) messages
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

    // Get global API settings for fallback
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

    // Check rate limits per org - count recent sends
    const rateLimits: Record<string, { minute: number; hour: number; day: number }> = {};
    for (const orgId of orgIds) {
      const oneMinAgo = new Date(Date.now() - 60000).toISOString();
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

      const { count: minCount } = await supabase
        .from("whatsapp_queue")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "sent")
        .gte("sent_at", oneMinAgo);

      const { count: hourCount } = await supabase
        .from("whatsapp_queue")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "sent")
        .gte("sent_at", oneHourAgo);

      const { count: dayCount } = await supabase
        .from("whatsapp_queue")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "sent")
        .gte("sent_at", oneDayAgo);

      rateLimits[orgId] = {
        minute: minCount || 0,
        hour: hourCount || 0,
        day: dayCount || 0,
      };
    }

    // Optionally shuffle items for anti-pattern
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

      // Check send window
      const currentHour = now.getUTCHours() - 3; // BRT approximation
      const windowStart = parseInt((config.send_window_start || "08:00").split(":")[0]);
      const windowEnd = parseInt((config.send_window_end || "18:00").split(":")[0]);
      const adjustedHour = currentHour < 0 ? currentHour + 24 : currentHour;

      if (adjustedHour < windowStart || adjustedHour >= windowEnd) {
        // Outside send window - reschedule
        const tomorrow = new Date(now);
        tomorrow.setUTCHours(windowStart + 3, Math.floor(Math.random() * 59), 0);
        if (tomorrow <= now) tomorrow.setDate(tomorrow.getDate() + 1);

        await supabase
          .from("whatsapp_queue")
          .update({ scheduled_for: tomorrow.toISOString() })
          .eq("id", item.id);
        paused++;
        continue;
      }

      // Check rate limits
      if (config.auto_pause_enabled) {
        if (limits.minute >= config.max_per_minute) {
          console.log(`[whatsapp-sender] Rate limit/min reached for org ${orgId}`);
          paused++;
          continue;
        }
        if (limits.hour >= config.max_per_hour) {
          console.log(`[whatsapp-sender] Rate limit/hour reached for org ${orgId}`);
          paused++;
          continue;
        }
        if (limits.day >= config.max_per_day) {
          console.log(`[whatsapp-sender] Rate limit/day reached for org ${orgId}`);
          await supabase
            .from("whatsapp_queue")
            .update({ status: "paused", error_message: "Limite diário atingido" })
            .eq("id", item.id);
          paused++;
          continue;
        }
      }

      try {
        const retryCount = parseInt(item.error_message?.match(/\[retry:(\d+)\]/)?.[1] || "0");

        if (retryCount >= MAX_RETRIES) {
          await supabase
            .from("whatsapp_queue")
            .update({ status: "failed", error_message: `Máximo de ${MAX_RETRIES} tentativas excedido. ${item.error_message || ""}` })
            .eq("id", item.id);
          failed++;
          continue;
        }

        // Mark as sending
        await supabase
          .from("whatsapp_queue")
          .update({ status: "sending" })
          .eq("id", item.id);

        // Get the WhatsApp instance for this org
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

        // Vary message content for anti-ban
        const variedMessage = varyMessage(item.message, config.randomness_level || "medium");

        console.log(`[whatsapp-sender] Sending to ${phone} via ${sendUrl} (attempt ${retryCount + 1})`);

        const response = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: phone,
            textMessage: { text: variedMessage },
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`API ${response.status}: ${errorBody}`);
        }

        await response.text();
        console.log(`[whatsapp-sender] Success for ${phone}`);

        await supabase
          .from("whatsapp_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", item.id);

        await supabase.from("whatsapp_messages").insert({
          organization_id: item.organization_id,
          phone: item.phone,
          message: variedMessage,
          direction: "outgoing",
          status: "sent",
          instance_id: instance?.id || null,
          sent_at: new Date().toISOString(),
        });

        // Update rate limit counters
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
          await supabase
            .from("whatsapp_queue")
            .update({
              status: "retry",
              scheduled_for: retryAt,
              error_message: `[retry:${nextRetry}] ${errorMsg}`,
            })
            .eq("id", item.id);
        } else {
          await supabase
            .from("whatsapp_queue")
            .update({
              status: "failed",
              error_message: `[retry:${nextRetry}] ${errorMsg}`,
            })
            .eq("id", item.id);
        }

        failed++;
      }

      // Dynamic anti-ban delay based on config
      const delayMs = getRandomDelay(config.min_delay || 30, config.max_delay || 60);
      console.log(`[whatsapp-sender] Waiting ${delayMs}ms before next message`);
      await new Promise((r) => setTimeout(r, delayMs));
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, paused, total: queueItems.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[whatsapp-sender] Fatal error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
