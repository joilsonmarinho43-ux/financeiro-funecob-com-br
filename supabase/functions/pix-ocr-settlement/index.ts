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

async function runOcr(imageUrl: string): Promise<any> {
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
            "Você extrai dados de comprovantes PIX brasileiros. Retorne APENAS JSON válido com as chaves: amount (number, valor em reais), txid (string|null), end_to_end_id (string|null), paid_at (string ISO|null), sender_name (string|null), raw_text (string com TODO o texto bruto visível no comprovante, incluindo cabeçalhos, valores, datas, nomes). Se não for um comprovante PIX válido, retorne {\"amount\":null}.",
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

// 2º passe: foco exclusivo em VALOR, usado quando o 1º passe não detectou.
async function runOcrAmountOnly(imageUrl: string): Promise<{ amount: number | null; raw_text: string | null }> {
  try {
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
              "Você lê comprovantes PIX. Sua ÚNICA tarefa: encontrar o VALOR em reais transferido (geralmente após 'R$', 'Valor', 'Total', 'Você transferiu'). Retorne JSON: {\"amount\": <number>, \"raw_text\": <todo o texto visível>}. Se realmente não houver valor visível, retorne {\"amount\": null, \"raw_text\": <texto>}. NUNCA invente valor.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Qual é o valor (R$) deste comprovante? Retorne também todo o texto visível." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return { amount: null, raw_text: null };
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
    const { organization_id, phone, push_name, image_url, image_base64, message_id, raw_text, manual_amount, manual_txid } = body;

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

    // ===== Client identification — strict priority: phone > LID map > CPF > name(+amount) =====
    // PIX can be sent by third parties, so name match alone is unsafe.
    // Phone (WhatsApp) is the only fully trusted signal.
    const incomingVariants = phoneVariants(phone);
    const { data: clients } = await supabase
      .from("clients").select("id, phone, name, document")
      .eq("organization_id", organization_id);
    let client = (clients || []).find((c: any) => {
      const cv = phoneVariants(c.phone || "");
      return cv.some((v) => incomingVariants.includes(v));
    });
    let matchSource: "phone" | "lid_map" | "cpf" | "fuzzy_name" | null = client ? "phone" : null;

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
    const ocrUrl = image_url || (image_base64 ? `data:image/jpeg;base64,${image_base64}` : null);
    if (ocrUrl) {
      let ocrResult: any = null;
      try {
        ocrResult = await runOcr(ocrUrl);
      } catch (e: any) {
        console.error("[pix-ocr] 1st-pass failed", e);
        ocrResult = { error: String(e?.message || e) };
      }
      // merge — nunca perde o raw_text do webhook
      ocr = { ...ocrResult };
      if (!ocr.raw_text && webhookRawText) ocr.raw_text = webhookRawText;

      // 2º passe — Flash focado em valor quando o 1º passe falhou
      if (!coerceAmount(ocr?.amount)) {
        const second = await runOcrAmountOnly(ocrUrl);
        if (second.amount) {
          ocr.amount = second.amount;
          ocr._second_pass_used = true;
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

      // (2) Fuzzy name — ONLY as candidate; final validation requires amount match.
      //     Try BOTH OCR sender_name AND WhatsApp push_name independently.
      //     PIX é frequentemente pago por terceiro (família, amigo) → o nome do
      //     comprovante NÃO é o cliente, mas o push_name (nome do contato que
      //     enviou no WhatsApp) geralmente É o cliente.
      const STOPWORDS = new Set([
        "maria","jose","da","de","do","das","dos","silva","santos","souza","sousa",
        "oliveira","pereira","lima","ferreira","costa","rodrigues","almeida","gomes",
        "ribeiro","carvalho","martins","araujo","barbosa","rocha","dias","nascimento",
        "moreira","cardoso","fernandes","correia","mendes","freitas","cavalcante",
        "monteiro","goncalves","pinto","ramos","azevedo","teixeira","melo","barros",
        "vieira","reis","moura","castro","campos","cruz","alves","machado","junior",
        "neto","filho","sobrinho","ana","jr"
      ]);
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const tryFuzzy = (rawName: string) => {
        const senderNorm = norm(rawName).trim();
        const senderTokens = senderNorm.split(/\s+/).filter(t => t.length >= 3);
        const distinctive = senderTokens.filter(t => !STOPWORDS.has(t));
        if (distinctive.length === 0) return [] as Array<{ c: any; score: number }>;
        return clients.map((c: any) => {
          const nTokens = new Set(norm(c.name || "").split(/\s+/).filter(Boolean));
          const score = distinctive.filter(t => nTokens.has(t)).length;
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
            if (ok) { client = t.c; matchSource = "fuzzy_name"; break; }
          }
          if (client) break;
        }
        // 2ª passada: sem casamento de valor → candidato único mais forte (irá p/ revisão)
        if (!client) {
          for (const n of names) {
            const cands = tryFuzzy(n.val);
            if (cands.length === 1) { client = cands[0].c; matchSource = "fuzzy_name"; break; }
            if (cands.length > 1 && cands[0].score > cands[1].score) {
              client = cands[0].c; matchSource = "fuzzy_name"; break;
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
            const candTokens = new Set(norm(cand.name || "").split(/\s+/).filter(t => t.length >= 4));
            const hasOverlap = names.some(n => norm(n.val).split(/\s+/).filter(t => t.length >= 4).some(t => candTokens.has(t)));
            if (hasOverlap) {
              client = cand; matchSource = "fuzzy_name";
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

    // ===== Regra de decisão (POLÍTICA SEGURA) =====
    // Auto-settle SOMENTE quando o cliente foi identificado por sinal confiável:
    //   - phone   : telefone WhatsApp real bate com cadastro
    //   - lid_map : LID anônimo já vinculado a este cliente em baixa anterior
    //   - cpf     : CPF extraído do comprovante bate com o cadastro
    // fuzzy_name (nome do pagador) NUNCA dispara baixa automática — apenas
    // sugere candidato para revisão manual em Liquidação Automática.
    const requiresReview = matchSource === "fuzzy_name";
    if (requiresReview) {
      console.log("[conflict-detected]", { reason: "fuzzy_name_sempre_revisao", client_id: client?.id, amount });
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

    const { data: ev, error: insErr } = await supabase
      .from("auto_settlement_events").insert({
        organization_id,
        client_id: client?.id || null,
        phone,
        raw_text: ocr?.raw_text || null,
        ocr_payload: {
          ...ocr,
          push_name: push_name || null,
          _match_source: matchSource,
          _amount_matches_invoice: amountMatchesInvoice,
          _combination_picks: combinationPicks,
        },
        txid,
        pix_end_to_end_id: ocr?.end_to_end_id || null,
        amount_detected: amount,
        whatsapp_message_id: message_id || null,
        status: eventStatus,
        error_message: errorMessage,
      }).select("id").single();

    if (insErr) throw insErr;

    await supabase.from("auto_settlement_logs").insert({
      organization_id, event_id: ev.id, client_id: client?.id || null,
      action: "ingested",
      details: {
        phone, amount, txid, client_found: !!client,
        match_source: matchSource,
        amount_matches_invoice: amountMatchesInvoice,
        combination_picks: combinationPicks,
        requires_review: requiresReview,
      },
    });

    // Auto-settle apenas quando match é por sinal confiável (phone/lid_map/cpf) E valor casa
    if (client && amount && !requiresReview && eventStatus === "recebido") {
      // Auto-learn LID → client (apenas via CPF, único sinal confiável que vem com LID)
      if (looksLikeLid && matchSource === "cpf") {
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
