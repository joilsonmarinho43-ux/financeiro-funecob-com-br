// PIX OCR SANDBOX — dry-run validator for WhatsApp PIX receipts
// Roda toda a lógica de identificação SEM gravar nada no banco e SEM chamar a RPC real.
// Permite validar Evolution API v2 (senderPn, @lid, participantPn, etc.) e identificação
// por telefone / CPF / nome difuso usando comprovantes fake — sem depender de clientes reais.
//
// NUNCA toca em: auto_settlement_events, auto_settlement_allocations, invoices,
// transactions, billing_reminders, whatsapp_queue. É 100% read-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireOrgAuth } from "../_shared/requireOrgAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ===== helpers replicados (idênticos aos da pipeline real) =====
function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "").replace(/^55/, "");
}
function phoneVariants(p: string): string[] {
  const n = normalizePhone(p);
  if (!n) return [];
  const set = new Set<string>([n]);
  if (n.length === 11 && n[2] === "9") set.add(n.slice(0, 2) + n.slice(3));
  if (n.length === 10) set.add(n.slice(0, 2) + "9" + n.slice(2));
  if (n.length >= 8) set.add(n.slice(-8));
  return [...set];
}
function jidToDigits(j: any): string {
  if (!j || typeof j !== "string") return "";
  return j.split("@")[0].replace(/:\d+$/, "").replace(/\D/g, "");
}
function looksLikePhone(d: string): boolean {
  return d.length >= 10 && d.length <= 13;
}
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
function extractAmountFromText(text: string): number | null {
  if (!text) return null;
  const m = text.match(/r\$?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:[,.][0-9]{2}))/i)
        || text.match(/\b([0-9]+[.,][0-9]{2})\b/);
  if (!m) return null;
  return coerceAmount(m[1]);
}

