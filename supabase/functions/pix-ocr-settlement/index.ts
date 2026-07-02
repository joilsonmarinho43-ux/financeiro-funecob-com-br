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
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
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
function buildMediaBlock(dataUrl: string, mimeType: string) {
  const isPdf = /^application\/pdf/i.test(mimeType) || /^data:application\/pdf/i.test(dataUrl);
  if (isPdf) {
    return {
      type: "file",
      file: { filename: "comprovante.pdf", file_data: dataUrl },
    };
  }
  return { type: "image_url", image_url: { url: dataUrl } };
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function isAiCreditError(err: any): boolean {
  const s = String(err?.message || err || "").toLowerCase();
  return s.includes("402") || s.includes("payment_required") || s.includes("not enough credits") || s.includes("insufficient credits");
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
  if (!GEMINI_API_KEY) throw new Error("credito_ocr_esgotado: AI Gateway sem crédito e GEMINI_API_KEY/GOOGLE_API_KEY não configurada para fallback direto");

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
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "Você extrai dados de comprovantes PIX brasileiros (imagem OU PDF). Retorne APENAS JSON válido com as chaves: amount (number, valor em reais), txid (string|null), end_to_end_id (string|null), paid_at (string ISO|null), sender_name (string|null), raw_text (string com TODO o texto bruto visível no comprovante, incluindo cabeçalhos, valores, datas, nomes). Se não for um comprovante PIX válido, retorne {\"amount\":null}.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados deste comprovante PIX." },
              buildMediaBlock(mediaUrl, mimeType),
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
  } catch (e) {
    if (isAiCreditError(e) || GEMINI_API_KEY) {
      console.warn("[pix-ocr] primary OCR unavailable; trying Gemini direct fallback", String((e as any)?.message || e).slice(0, 180));
      try {
        const fallback = await runGeminiDirectOcr(mediaUrl, mimeType, false);
        return { ...fallback, _ocr_provider: "gemini_direct_fallback" };
      } catch (fallbackErr) {
        throw new Error(`OCR primário indisponível (${String((e as any)?.message || e)}); fallback Gemini falhou (${String((fallbackErr as any)?.message || fallbackErr)})`);
      }
    }
    throw e;
  }
}

// 2º passe: foco exclusivo em VALOR, usado quando o 1º passe não detectou.
async function runOcrAmountOnly(mediaUrl: string, mimeType: string): Promise<{ amount: number | null; raw_text: string | null }> {
  try {
    if (!LOVABLE_API_KEY) {
      const direct = await runGeminiDirectOcr(mediaUrl, mimeType, true);
      return { amount: coerceAmount(direct.amount), raw_text: direct.raw_text || null };
    }
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
              "Você lê comprovantes PIX (imagem OU PDF). Sua ÚNICA tarefa: encontrar o VALOR em reais transferido (geralmente após 'R$', 'Valor', 'Total', 'Você transferiu'). Retorne JSON: {\"amount\": <number>, \"raw_text\": <todo o texto visível>}. Se realmente não houver valor visível, retorne {\"amount\": null, \"raw_text\": <texto>}. NUNCA invente valor.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Qual é o valor (R$) deste comprovante? Retorne também todo o texto visível." },
              buildMediaBlock(mediaUrl, mimeType),
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (isAiCreditError(`${res.status} ${text}`) || GEMINI_API_KEY) {
        const direct = await runGeminiDirectOcr(mediaUrl, mimeType, true);
        return { amount: coerceAmount(direct.amount), raw_text: direct.raw_text || null };
      }
      return { amount: null, raw_text: null };
    }
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(txt);
    return { amount: coerceAmount(parsed.amount), raw_text: parsed.raw_text || null };
  } catch (e) {
    console.warn("[pix-ocr] 2nd-pass amount-only failed (non-blocking)", e);
    return { amount: null, raw_text: null };
  }
}

