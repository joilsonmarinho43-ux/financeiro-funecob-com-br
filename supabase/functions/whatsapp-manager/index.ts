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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
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
    const webhookUrl = gs.webhook_url;

    if (!apiHost || !globalApiKey) {
      return new Response(JSON.stringify({ 
        error: "API de WhatsApp não configurada. Vá em Configurações Globais e preencha o API Host e a Global API Key." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = apiHost.replace(/\/$/, "");

    // ─── CREATE INSTANCE ───
    if (action === "create_instance") {
      if (!instance_name || !organization_id) {
        return new Response(JSON.stringify({ error: "instance_name and organization_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create instance on Evolution API
      const createResp = await fetch(`${baseUrl}/instance/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: globalApiKey },
        body: JSON.stringify({
          instanceName: instance_name,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: webhookUrl || undefined,
          webhookByEvents: true,
          webhookEvents: [
            "CONNECTION_UPDATE",
            "MESSAGES_UPSERT",
            "QRCODE_UPDATED",
          ],
        }),
      });

      if (!createResp.ok) {
        const errText = await createResp.text();
        console.error("Evolution create error:", errText);
        // If instance already exists, proceed to connect
        if (errText.includes("already") || errText.includes("exists")) {
          // Instance exists, just connect
        } else {
          return new Response(JSON.stringify({ error: `Erro ao criar instância: ${createResp.status} - ${errText}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      let createData: any = {};
      try {
        createData = await createResp.json();
      } catch {}

      // Save instance in DB with Evolution API credentials
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

      // Get QR code
      let qrCode = createData?.qrcode?.base64 || null;
      if (!qrCode) {
        // Try to fetch QR code separately
        try {
          const qrResp = await fetch(`${baseUrl}/instance/connect/${instance_name}`, {
            method: "GET",
            headers: { apikey: globalApiKey },
          });
          if (qrResp.ok) {
            const qrData = await qrResp.json();
            qrCode = qrData?.base64 || qrData?.qrcode?.base64 || null;
          }
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

      const instApiUrl = (inst.api_url || baseUrl).replace(/\/$/, "");
      const instApiKey = inst.api_key || globalApiKey;

      // Connect/get QR
      const qrResp = await fetch(`${instApiUrl}/instance/connect/${inst.name}`, {
        method: "GET",
        headers: { apikey: instApiKey },
      });

      if (!qrResp.ok) {
        const errText = await qrResp.text();
        return new Response(JSON.stringify({ error: `Erro ao obter QR: ${errText}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const qrData = await qrResp.json();
      const qrCode = qrData?.base64 || qrData?.qrcode?.base64 || null;

      // Update status to pairing
      await supabase.from("whatsapp_instances").update({ status: "pairing" }).eq("id", instance_id);

      return new Response(JSON.stringify({
        success: true,
        qr_code: qrCode,
        instance_name: inst.name,
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

      const instApiUrl = (inst.api_url || baseUrl).replace(/\/$/, "");
      const instApiKey = inst.api_key || globalApiKey;

      const statusResp = await fetch(`${instApiUrl}/instance/connectionState/${inst.name}`, {
        method: "GET",
        headers: { apikey: instApiKey },
      });

      if (!statusResp.ok) {
        return new Response(JSON.stringify({ 
          success: true, 
          status: "disconnected",
          instance_name: inst.name,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const statusData = await statusResp.json();
      const state = statusData?.instance?.state || statusData?.state || "disconnected";

      // Map Evolution API states to our states
      let mappedStatus = "disconnected";
      if (state === "open" || state === "connected") {
        mappedStatus = "connected";
      } else if (state === "connecting" || state === "qrcode") {
        mappedStatus = "pairing";
      }

      // Update DB status
      await supabase.from("whatsapp_instances").update({ status: mappedStatus }).eq("id", instance_id);

      return new Response(JSON.stringify({
        success: true,
        status: mappedStatus,
        raw_state: state,
        instance_name: inst.name,
      }), {
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

      const instApiUrl = (inst.api_url || baseUrl).replace(/\/$/, "");
      const instApiKey = inst.api_key || globalApiKey;

      // Logout from Evolution API
      try {
        await fetch(`${instApiUrl}/instance/logout/${inst.name}`, {
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
