// PIX OCR Settlement — decoupled module
// Receives WhatsApp PIX receipt image, runs OCR directly via Google Gemini,
// processes settlement via auto_settlement_process_payment RPC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordTrustedPayer, findTrustedPayer } from "../_shared/pix/trustedPayers.ts";
import { deliverPaymentConfirmation } from "../_shared/paymentReceipt.ts";
import { computeScore, decisionAllowsAuto } from "../_shared/pix/score.ts";
import { recordProviderFailure, recordProviderSuccess } from "../_shared/pix/ocrStats.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || "";

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

function findExactCombination(amounts: number[], target: number): number[] | null {
  if (!target || target <= 0) return null;
  const cents = (n: number) => Math.round(Number(n) * 100);
  const t = cents(target);
  const arr = amounts.map(cents).filter((n) => n > 0 && n <= t);
  const n = Math.min(arr.length, 12);

  for (let i = 0; i < n; i++) if (arr[i] === t) return [amounts[i]];

  for (let mask = 1; mask < (1 << n); mask++) {
    let s = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) s += arr[i];
    if (s === t) {
      const picks: number[] = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) picks.push(amounts[i]);
      return picks;
    }
  }

  return null;
}

const NAME_STOPWORDS = new Set([
  "maria","jose","da","de","do","das","dos","silva","santos","souza","sousa",
  "oliveira","pereira","lima","ferreira","costa","rodrigues","almeida","gomes",
  "ribeiro","carvalho","martins","araujo","barbosa","rocha","dias","nascimento",
  "moreira","cardoso","fernandes","correia","mendes","freitas","cavalcante",
  "monteiro","goncalves","pinto","ramos","azevedo","teixeira","melo","barros",
  "vieira","reis","moura","castro","campos","cruz","alves","machado","junior",
  "neto","filho","sobrinho","ana","jr"
]);

function normName(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function strongNameTokens(s: string): string[] {
  return normName(s)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

function editDistanceWithinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

function tokenMatchesName(sourceToken: string, clientTokens: Set<string>): boolean {
  if (clientTokens.has(sourceToken)) return true;
  // Tolerância controlada para erro comum de OCR/digitação em nomes fortes:
  // ex.: "edmar" no comprovante vs "edimar" no cadastro. Não aplica a tokens curtos.
  if (sourceToken.length < 5) return false;
  for (const clientToken of clientTokens) {
    if (clientToken.length >= 5 && editDistanceWithinOne(sourceToken, clientToken)) return true;
  }
  return false;
}

function strongNameScore(sourceName: string, clientName: string): number {
  const sourceTokens = strongNameTokens(sourceName);
  if (sourceTokens.length === 0) return 0;
  const clientTokens = new Set(normName(clientName).split(/\s+/).filter(Boolean));
  return sourceTokens.filter((t) => tokenMatchesName(t, clientTokens)).length;
}

async function matchesOpenInvoicesByAmount(
  supabase: any,
  organizationId: string,
  clientId: string,
  amount: number | null,
): Promise<boolean> {
  if (!amount) return false;

  const { data: openInvs } = await supabase
    .from("invoices")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .eq("status", "aberto");

  const amounts = (openInvs || []).map((i: any) => Number(i.amount));
  const singleMatch = amounts.some((invoiceAmount) => Math.abs(invoiceAmount - Number(amount)) < 0.01);
  if (singleMatch) return true;

  return !!findExactCombination(amounts, Number(amount));
}

// Monta o bloco multimodal correto: imagem usa image_url, PDF usa file.
// Sem isso, comprovantes em PDF chegam ao Gemini como "imagem JPEG"
// e o OCR falha silenciosamente (1º passe vazio, baixa não acontece).
function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function parseJsonObject(text: string): any {
  const raw = String(text || "").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    try { return JSON.parse(fenced); } catch {}
  }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch {}
  }
  return { raw_text: raw };
}