import { deliverPaymentConfirmation } from "../_shared/paymentReceipt.ts";
import { computeScore, decisionAllowsAuto } from "../_shared/pix/score.ts";
import { detectDuplicate } from "../_shared/pix/duplicate.ts";
import { findTrustedPayer, recordTrustedPayer, normalizeName as normalizePayerName } from "../_shared/pix/trustedPayers.ts";
import { isProviderDisabled, recordProviderSuccess, recordProviderFailure } from "../_shared/pix/ocrStats.ts";

async function processEvent(supabase: any, eventId: string, organizationId: string) {
  try {
    const { data: ev } = await supabase
      .from("auto_settlement_events").select("*").eq("id", eventId).maybeSingle();
    if (!ev) return;
    if (["duplicado", "conciliado"].includes(ev.status)) return;

    const { data: result, error } = await supabase.rpc("auto_settlement_process_payment", { p_event_id: eventId });
    if (error) throw error;
    console.log("settlement result", eventId, result);

    if (result?.success && ev.client_id && ev.amount_detected) {
      // Register trusted payer (helps future third-party PIX)
      try {
        const payerName = ev?.ocr_payload?.sender_name || ev?.ocr_payload?.push_name || null;
        await recordTrustedPayer(supabase, organizationId, ev.client_id, payerName, ev.payer_document, Number(ev.amount_detected));
      } catch (e) { console.warn("[trusted-payer] record failed", e); }

      await deliverPaymentConfirmation(supabase, {
        organizationId,
        eventId: ev.id,
        clientId: ev.client_id,
        originPhone: ev.phone || "",
        totalAmount: Number(ev.amount_detected),
        txid: ev.txid,
      });
    }
  } catch (e: any) {
    console.error("process error", e);
    const nextAt = new Date(Date.now() + 60_000).toISOString();
    await supabase.from("auto_settlement_events")
      .update({ status: "erro", error_message: String(e?.message || e), next_retry_at: nextAt })
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
    const { organization_id, phone, push_name, image_url, image_base64, media_mime_type, message_id, raw_text, manual_amount, manual_txid, force_reprocess, ocr_error, remote_jid } = body;

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

    // ===== Identificação do cliente — PRIORIDADE ABSOLUTA DO TELEFONE =====
    // Regra de negócio: mesmo que o PIX tenha sido pago por TERCEIRO
    // (pai, esposa, amigo — nome diferente no comprovante), se o NÚMERO
    // do WhatsApp que enviou está cadastrado em algum cliente, a baixa
    // é feita NESSE cliente. Nome do comprovante NÃO sobrescreve telefone.
    const incomingVariants = phoneVariants(phone);
    const { data: clients } = await supabase
      .from("clients").select("id, phone, name, document")
      .eq("organization_id", organization_id);
    let client = (clients || []).find((c: any) => {
      const cv = phoneVariants(c.phone || "");
      return cv.some((v) => incomingVariants.includes(v));
    });
    let matchSource: "phone" | "lid_map" | "cpf" | "fuzzy_name" | null = client ? "phone" : null;
    if (matchSource === "phone") {
      console.log("[pix-ocr] PHONE MATCH (prioridade absoluta)", {
        client_id: client!.id, client_name: client!.name,
        whatsapp_phone: phone, push_name, message_id,
        nota: "ignorando nome do comprovante (PIX de terceiro é aceito)",
      });
    }
    // Sub-fonte do fuzzy_name: push_name (WhatsApp do remetente = cliente, sinal forte)
    // vs sender_name (nome lido do comprovante — pode ser terceiro pagador).
    let fuzzyNameSource: "push_name" | "sender_name" | "value_fallback" | null = null;

    // LID resolver: Evolution v2 may send only @lid (14-16 digit anonymized id).
    // We keep a persistent (org, lid) → client map populated when an admin
    // manually links an event. Subsequent PIXes from the same LID auto-resolve.
    const rawPhone = (phone || "").replace(/\D/g, "");
    const looksLikeLid = rawPhone.length >= 14;
    if (!client && looksLikeLid) {
      const { data: lidRow } = await supabase
        .from("whatsapp_lid_map")
        .select("client_id")
        .eq("organization_id", organization_id)
        .eq("lid", rawPhone)
        .maybeSingle();
      if (lidRow?.client_id) {
        const found = (clients || []).find((c: any) => c.id === lidRow.client_id);
        if (found) { client = found; matchSource = "lid_map"; }
      }
    }

    // OCR — preserva sempre o raw_text vindo do webhook (caption ou fallback),
    // mesmo quando o OCR falha ou não devolve texto. Sem isso o regex
    // de extração de valor (downstream) fica sem fonte e o evento vai pra revisão.
    const webhookRawText: string | null = (typeof raw_text === "string" && raw_text.trim()) ? raw_text : null;
    let ocr: any = { raw_text: webhookRawText };
    if (ocr_error) ocr.error = String(ocr_error);
    // Mime real do anexo (webhook sabe se é image/jpeg, image/png ou application/pdf).
    // Sem isso, PDF era enviado como "data:image/jpeg;..." e o OCR retornava vazio.
    const resolvedMime = (typeof media_mime_type === "string" && media_mime_type) || "image/jpeg";
    const ocrUrl = image_url || (image_base64 ? `data:${resolvedMime};base64,${image_base64}` : null);
    let ocrProviderUsed: string | null = null;
    let ocrElapsedMs: number | null = null;
    if (ocrUrl) {
      let ocrResult: any = null;
      const t0 = Date.now();
      try {
        ocrResult = await runOcr(ocrUrl, resolvedMime);
        ocrProviderUsed = ocrResult?._ocr_provider || "lovable_gateway";
        ocrElapsedMs = Date.now() - t0;
        await recordProviderSuccess(supabase, ocrProviderUsed, ocrElapsedMs);
      } catch (e: any) {
        console.error("[pix-ocr] 1st-pass failed", e);
        ocrResult = { error: String(e?.message || e) };
        await recordProviderFailure(supabase, "lovable_gateway", e);
      }
      // merge — nunca perde o raw_text do webhook nem erro prévio do webhook
      ocr = { ...(ocr_error ? { webhook_error: String(ocr_error) } : {}), ...ocrResult };
      if (!ocr.raw_text && webhookRawText) ocr.raw_text = webhookRawText;

      // 2º passe — Flash focado em valor quando o 1º passe falhou
      if (!coerceAmount(ocr?.amount)) {
        const t1 = Date.now();
        const second = await runOcrAmountOnly(ocrUrl, resolvedMime);
        if (second.amount) {
          ocr.amount = second.amount;
          ocr._second_pass_used = true;
          ocrProviderUsed = ocrProviderUsed || "lovable_gateway_2nd";
          ocrElapsedMs = (ocrElapsedMs || 0) + (Date.now() - t1);
          console.log("[pix-ocr] 2nd-pass recuperou valor", { amount: second.amount });
        }
        if (!ocr.raw_text && second.raw_text) ocr.raw_text = second.raw_text;
      }
    }
    // Garantia final: nunca devolve raw_text vazio se o webhook mandou algo
    if (!ocr.raw_text && webhookRawText) ocr.raw_text = webhookRawText;

    // ===== Reject non-receipt content (raffles, ads, etc) BEFORE creating event =====
    const combinedText = `${ocr?.raw_text || ""} ${raw_text || ""}`.toLowerCase();
    const NOISE_KEYWORDS = ["rifa", "sorteio", "bingo", "promo", "ganhador"];
    const isNoise = NOISE_KEYWORDS.some((k) => combinedText.includes(k));
    const hasReceiptMarkers =
      !!ocr?.txid || !!ocr?.end_to_end_id ||
      /comprovante|transfer[eê]ncia|pagamento\s+pix|recibo|pix\s+enviado/i.test(combinedText);
    if (isNoise && !hasReceiptMarkers) {
      console.log("[pix-ocr] rejected non-receipt (noise)", { phone, message_id });
      return new Response(JSON.stringify({ status: "ignored", reason: "non_receipt_noise" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Fallback when phone is @lid or unmatched =====
    if (!client && clients?.length) {
      // (1) CPF from OCR raw text — high-confidence identifier
      const ocrText = `${ocr?.raw_text || ""} ${ocr?.sender_name || ""}`.toLowerCase();
      const cpfMatch = ocrText.match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);
      if (cpfMatch) {
        const cpfDigits = cpfMatch[1].replace(/\D/g, "");
        const byCpf = clients.find((c: any) => (c.document || "").replace(/\D/g, "") === cpfDigits);
        if (byCpf) { client = byCpf; matchSource = "cpf"; }
      }

      // (1.5) Trusted payer — pagador já vinculado a esse cliente em baixas anteriores
      if (!client) {
        const cpfDoc = cpfMatch ? cpfMatch[1] : null;
        const trusted = await findTrustedPayer(supabase, organization_id, ocr?.sender_name || push_name || null, cpfDoc);
        if (trusted && trusted.confidence >= 85) {
          const byTrusted = (clients || []).find((c: any) => c.id === trusted.client_id);
          if (byTrusted) { client = byTrusted; matchSource = "cpf"; /* treated as trusted-strong */ console.log("[trusted-payer] matched", { client_id: byTrusted.id, payment_count: trusted.payment_count }); }
        }
      }

      // (2) Fuzzy name — ONLY as candidate; final validation requires amount match.
      //     Try BOTH OCR sender_name AND WhatsApp push_name independently.
      //     PIX é frequentemente pago por terceiro (família, amigo) → o nome do
      //     comprovante NÃO é o cliente, mas o push_name (nome do contato que
      //     enviou no WhatsApp) geralmente É o cliente.
      const tryFuzzy = (rawName: string) => {
        const distinctive = strongNameTokens(rawName);
        if (distinctive.length === 0) return [] as Array<{ c: any; score: number }>;
        return clients.map((c: any) => {
          const nTokens = new Set(normName(c.name || "").split(/\s+/).filter(Boolean));
          const score = distinctive.filter(t => tokenMatchesName(t, nTokens)).length;
          return { c, score };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
      };

      const earlyAmount = coerceAmount(ocr?.amount) ?? coerceAmount(manual_amount);
      const names: Array<{ src: string; val: string }> = [];
      if (ocr?.sender_name && String(ocr.sender_name).trim()) {
        names.push({ src: "sender_name", val: String(ocr.sender_name).trim() });
      }
      if (push_name && String(push_name).trim()) {
        names.push({ src: "push_name", val: String(push_name).trim() });
      }

      if (!client && names.length > 0) {
        // 1ª passada: priorize candidato cujo valor casa com fatura aberta
        for (const n of names) {
          const cands = tryFuzzy(n.val);
          console.log("[pix-ocr][fuzzy]", n.src, JSON.stringify({ raw: n.val, top: cands.slice(0, 5).map(c => ({ id: c.c.id, name: c.c.name, score: c.score })), earlyAmount }));
          if (cands.length === 0) continue;
          for (const t of cands) {
            const ok = await matchesOpenInvoicesByAmount(supabase, organization_id, t.c.id, earlyAmount);
            console.log("[pix-ocr][invoice-check]", { client_id: t.c.id, name: t.c.name, amount: earlyAmount, ok, score: t.score });
            if (ok) { client = t.c; matchSource = "fuzzy_name"; fuzzyNameSource = n.src as any; break; }
          }
          if (client) break;
        }
        // 2ª passada: sem casamento de valor → candidato único mais forte (irá p/ revisão)
        if (!client) {
          for (const n of names) {
            const cands = tryFuzzy(n.val);
            if (cands.length === 1) { client = cands[0].c; matchSource = "fuzzy_name"; fuzzyNameSource = n.src as any; break; }
            if (cands.length > 1 && cands[0].score > cands[1].score) {
              client = cands[0].c; matchSource = "fuzzy_name"; fuzzyNameSource = n.src as any; break;
            }
          }
        }
      }

      // 3ª passada (rede de segurança): se ainda não achou cliente mas TEM valor,
      // procura faturas abertas em toda a org com o valor EXATO. Se houver
      // apenas UMA fatura compatível E houver sobreposição mínima de nome,
      // vincula como fuzzy_name (a validação de valor garante a baixa segura).
      if (!client && earlyAmount && names.length > 0) {
        const { data: amtInvs } = await supabase
          .from("invoices")
          .select("client_id, amount")
          .eq("organization_id", organization_id)
          .eq("status", "aberto")
          .eq("amount", earlyAmount);
        const uniqueClientIds = Array.from(new Set((amtInvs || []).map((i: any) => i.client_id)));
        console.log("[value-fallback]", { earlyAmount, candidates: uniqueClientIds.length });
        if (uniqueClientIds.length === 1) {
          const cand = (clients || []).find((c: any) => c.id === uniqueClientIds[0]);
          if (cand) {
            const candTokens = new Set(normName(cand.name || "").split(/\s+/).filter(t => t.length >= 4));
            const hasOverlap = names.some(n => normName(n.val).split(/\s+/).filter(t => t.length >= 4).some(t => candTokens.has(t)));
            if (hasOverlap) {
              client = cand; matchSource = "fuzzy_name"; fuzzyNameSource = "value_fallback";
              console.log("[value-fallback] matched", { client_id: cand.id, name: cand.name });
            }
          }
        }
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
    let forcedExistingEventId: string | null = null;

    if (force_reprocess) {
      const q = supabase
        .from("auto_settlement_events")
        .select("id, status")
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: existingForce } = message_id
        ? await q.eq("whatsapp_message_id", message_id).maybeSingle()
        : txid
          ? await q.eq("txid", txid).maybeSingle()
          : { data: null } as any;
      if (existingForce?.id && existingForce.status !== "conciliado") {
        forcedExistingEventId = existingForce.id;
      } else if (existingForce?.status === "conciliado") {
        return new Response(JSON.stringify({ status: "duplicado", event_id: existingForce.id, reason: "already_conciliated" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Idempotency: by txid (limit 1, ordered, tolerates legacy duplicates)
    if (txid && !force_reprocess) {
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
    if (message_id && !force_reprocess) {
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

    // ===== Reconciliação: match exato (1 fatura) OU combinação exata (subset-sum) =====
    // Garante que pagamentos de múltiplas mensalidades em um único PIX (ex: 44+44+44=132)
    // sejam reconhecidos como combinação válida. Cap de 12 faturas (2^12=4096 combos) por segurança.
    let amountMatchesInvoice = false;
    let combinationPicks: number[] | null = null;
    let openInvoicesAmounts: number[] = [];
    if (client && amount) {
      const { data: openInvs } = await supabase
        .from("invoices").select("amount")
        .eq("organization_id", organization_id)
        .eq("client_id", client.id).eq("status", "aberto");
      openInvoicesAmounts = (openInvs || []).map((i: any) => Number(i.amount));
      const singleMatch = openInvoicesAmounts.some(a => Math.abs(a - Number(amount)) < 0.01);
      combinationPicks = singleMatch ? null : findExactCombination(openInvoicesAmounts, Number(amount));
      amountMatchesInvoice = singleMatch || !!combinationPicks;
      console.log("[invoice-combination]", {
        client_id: client.id, amount, open_invoices: openInvoicesAmounts,
        single_match: singleMatch, combination: combinationPicks,
      });
    }

    // Log de fonte primária de match
    if (matchSource === "phone") console.log("[whatsapp-match]", { client_id: client?.id, phone });
    else if (matchSource === "lid_map") console.log("[whatsapp-match]", { source: "lid_map", client_id: client?.id, lid: rawPhone });
    else if (matchSource === "cpf") console.log("[document-match]", { client_id: client?.id });
    else if (matchSource === "fuzzy_name") console.log("[pix-ocr][fuzzy]", { client_id: client?.id, name: client?.name });

    // ===== Regra de decisão (PRIORIDADES) =====
    // 1º) phone   : telefone WhatsApp real bate com cadastro          → auto
    // 2º) lid_map : LID já vinculado a este cliente em baixa anterior → auto
    // 3º) cpf     : CPF do comprovante bate com cadastro              → auto
    // 4º) fuzzy_name (nome cadastrado) — auto SOMENTE quando o valor casa
    //     com fatura aberta E o nome tem sinal forte/sem empate. Para não
    //     regredir PIX de terceiros, sender_name exige 2+ tokens fortes;
    //     push_name pode baixar com 1+ token forte se for único/sem empate.
    let safeFuzzy = false;
    if (matchSource === "fuzzy_name" && amountMatchesInvoice && amount && client) {
      const sourceName = fuzzyNameSource === "push_name"
        ? String(push_name || "")
        : fuzzyNameSource === "sender_name"
          ? String(ocr?.sender_name || "")
          : "";
      const sourceTokens = strongNameTokens(sourceName);
      const minStrongTokens = fuzzyNameSource === "sender_name" ? 2 : 1;
      const clientScore = strongNameScore(sourceName, client.name || "");
      let nameUnique = false;
      if (sourceTokens.length >= minStrongTokens && clientScore >= minStrongTokens) {
        const scored = (clients || []).map((c: any) => {
          return { id: c.id, score: strongNameScore(sourceName, c.name || "") };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
        // único = só 1 candidato com tokens em comum,
        //   OU top score estritamente maior que o 2º (sem empate) E é o cliente atual
        nameUnique =
          (scored.length === 1 && scored[0].id === client.id)
          || (scored.length > 1 && scored[0].id === client.id && scored[0].score > scored[1].score);
      }

      // Proteção extra: valor exato é único na org (sem outros clientes com mesmo valor aberto)
      const { data: ambig } = await supabase
        .from("invoices").select("client_id")
        .eq("organization_id", organization_id).eq("status", "aberto").eq("amount", amount);
      const distinctAmt = Array.from(new Set((ambig || []).map((i: any) => i.client_id)));
      const amountUnique = distinctAmt.length === 1 && distinctAmt[0] === client.id;

      // Match de nome completo: todos os tokens fortes do cadastro aparecem
      // no nome lido (sender_name/push_name). Quando isso ocorre e o cliente
      // é o melhor candidato sem empate, NÃO é PIX de terceiro — é o próprio
      // cliente pagando em nome dele. Libera baixa mesmo sem amountUnique.
      const clientStrongTokens = strongNameTokens(client.name || "");
      const fullNameMatch =
        clientStrongTokens.length >= 2 &&
        clientScore >= clientStrongTokens.length &&
        nameUnique;

      // NOVO: Similaridade tokenizada alta — mesmo sem cobrir 100% dos tokens
      // do cadastro, se o nome lido tem ≥2 tokens fortes que batem com o
      // cliente E cobre ≥60% dos tokens fortes do cadastro E é o único top
      // candidato, tratamos como pagamento do próprio cliente. Isso libera
      // baixa automática mesmo quando o telefone do remetente PIX não bate.
      // Ex.: sender_name="TELMA ARAUJO" vs cadastro="Telma Araujo Silva".
      const coverageRatio = clientStrongTokens.length > 0
        ? clientScore / clientStrongTokens.length : 0;
      const tokenizedNameMatch =
        clientStrongTokens.length >= 2 &&
        clientScore >= 2 &&
        coverageRatio >= 0.6 &&
        nameUnique;

      // Auto-settle quando nome é forte e único; quando há ambiguidade de nome,
      // aceita somente se o valor exato também é único na organização.
      safeFuzzy = fullNameMatch || tokenizedNameMatch || (
        (sourceTokens.length >= minStrongTokens && clientScore >= minStrongTokens) && (nameUnique || amountUnique)
      );
      console.log("[fuzzy-auto-settle-check]", {
        client_id: client.id, amount,
        source: fuzzyNameSource, name_unique: nameUnique, amount_unique: amountUnique,
        source_tokens: sourceTokens, client_score: clientScore,
        client_strong_tokens: clientStrongTokens.length, coverage_ratio: coverageRatio,
        full_name_match: fullNameMatch, tokenized_name_match: tokenizedNameMatch,
        distinct_amount_clients: distinctAmt.length, safe: safeFuzzy,
      });
    }
    const requiresReview = matchSource === "fuzzy_name" && !safeFuzzy;
    if (requiresReview) {
      console.log("[conflict-detected]", { reason: "fuzzy_name_revisao", client_id: client?.id, amount, fuzzyNameSource });
    }


    let eventStatus: string;
    let errorMessage: string | null = null;
    if (!amount) {
      if (!hasReceiptMarkers) {
        console.log("[pix-ocr] no amount + no receipt markers → ignored", { phone, message_id });
        return new Response(JSON.stringify({ status: "ignored", reason: "not_a_receipt" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      eventStatus = "pendente_revisao";
      errorMessage = "valor não detectado pelo OCR — revise manualmente";
    }
    else if (!client) {
      eventStatus = "pendente_revisao";
      errorMessage = "cliente não identificado automaticamente — vincule manualmente em Liquidação Automática";
    }
    else if (requiresReview) {
      eventStatus = "pendente_revisao";
      errorMessage = "candidato sugerido por nome — confirme manualmente (PIX pode ser de terceiro)";
    }
    else if (!amountMatchesInvoice) {
      // Mesmo com telefone/CPF confiável, valor que não casa com nenhuma fatura
      // (nem combinação) vai pra revisão — evita gerar crédito indevido.
      eventStatus = "pendente_revisao";
      errorMessage = "valor pago não corresponde a nenhuma fatura aberta (nem combinação) — revise";
    } else {
      eventStatus = "recebido";
    }

    console.log("[settlement-decision]", {
      match_source: matchSource, client_id: client?.id, amount,
      amount_matches_invoice: amountMatchesInvoice,
      combination_size: combinationPicks?.length || (amountMatchesInvoice ? 1 : 0),
      status: eventStatus,
    });

    const eventRow = {
      organization_id,
      client_id: client?.id || null,
      phone,
      raw_text: ocr?.raw_text || null,
      ocr_payload: {
        ...ocr,
        push_name: push_name || null,
        _match_source: matchSource,
        _fuzzy_name_source: fuzzyNameSource,
        _safe_fuzzy: safeFuzzy,
        _amount_matches_invoice: amountMatchesInvoice,
        _combination_picks: combinationPicks,
        _force_reprocessed_at: force_reprocess ? new Date().toISOString() : null,
        remote_jid: remote_jid || null,
      },
      txid,
      pix_end_to_end_id: ocr?.end_to_end_id || null,
      amount_detected: amount,
      whatsapp_message_id: message_id || null,
      status: eventStatus,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    };

    const { data: ev, error: insErr } = forcedExistingEventId
      ? await supabase
          .from("auto_settlement_events")
          .update(eventRow)
          .eq("id", forcedExistingEventId)
          .select("id")
          .single()
      : await supabase
          .from("auto_settlement_events")
          .insert(eventRow)
          .select("id")
          .single();

    if (insErr) throw insErr;

    await supabase.from("auto_settlement_logs").insert({
      organization_id, event_id: ev.id, client_id: client?.id || null,
      action: "ingested",
      details: {
        phone, amount, txid, client_found: !!client,
        match_source: matchSource,
        fuzzy_name_source: fuzzyNameSource,
        safe_fuzzy: safeFuzzy,
        amount_matches_invoice: amountMatchesInvoice,
        combination_picks: combinationPicks,
        requires_review: requiresReview,
      },
    });

    // Auto-settle apenas quando match é por sinal confiável (phone/lid_map/cpf) E valor casa
    if (client && amount && !requiresReview && eventStatus === "recebido") {
      // Auto-learn LID → client em sinais confiáveis (CPF) e em fuzzy seguro
      // (push_name + valor único). Próximas mensagens do mesmo LID viram match
      // direto (`lid_map`) sem depender de OCR/nome.
      if (looksLikeLid && (matchSource === "cpf" || safeFuzzy)) {
        try {
          await supabase.from("whatsapp_lid_map").upsert({
            organization_id,
            lid: rawPhone,
            client_id: client.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: "organization_id,lid" });
        } catch (e) {
          console.warn("[pix-ocr] lid auto-learn failed (non-blocking)", e);
        }
      }
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
