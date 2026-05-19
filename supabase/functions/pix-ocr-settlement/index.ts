// PIX OCR Settlement — decoupled module
// Receives WhatsApp PIX receipt image, runs OCR via Lovable AI Gateway,
// processes settlement via auto_settlement_process_payment RPC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "").replace(/^55/, "");
}
// Returns a set of phone variants to tolerate the mobile "9" prefix
// (e.g. "9184456470" cadastrado vs "91984456470" enviado pelo WhatsApp).
function phoneVariants(p: string): string[] {
  const n = normalizePhone(p);
  if (!n) return [];
  const set = new Set<string>([n]);
  // 11 digits with 9 → also try 10 digits (drop the 9 after DDD)
  if (n.length === 11 && n[2] === "9") set.add(n.slice(0, 2) + n.slice(3));
  // 10 digits → also try 11 digits (insert 9 after DDD)
  if (n.length === 10) set.add(n.slice(0, 2) + "9" + n.slice(2));
  // last 8 digits fallback for partial cadastros
  if (n.length >= 8) set.add(n.slice(-8));
  return [...set];
}

// Coerces amount from OCR (which often returns string like "44.00" or "44,00")
function coerceAmount(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number" && isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    if (isFinite(n) && n > 0) return n;
  }
  return null;
}

async function runOcr(imageUrl: string): Promise<any> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você extrai dados de comprovantes PIX brasileiros. Retorne APENAS JSON válido com as chaves: amount (number, valor em reais), txid (string|null), end_to_end_id (string|null), paid_at (string ISO|null), sender_name (string|null), raw_text (string com texto bruto extraído). Se não for um comprovante PIX válido, retorne {\"amount\":null}.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia os dados deste comprovante PIX." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OCR failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(txt); } catch { return { raw_text: txt }; }
}

async function processEvent(supabase: any, eventId: string, organizationId: string) {
  try {
    const { data: ev } = await supabase
      .from("auto_settlement_events").select("*").eq("id", eventId).maybeSingle();
    if (!ev) return;

    // Skip if already duplicado/conciliado
    if (["duplicado", "conciliado"].includes(ev.status)) return;

    const { data: result, error } = await supabase.rpc("auto_settlement_process_payment", { p_event_id: eventId });
    if (error) throw error;
    console.log("settlement result", eventId, result);
  } catch (e: any) {
    console.error("process error", e);
    await supabase.from("auto_settlement_events")
      .update({ status: "erro", error_message: String(e?.message || e) })
      .eq("id", eventId);
    await supabase.from("auto_settlement_logs").insert({
      organization_id: organizationId,
      event_id: eventId,
      action: "error",
      details: { error: String(e?.message || e) },
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const { organization_id, phone, image_url, image_base64, message_id, raw_text, manual_amount, manual_txid } = body;

    if (!organization_id || !phone || (!image_url && !image_base64 && !raw_text && manual_amount == null)) {
      return new Response(JSON.stringify({ error: "missing organization_id, phone, or image/raw_text/manual_amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Feature flag check
    const { data: flag } = await supabase
      .from("global_settings").select("value").eq("key", "auto_settlement_enabled").maybeSingle();
    if (!flag || flag.value !== "true") {
      return new Response(JSON.stringify({ skipped: "feature_disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identify client by phone within org (tolerates 9-prefix variations)
    const incomingVariants = phoneVariants(phone);
    const { data: clients } = await supabase
      .from("clients").select("id, phone")
      .eq("organization_id", organization_id);
    const client = (clients || []).find((c: any) => {
      const cv = phoneVariants(c.phone || "");
      return cv.some((v) => incomingVariants.includes(v));
    });

    // OCR
    let ocr: any = { raw_text: raw_text || null };
    if (image_url || image_base64) {
      try {
        const url = image_url || `data:image/jpeg;base64,${image_base64}`;
        ocr = await runOcr(url);
      } catch (e: any) {
        ocr = { error: String(e?.message || e) };
      }
    }

    // Fallback: extract amount from raw text "R$ 44,00" / "44.00" when OCR/manual missing
    function extractFromText(t: string | null | undefined): number | null {
      if (!t) return null;
      const m = t.match(/r\$?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:[,.][0-9]{2}))/i)
             || t.match(/\b([0-9]+[.,][0-9]{2})\b/);
      if (!m) return null;
      return coerceAmount(m[1]);
    }
    // Coerce amount (OCR may return string like "44,00") and txid (fallback to message_id for idempotency)
    const amount = coerceAmount(ocr?.amount)
      ?? coerceAmount(manual_amount)
      ?? extractFromText(ocr?.raw_text)
      ?? extractFromText(raw_text);
    const txid = ocr?.txid || manual_txid || (message_id ? `WA-MSG-${message_id}` : null);

    // Idempotency: by txid (limit 1, ordered, tolerates legacy duplicates)
    if (txid) {
      const { data: existing } = await supabase
        .from("auto_settlement_events")
        .select("id").eq("organization_id", organization_id).eq("txid", txid)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ status: "duplicado", event_id: existing.id }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Idempotency: by whatsapp_message_id (covers retries when OCR fails to extract txid)
    if (message_id) {
      const { data: existingMsg } = await supabase
        .from("auto_settlement_events")
        .select("id").eq("organization_id", organization_id).eq("whatsapp_message_id", message_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existingMsg) {
        return new Response(JSON.stringify({ status: "duplicado", event_id: existingMsg.id }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: ev, error: insErr } = await supabase
      .from("auto_settlement_events").insert({
        organization_id,
        client_id: client?.id || null,
        phone,
        raw_text: ocr?.raw_text || null,
        ocr_payload: ocr,
        txid,
        pix_end_to_end_id: ocr?.end_to_end_id || null,
        amount_detected: amount,
        whatsapp_message_id: message_id || null,
        status: client && amount ? "recebido" : "erro",
        error_message: !client ? "client not identified by phone" : !amount ? "amount not detected" : null,
      }).select("id").single();

    if (insErr) throw insErr;

    await supabase.from("auto_settlement_logs").insert({
      organization_id, event_id: ev.id, client_id: client?.id || null,
      action: "ingested", details: { phone, amount, txid, client_found: !!client },
    });

    if (client && amount) {
      // Process async
      // @ts-ignore
      EdgeRuntime.waitUntil(processEvent(supabase, ev.id, organization_id));
    }

    return new Response(JSON.stringify({ status: "queued", event_id: ev.id }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ingest error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
