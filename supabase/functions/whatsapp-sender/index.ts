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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get queued messages ready to send (scheduled_for <= now or null)
    const now = new Date().toISOString();
    const { data: queueItems, error: queueErr } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .eq("status", "queued")
      .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
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

    let sent = 0;
    let failed = 0;

    for (const item of queueItems) {
      try {
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

        // Resolve API URL and key: instance > global settings
        const apiUrl = (instance?.api_url || gs.api_host || "").replace(/\/$/, "");
        const apiKey = instance?.api_key || gs.global_api_key || "";
        const instanceName = instance?.name || "";

        if (!apiUrl || !apiKey || !instanceName) {
          throw new Error("Nenhuma instância WhatsApp conectada com API configurada");
        }

        // Format phone: ensure only digits, must start with country code
        const phone = item.phone.replace(/\D/g, "");

        // Send via Evolution API endpoint
        const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;

        console.log(`[whatsapp-sender] Sending to ${phone} via ${sendUrl}`);

        const response = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: phone,
            textMessage: { text: item.message },
          }),
        });
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`API ${response.status}: ${errorBody}`);
        }

        const responseData = await response.text();
        console.log(`[whatsapp-sender] Success for ${phone}:`, responseData);

        // Mark as sent
        await supabase
          .from("whatsapp_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", item.id);

        // Also log in whatsapp_messages
        await supabase.from("whatsapp_messages").insert({
          organization_id: item.organization_id,
          phone: item.phone,
          message: item.message,
          direction: "outgoing",
          status: "sent",
          instance_id: instance?.id || null,
          sent_at: new Date().toISOString(),
        });

        // Update billing_reminder status if this came from billing
        if (item.campaign_id === null) {
          const { data: reminder } = await supabase
            .from("billing_reminders")
            .select("id")
            .eq("organization_id", item.organization_id)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (reminder) {
            await supabase
              .from("billing_reminders")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("id", reminder.id);
          }
        }

        sent++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[whatsapp-sender] Failed ${item.phone}:`, errorMsg);

        await supabase
          .from("whatsapp_queue")
          .update({
            status: "failed",
            error_message: errorMsg,
          })
          .eq("id", item.id);

        failed++;
      }

      // Small delay between messages (anti-ban)
      await new Promise((r) => setTimeout(r, 2000));
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: queueItems.length }),
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