function extractPhoneFromWebhook(payload: any) {
  const msg = payload?.data || payload?.message || {};
  const key = msg.key || {};
  const remoteJid: string = key.remoteJid || "";
  const candidates = [
    jidToDigits(key.senderPn),
    jidToDigits(key.remoteJidAlt),
    jidToDigits(key.participantPn),
    jidToDigits(key.participantAlt),
    jidToDigits(key.participant),
    jidToDigits(msg?.senderPn),
    jidToDigits(msg?.participantPn),
    remoteJid.endsWith("@lid") ? "" : jidToDigits(remoteJid),
    jidToDigits(remoteJid),
  ].filter(Boolean);
  const phone = candidates.find(looksLikePhone) || candidates[0] || "";
  const isLidOnly = !candidates.find(looksLikePhone) && candidates.length > 0;
  return { phone, candidates, isLidOnly, remoteJid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    organization_id,
    webhook_payload,   // payload Evolution v2 completo (key, message, etc)
    fake_ocr,          // objeto OCR simulado: { amount, sender_name, txid, raw_text, end_to_end_id }
  } = body;

  if (!organization_id) {
    return new Response(JSON.stringify({ error: "organization_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sandbox consome créditos de IA: exige admin autenticado.
  const auth = await requireOrgAuth(req, organization_id, corsHeaders, { adminOnly: true });
  if (!auth.ok) return auth.response;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const report: any = {
    sandbox: true,
    organization_id,
    steps: {},
    final_status: "unknown",
    rejection_reason: null,
    would_settle: false,
    side_effects: "NONE (dry-run)",
  };

  // === 1. Extração de telefone do webhook ===
  const phoneInfo = webhook_payload
    ? extractPhoneFromWebhook(webhook_payload)
    : { phone: body.phone || "", candidates: [], isLidOnly: false, remoteJid: "" };

  report.steps.phone_extraction = phoneInfo;

  if (!phoneInfo.phone) {
    report.final_status = "rejected";
    report.rejection_reason = "no_phone_extracted_from_webhook";
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === 2. Identificação do cliente ===
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, phone, document")
    .eq("organization_id", organization_id);

  const incomingVariants = phoneVariants(phoneInfo.phone);
  let client: any = (clients || []).find((c: any) => {
    const cv = phoneVariants(c.phone || "");
    return cv.some((v) => incomingVariants.includes(v));
  });
  let matched_by = client ? "phone" : null;

  if (!client && fake_ocr && clients?.length) {
    const ocrText = `${fake_ocr.raw_text || ""} ${fake_ocr.sender_name || ""}`.toLowerCase();
    const cpfMatch = ocrText.match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);
    if (cpfMatch) {
      const cpfDigits = cpfMatch[1].replace(/\D/g, "");
      client = clients.find((c: any) => (c.document || "").replace(/\D/g, "") === cpfDigits);
      if (client) matched_by = "cpf";
    }
    if (!client && fake_ocr.sender_name) {
      const senderNorm = String(fake_ocr.sender_name).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const senderTokens = senderNorm.split(/\s+/).filter((t) => t.length >= 3);
      if (senderTokens.length >= 2) {
        client = clients.find((c: any) => {
          const n = (c.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return senderTokens.filter((t) => n.includes(t)).length >= 2;
        });
        if (client) matched_by = "fuzzy_name";
      }
    }
  }

  report.steps.client_identification = {
    incoming_phone: phoneInfo.phone,
    incoming_variants: incomingVariants,
    matched_by,
    client: client ? { id: client.id, name: client.name, phone: client.phone } : null,
  };

  // === 3. Detecção de valor ===
  const amount = coerceAmount(fake_ocr?.amount)
    ?? extractAmountFromText(fake_ocr?.raw_text || "");
  const txid = fake_ocr?.txid || fake_ocr?.end_to_end_id || null;

  report.steps.amount_detection = { amount, txid };

  // === 4. Verificação de idempotência (sem gravar) ===
  let isDuplicate = false;
  if (txid) {
    const { data: existing } = await supabase
      .from("auto_settlement_events")
      .select("id, status, created_at")
      .eq("organization_id", organization_id)
      .eq("txid", txid)
      .limit(1).maybeSingle();
    if (existing) {
      isDuplicate = true;
      report.steps.idempotency = { duplicate: true, existing_event: existing };
    } else {
      report.steps.idempotency = { duplicate: false };
    }
  }

  // === 5. Verificar feature flag ===
  const { data: flag } = await supabase
    .from("global_settings").select("value").eq("key", "auto_settlement_enabled").maybeSingle();
  report.steps.feature_flag = { enabled: flag?.value === "true" };

  // === 6. Status final simulado ===
  if (isDuplicate) {
    report.final_status = "would_skip_duplicate";
    report.rejection_reason = "duplicate_txid";
  } else if (!client) {
    report.final_status = "would_error";
    report.rejection_reason = "client_not_identified";
  } else if (!amount) {
    report.final_status = "would_error";
    report.rejection_reason = "amount_not_detected";
  } else if (!report.steps.feature_flag.enabled) {
    report.final_status = "would_skip_feature_disabled";
    report.rejection_reason = "feature_flag_off";
  } else {
    report.final_status = "would_settle";
    report.would_settle = true;

    // Simula a alocação: conta quantas faturas abertas seriam pagas
    const { data: openInvoices } = await supabase
      .from("invoices")
      .select("id, amount, due_date")
      .eq("client_id", client.id)
      .eq("organization_id", organization_id)
      .eq("status", "aberto")
      .order("due_date", { ascending: true });

    let remaining = amount;
    const wouldPay: any[] = [];
    for (const inv of openInvoices || []) {
      if (remaining < Number(inv.amount)) break;
      wouldPay.push({ invoice_id: inv.id, amount: Number(inv.amount), due_date: inv.due_date });
      remaining -= Number(inv.amount);
    }
    report.steps.simulation = {
      total_amount: amount,
      open_invoices_count: openInvoices?.length || 0,
      would_pay_existing: wouldPay.length,
      would_generate_advance: remaining > 0 ? "possible" : "no",
      remaining_after_existing: remaining,
    };
  }

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
