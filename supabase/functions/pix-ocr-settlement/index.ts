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
      model: "google/gemini-2.5-pro",
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

async function sendPaymentConfirmation(supabase: any, organizationId: string, clientId: string, amount: number) {
  try {
    const { data: client } = await supabase
      .from("clients").select("name, phone").eq("id", clientId).single();
    if (!client?.phone) return;

    const { data: settings } = await supabase
      .from("billing_settings")
      .select("template_baixa, pix_holder_name")
      .eq("organization_id", organizationId).maybeSingle();

    const { getOrCreatePortalLink } = await import("../_shared/portalLink.ts");
    const portalLink = await getOrCreatePortalLink(supabase, clientId, organizationId);

    const valor = Number(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const tpl = settings?.template_baixa
      || "Pagamento confirmado! ✅\n\nCliente: {nome}\nValor: R$ {valor}\nData: {data_pagamento}\n\nObrigado pela pontualidade! 🙏";
    let message = tpl
      .replace(/{nome}/g, client.name || "Cliente")
      .replace(/{valor}/g, valor)
      .replace(/{data_pagamento}/g, new Date().toLocaleDateString("pt-BR"))
      .replace(/{titular_pix}/g, settings?.pix_holder_name || "")
      .replace(/{link_portal}/g, portalLink);
    if (portalLink && !tpl.includes("{link_portal}") && !message.includes(portalLink)) {
      message += `\n\n🔗 *Acesse seu portal:* ${portalLink}`;
    }

    const { data: instance } = await supabase
      .from("whatsapp_instances").select("*")
      .eq("organization_id", organizationId).eq("status", "connected")
      .limit(1).maybeSingle();

    const { data: gsRows } = await supabase
      .from("global_settings").select("key, value")
      .in("key", ["api_host", "global_api_key", "default_instance_name"]);
    const gs: Record<string, string> = {};
    (gsRows || []).forEach((s: any) => { gs[s.key] = s.value; });

    const apiUrl = (instance?.api_url || gs.api_host || "").replace(/\/$/, "");
    const apiKey = instance?.api_key || gs.global_api_key || "";
    const instanceName = instance?.name || gs.default_instance_name || "";

    if (!instanceName || !apiUrl || !apiKey) {
      console.warn("[pix-ocr] WhatsApp not configured — skipping confirmation");
      return;
    }

    const _d = (client.phone || "").replace(/\D/g, "");
    const cleanPhone = (_d.startsWith("55") && (_d.length === 12 || _d.length === 13)) ? _d : ((_d.length === 10 || _d.length === 11) ? "55" + _d : _d);
    const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: cleanPhone, textMessage: { text: message } }),
    });
    const ok = res.ok;
    if (!ok) console.error("[pix-ocr] WA confirmation failed", res.status, (await res.text()).slice(0, 200));

    await supabase.from("whatsapp_messages").insert({
      organization_id: organizationId,
      phone: client.phone,
      message,
      direction: "outgoing",
      status: ok ? "sent" : "failed",
      instance_id: instance?.id || null,
      client_id: clientId,
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[pix-ocr] sendPaymentConfirmation error (non-blocking)", e);
  }
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

    // After successful settlement, send WhatsApp confirmation (non-blocking, mirrors baixa-manual)
    if (result?.success && ev.client_id && ev.amount_detected) {
      await sendPaymentConfirmation(supabase, organizationId, ev.client_id, Number(ev.amount_detected));
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

      const candidateHasMatchingInvoice = async (clientId: string, amt: number | null) => {
        if (!amt) return false;
        const { data: openInvs } = await supabase
          .from("invoices").select("amount")
          .eq("organization_id", organization_id)
          .eq("client_id", clientId).eq("status", "aberto");
        return (openInvs || []).some((i: any) => Math.abs(Number(i.amount) - Number(amt)) < 0.01);
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
          if (cands.length === 0) continue;
          const top = cands[0];
          const tied = cands.filter(x => x.score === top.score);
          for (const t of tied) {
            const ok = await candidateHasMatchingInvoice(t.c.id, earlyAmount);
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

    // ===== Anti third-party safeguard =====
    // If client was identified ONLY by fuzzy name (no phone/CPF), require the amount
    // to exactly match one of the client's open invoices. Otherwise the PIX may have
    // been sent by a third party with similar name → leave for manual review.
    let amountMatchesInvoice = false;
    if (client && amount) {
      const { data: openInvs } = await supabase
        .from("invoices").select("amount")
        .eq("organization_id", organization_id)
        .eq("client_id", client.id).eq("status", "aberto");
      amountMatchesInvoice = (openInvs || []).some(
        (i: any) => Math.abs(Number(i.amount) - Number(amount)) < 0.01
      );
    }
    const requiresReview = matchSource === "fuzzy_name" && !amountMatchesInvoice;

    let eventStatus: string;
    let errorMessage: string | null = null;
    if (!amount) {
      // Sem valor detectado: se também não há marcadores de comprovante,
      // tratamos como 'ignorado' (imagem aleatória, foto do dia, etc.)
      // para não poluir métricas de saúde nem gerar ruído.
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
      errorMessage = "match por nome sem fatura compatível — possível PIX de terceiro";
    } else {
      eventStatus = "recebido";
    }

    const { data: ev, error: insErr } = await supabase
      .from("auto_settlement_events").insert({
        organization_id,
        client_id: client?.id || null,
        phone,
        raw_text: ocr?.raw_text || null,
        ocr_payload: { ...ocr, push_name: push_name || null, _match_source: matchSource, _amount_matches_invoice: amountMatchesInvoice },
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
      details: { phone, amount, txid, client_found: !!client, match_source: matchSource, amount_matches_invoice: amountMatchesInvoice, requires_review: requiresReview },
    });

    // Only auto-settle when match is trusted (phone/cpf) OR fuzzy_name + amount matches an open invoice
    if (client && amount && !requiresReview) {
      // ===== Auto-learn LID → client mapping on confident match =====
      // When we identify a client via fuzzy_name + invoice-amount match (or via CPF)
      // and the incoming "phone" is actually a WhatsApp @lid (14+ digits),
      // persist the mapping so future PIX from the same contact resolve instantly
      // by lid_map (no admin click needed).
      if (looksLikeLid && (matchSource === "fuzzy_name" || matchSource === "cpf")) {
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