async function runGeminiDirectOcr(mediaUrl: string, mimeType: string, amountOnly = false): Promise<any> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY/GOOGLE_API_KEY não configurada para OCR direto");

  const prompt = amountOnly
    ? "Leia este comprovante PIX brasileiro e retorne APENAS JSON válido: {\"amount\": <number|null>, \"raw_text\": <todo o texto visível>}. Encontre o valor transferido em reais. Não invente valor."
    : "Extraia dados deste comprovante PIX brasileiro e retorne APENAS JSON válido com: amount (number|null), txid (string|null), end_to_end_id (string|null), paid_at (string ISO|null), sender_name (string|null), raw_text (todo o texto visível). Não invente dados.";

  const isPdf = /^application\/pdf/i.test(mimeType || "");
  const preferredModels = isPdf
    ? ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-flash-latest", "gemini-pro-latest"]
    : ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-2.5-pro", "gemini-flash-latest", "gemini-pro-latest"];
  let models = preferredModels;
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`);
    if (listRes.ok) {
      const listed = await listRes.json();
      const available = (listed?.models || [])
        .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map((m: any) => String(m?.name || "").replace(/^models\//, ""))
        .filter((name: string) => /gemini/i.test(name) && !/embedding|tts|imagen/i.test(name));
      const ordered = [
        ...preferredModels.filter((m) => available.includes(m)),
        ...available.filter((m: string) => !preferredModels.includes(m) && /(flash|pro)/i.test(m)),
      ];
      if (ordered.length) models = ordered;
    } else {
      console.warn("[pix-ocr] Gemini listModels failed", listRes.status, (await listRes.text()).slice(0, 200));
    }
  } catch (e) {
    console.warn("[pix-ocr] Gemini listModels error (using defaults)", String((e as any)?.message || e));
  }
  const failures: string[] = [];
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || "image/jpeg", data: dataUrlToBase64(mediaUrl) } },
          ],
        }],
        generationConfig: { response_mime_type: "application/json" },
      }),
    });
    if (!res.ok) {
      const msg = `Gemini ${model} failed [${res.status}]: ${(await res.text()).slice(0, 500)}`;
      failures.push(msg);
      console.warn("[pix-ocr] Gemini model failed", msg);
      continue;
    }
    const data = await res.json();
    const txt = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}";
    return { ...parseJsonObject(txt), _gemini_model: model };
  }
  throw new Error(failures.slice(-4).join(" | ") || "Gemini direct OCR failed");
}

async function runOcr(mediaUrl: string, mimeType: string): Promise<any> {
  const direct = await runGeminiDirectOcr(mediaUrl, mimeType, false);
  return { ...direct, _ocr_provider: "gemini_direct" };
}

// 2º passe: foco exclusivo em VALOR, usado quando o 1º passe não detectou.
async function runOcrAmountOnly(mediaUrl: string, mimeType: string): Promise<{ amount: number | null; raw_text: string | null }> {
  try {
    const direct = await runGeminiDirectOcr(mediaUrl, mimeType, true);
    return {
      amount: coerceAmount(direct.amount),
      raw_text: direct.raw_text || null,
    };
  } catch (e) {
    console.warn("[pix-ocr] 2nd-pass amount-only failed (non-blocking)", e);
    return { amount: null, raw_text: null };
  }
}

async function processEvent(supabase: any, eventId: string, organizationId: string) {
  try {
    const { data: ev } = await supabase
      .from("auto_settlement_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (!ev) return;
    if (["duplicado", "conciliado"].includes(ev.status)) return;

    const { data: result, error } = await supabase.rpc(
      "auto_settlement_process_payment",
      { p_event_id: eventId }
    );

    if (error) throw error;

    console.log("settlement result", eventId, result);

    /*
     * A BAIXA E A CONFIRMAÇÃO SÃO ETAPAS SEPARADAS.
     *
     * O RPC é responsável pela baixa financeira.
     * Se a confirmação via WhatsApp/PDF falhar depois da baixa,
     * isso NÃO pode transformar o pagamento em erro nem provocar
     * uma nova baixa no retry.
     */
    if (
      result?.success &&
      result?.skipped !== "duplicate_recent_paid" &&
      ev.client_id &&
      ev.amount_detected
    ) {
      // Register trusted payer (helps future third-party PIX)
      try {
        const payerName =
          ev?.ocr_payload?.sender_name ||
          ev?.ocr_payload?.push_name ||
          null;

        await recordTrustedPayer(
          supabase,
          organizationId,
          ev.client_id,
          payerName,
          ev.payer_document,
          Number(ev.amount_detected)
        );
      } catch (e) {
        console.warn("[trusted-payer] record failed", e);
      }

      /*
       * Não reenviar confirmação se ela já foi registrada.
       */
      const { data: confirmationLog } = await supabase
        .from("auto_settlement_logs")
        .select("id")
        .eq("event_id", ev.id)
        .eq("action", "confirmation_sent")
        .limit(1)
        .maybeSingle();

      if (!confirmationLog?.id) {
        try {
          await deliverPaymentConfirmation(supabase, organizationId, ev);
        } catch (e) {
          console.warn("[confirmation] delivery failed after successful settlement", e);
        }
      }
    }
  } catch (e) {
    console.error("[pix-ocr] processEvent failed", e);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const {
      organization_id,
      phone,
      push_name,
      image_base64,
      media_mime_type,
      receipt_hint,
      message_id,
      raw_text,
      remote_jid,
    } = body || {};

    if (!organization_id || !image_base64) {
      return new Response(JSON.stringify({ error: "organization_id e image_base64 são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedPhone = normalizePhone(phone || "");
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id,name,phone,document")
      .eq("organization_id", organization_id);
    if (clientsError) throw clientsError;

    let client: any = null;
    let matchSource = "";
    const phoneCandidates = phoneVariants(normalizedPhone);
    for (const candidate of phoneCandidates) {
      const found = (clients || []).find((c: any) => phoneVariants(c.phone || "").includes(candidate));
      if (found) { client = found; matchSource = "phone"; break; }
    }

    const ocr = await runOcr(image_base64, media_mime_type || "image/jpeg");
    if (raw_text && !ocr.raw_text) ocr.raw_text = raw_text;

    const earlyAmount = coerceAmount(ocr?.amount);
    let amount = earlyAmount;
    let names = [ocr?.sender_name, push_name].filter(Boolean).map(String);

    if (!amount) {
      const secondPass = await runOcrAmountOnly(image_base64, media_mime_type || "image/jpeg");
      amount = secondPass.amount;
      if (secondPass.raw_text) ocr.raw_text = `${ocr.raw_text || ""}\n${secondPass.raw_text}`.trim();
    }

    if (!client && clients?.length) {
      const ocrText = `${ocr?.raw_text || ""} ${ocr?.sender_name || ""}`.toLowerCase();
      const cpfMatch = ocrText.match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);
      if (cpfMatch) {
        const cpfDigits = cpfMatch[1].replace(/\D/g, "");
        const byCpf = clients.find((c: any) => (c.document || "").replace(/\D/g, "") === cpfDigits);
        if (byCpf) { client = byCpf; matchSource = "cpf"; }
      }

      if (!client) {
        const cpfDoc = cpfMatch ? cpfMatch[1] : null;
        const trusted = await findTrustedPayer(supabase, organization_id, ocr?.sender_name || push_name || null, cpfDoc);
        if (trusted && trusted.confidence >= 85) {
          const byTrusted = (clients || []).find((c: any) => c.id === trusted.client_id);
          if (byTrusted) { client = byTrusted; matchSource = "cpf"; }
        }
      }

      const tryFuzzy = (rawName: string) => {
        const distinctive = strongNameTokens(rawName);
        if (!distinctive.length) return null;
        let best: any = null;
        let bestScore = 0;
        for (const c of clients || []) {
          const score = strongNameScore(rawName, c.name || "");
          if (score > bestScore) { bestScore = score; best = c; }
        }
        return bestScore >= 1 ? best : null;
      };

      if (!client) {
        for (const n of names) {
          const candidate = tryFuzzy(n);
          if (candidate) { client = candidate; matchSource = "fuzzy_name"; break; }
        }
      }
    }

    let amountMatchesInvoice = false;
    let combinationPicks: number[] | null = null;
    if (client && amount) {
      const { data: openInvs } = await supabase
        .from("invoices")
        .select("id,amount")
        .eq("organization_id", organization_id)
        .eq("client_id", client.id)
        .eq("status", "aberto");
      const amounts = (openInvs || []).map((i: any) => Number(i.amount));
      amountMatchesInvoice = amounts.some((invoiceAmount) => Math.abs(invoiceAmount - Number(amount)) < 0.01);
      if (!amountMatchesInvoice) combinationPicks = findExactCombination(amounts, Number(amount));
      amountMatchesInvoice = amountMatchesInvoice || !!combinationPicks;
    }

    let eventStatus = "recebido";
    let errorMessage: string | null = null;
    if (!client) {
      eventStatus = "pendente_revisao";
      errorMessage = "cliente não identificado automaticamente";
    } else if (!amountMatchesInvoice) {
      eventStatus = "pendente_revisao";
      errorMessage = "valor pago não corresponde a nenhuma fatura aberta (nem combinação) — revise";
    }

    const senderName = String(ocr?.sender_name || "").trim();
    const nameCompat = !!(client && senderName && strongNameScore(senderName, client.name || "") >= 1);
    const cpfMatchScore = (ocr?.raw_text || "").match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);
    const payerDocument = cpfMatchScore ? cpfMatchScore[1].replace(/\D/g, "") : null;
    let payerKnown = false;
    if (client && (senderName || payerDocument)) {
      const trustedCheck = await findTrustedPayer(supabase, organization_id, senderName || null, payerDocument);
      payerKnown = !!(trustedCheck && trustedCheck.client_id === client.id && trustedCheck.payment_count >= 1);
    }
    const scoreResult = computeScore({
      client_identified: !!client,
      amount_found: !!amount,
      txid_found: !!(ocr?.txid || ocr?.end_to_end_id),
      name_compatible: nameCompat,
      payer_known: payerKnown,
      single_open_match: amountMatchesInvoice && (combinationPicks?.length || 1) === 1,
      match_source: matchSource,
    });

    const { data: event, error: eventError } = await supabase
      .from("auto_settlement_events")
      .insert({
        organization_id,
        client_id: client?.id || null,
        phone: normalizedPhone || phone || null,
        amount_detected: amount,
        status: eventStatus,
        error_message: errorMessage,
        payer_document: payerDocument,
        whatsapp_message_id: message_id || null,
        ocr_payload: { ...ocr, push_name, receipt_hint, remote_jid, score: scoreResult },
      })
      .select("id")
      .single();
    if (eventError) throw eventError;

    console.log("[pix-ocr] event created", { event_id: event.id, client_id: client?.id, amount, score: scoreResult.score });

    if (decisionAllowsAuto(scoreResult) && client && amount) {
      await processEvent(supabase, event.id, organization_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      event_id: event.id,
      client_id: client?.id || null,
      amount,
      status: eventStatus,
      score: scoreResult,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ingest error", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
