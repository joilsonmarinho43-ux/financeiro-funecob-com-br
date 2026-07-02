// Retry queue processor: picks auto_settlement_events with status='erro' and
// retry_attempts<5 whose next_retry_at is due, and re-invokes pix-ocr-settlement.
// Scheduled via pg_cron every 2 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BACKOFF_MIN = [1, 5, 15, 60, 240]; // minutes per attempt

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();

  const { data: events } = await supabase
    .from("auto_settlement_events")
    .select("id, organization_id, phone, ocr_payload, retry_attempts, whatsapp_message_id, txid")
    .eq("status", "erro")
    .lt("retry_attempts", 5)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .limit(20);

  const results: any[] = [];
  for (const ev of events || []) {
    const attempt = (ev.retry_attempts || 0) + 1;
    const nextMin = BACKOFF_MIN[Math.min(attempt, BACKOFF_MIN.length - 1)];
    const nextAt = new Date(Date.now() + nextMin * 60_000).toISOString();
    try {
      const payload = ev.ocr_payload || {};
      const invoke = await fetch(`${SUPABASE_URL}/functions/v1/pix-ocr-settlement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          organization_id: ev.organization_id,
          phone: ev.phone,
          push_name: payload.push_name || null,
          image_url: payload.image_url || null,
          image_base64: payload.image_base64 || null,
          media_mime_type: payload.media_mime_type || payload.mime_type || null,
          raw_text: payload.raw_text || null,
          message_id: ev.whatsapp_message_id,
          force_reprocess: true,
        }),
      });
      const ok = invoke.ok;
      await supabase.from("auto_settlement_events").update({
        retry_attempts: attempt,
        next_retry_at: ok ? null : nextAt,
      }).eq("id", ev.id);
      await supabase.from("auto_settlement_logs").insert({
        organization_id: ev.organization_id,
        event_id: ev.id,
        action: "retry",
        details: { attempt, ok, next_retry_at: ok ? null : nextAt, http_status: invoke.status },
      });
      results.push({ id: ev.id, ok, attempt });
    } catch (e: any) {
      await supabase.from("auto_settlement_events").update({
        retry_attempts: attempt,
        next_retry_at: nextAt,
      }).eq("id", ev.id);
      results.push({ id: ev.id, ok: false, attempt, error: String(e?.message || e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
