// Recibo PDF + envio WhatsApp (texto enriquecido + anexo)
// Usado por pix-ocr-settlement e auto-settlement-assign-client.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

// --- Evolution API: fallback por variáveis de ambiente (VPS própria) ---
// Precedência: whatsapp_instances > global_settings > ENV.
function envEvolutionUrl(): string {
  return (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
}
function envEvolutionKey(): string {
  return Deno.env.get("EVOLUTION_API_KEY") || "";
}


export interface PaidInvoice {
  id: string;
  amount: number;
  due_date: string;       // YYYY-MM-DD
  description: string | null;
  was_generated: boolean; // true = antecipada (gerada+paga no ato)
}

function fmtBRL(n: number): string {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateBR(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d.includes("T") ? d : d + "T12:00:00") : d;
  return dt.toLocaleDateString("pt-BR");
}
function competenciaBR(due: string): string {
  const dt = new Date(due + "T12:00:00");
  return dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * Confirmações de pagamento NÃO devem carregar URL no texto.
 * Alguns provedores WhatsApp ignoram `linkPreview: false` e geram o card no topo
 * sempre que detectam qualquer URL. Para garantir que nunca apareça link/card no
 * início, removemos links e linhas órfãs de portal da mensagem de confirmação.
 */
export function removePaymentConfirmationLinks(message: string): string {
  return (message || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:financeiro[-.]funecob[-.]com[-.]br|funecob\.com\.br)\S*/gi, "")
    .split("\n")
    .filter((line) => {
      const cleaned = line.replace(/[\s:*_🔗👉➡️.-]/g, "").toLowerCase();
      if (!cleaned) return true;
      return !["acesse seu portal", "seu portal", "portaldocliente", "portal"].includes(cleaned);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function receiptNumber(eventId: string): string {
  return "REC-" + eventId.replace(/-/g, "").slice(0, 10).toUpperCase();
}

/** Busca as faturas efetivamente quitadas pelo evento. */
export async function fetchPaidInvoices(
  supabase: any,
  eventId: string,
): Promise<PaidInvoice[]> {
  const { data: allocs } = await supabase
    .from("auto_settlement_allocations")
    .select("invoice_id, amount_applied, was_generated")
    .eq("event_id", eventId);
  if (!allocs?.length) return [];
  const ids = allocs.map((a: any) => a.invoice_id);
  const { data: invs } = await supabase
    .from("invoices")
    .select("id, amount, due_date, description")
    .in("id", ids);
  return (invs || []).map((i: any) => {
    const a = allocs.find((x: any) => x.invoice_id === i.id);
    return {
      id: i.id,
      amount: Number(a?.amount_applied || i.amount),
      due_date: i.due_date,
      description: i.description,
      was_generated: !!a?.was_generated,
    };
  });
}

/** Gera o PDF do recibo. */
export async function generateReceiptPdf(params: {
  orgName: string;
  clientName: string;
  clientDocument?: string | null;
  receiptNo: string;
  paymentDate: Date;
  totalAmount: number;
  paidInvoices: PaidInvoice[];
  pixHolderName?: string | null;
  txid?: string | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.06, 0.13, 0.27);
  const gray = rgb(0.35, 0.35, 0.4);
  const line = rgb(0.85, 0.85, 0.9);

  let y = 800;
  const left = 50;
  const right = 545;

  // Header
  page.drawRectangle({ x: 0, y: 802, width: 595, height: 40, color: navy });
  page.drawText(params.orgName.slice(0, 60), { x: left, y: 815, size: 14, font: bold, color: rgb(1, 1, 1) });
  page.drawText("RECIBO DE PAGAMENTO", { x: right - bold.widthOfTextAtSize("RECIBO DE PAGAMENTO", 12), y: 815, size: 12, font: bold, color: rgb(1, 1, 1) });

  y = 770;
  page.drawText(`Nº ${params.receiptNo}`, { x: left, y, size: 11, font: bold, color: navy });
  page.drawText(`Emitido em ${fmtDateBR(params.paymentDate)} ${params.paymentDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, {
    x: right - font.widthOfTextAtSize(`Emitido em ${fmtDateBR(params.paymentDate)} ${params.paymentDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, 9),
    y, size: 9, font, color: gray,
  });

  y -= 25;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line, thickness: 1 });

  // Confirmação
  y -= 30;
  page.drawText("Status:", { x: left, y, size: 10, font, color: gray });
  page.drawText("CONFIRMADO", { x: left + 50, y, size: 11, font: bold, color: rgb(0.05, 0.5, 0.15) });

  y -= 25;
  page.drawText("Cliente:", { x: left, y, size: 10, font, color: gray });
  page.drawText(params.clientName, { x: left + 60, y, size: 11, font: bold, color: navy });
  if (params.clientDocument) {
    y -= 16;
    page.drawText("Documento:", { x: left, y, size: 10, font, color: gray });
    page.drawText(params.clientDocument, { x: left + 70, y, size: 10, font, color: navy });
  }

  // Tabela de faturas
  y -= 35;
  page.drawText("Mensalidades quitadas:", { x: left, y, size: 10, font: bold, color: navy });
  y -= 18;
  page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 20, color: rgb(0.95, 0.96, 0.99) });
  page.drawText("Vencimento", { x: left + 8, y, size: 9, font: bold, color: navy });
  page.drawText("Competência", { x: left + 110, y, size: 9, font: bold, color: navy });
  page.drawText("Descrição", { x: left + 230, y, size: 9, font: bold, color: navy });
  page.drawText("Valor", { x: right - 60, y, size: 9, font: bold, color: navy });

  y -= 18;
  for (const inv of params.paidInvoices) {
    page.drawText(fmtDateBR(inv.due_date), { x: left + 8, y, size: 9, font, color: navy });
    page.drawText(competenciaBR(inv.due_date), { x: left + 110, y, size: 9, font, color: navy });
    const desc = (inv.description || "Mensalidade").slice(0, 30) + (inv.was_generated ? " (antecip.)" : "");
    page.drawText(desc, { x: left + 230, y, size: 9, font, color: navy });
    const v = fmtBRL(inv.amount);
    page.drawText(v, { x: right - 8 - font.widthOfTextAtSize(v, 9), y, size: 9, font, color: navy });
    y -= 16;
  }

  // Total
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: line });
  y -= 20;
  page.drawText("TOTAL PAGO:", { x: right - 180, y, size: 11, font: bold, color: navy });
  const tot = fmtBRL(params.totalAmount);
  page.drawText(tot, { x: right - 8 - bold.widthOfTextAtSize(tot, 13), y: y - 2, size: 13, font: bold, color: rgb(0.05, 0.5, 0.15) });

  // Footer info
  y -= 50;
  page.drawText("Forma de pagamento: PIX (identificado via WhatsApp)", { x: left, y, size: 9, font, color: gray });
  if (params.pixHolderName) {
    y -= 14;
    page.drawText(`Recebido em: ${params.pixHolderName}`, { x: left, y, size: 9, font, color: gray });
  }
  if (params.txid) {
    y -= 14;
    page.drawText(`ID transação: ${params.txid.slice(0, 70)}`, { x: left, y, size: 8, font, color: gray });
  }

  // Footer
  page.drawLine({ start: { x: left, y: 60 }, end: { x: right, y: 60 }, color: line });
  page.drawText("Este recibo é gerado automaticamente pelo sistema FuneCob. Guarde-o como comprovante.",
    { x: left, y: 45, size: 8, font, color: gray });

  return await doc.save();
}

/** Upload PDF para o bucket e retorna signed URL (1 ano). */
export async function uploadReceiptPdf(
  supabase: any,
  organizationId: string,
  eventId: string,
  pdfBytes: Uint8Array,
): Promise<string | null> {
  const path = `${organizationId}/${eventId}.pdf`;
  const { error: upErr } = await supabase.storage.from("receipts").upload(path, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    console.error("[paymentReceipt] upload failed", upErr);
    return null;
  }
  const { data: signed, error: sErr } = await supabase.storage.from("receipts")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (sErr) {
    console.error("[paymentReceipt] sign failed", sErr);
    return null;
  }
  return signed?.signedUrl || null;
}

/** Constrói o texto da confirmação (com data pgto + vencimento). */
export function buildConfirmationText(params: {
  clientName: string;
  totalAmount: number;
  paymentDate: Date;
  paidInvoices: PaidInvoice[];
  receiptNo: string;
  portalLink?: string;
  customTemplate?: string | null;
  pixHolderName?: string | null;
}): string {
  const valorFull = fmtBRL(params.totalAmount);
  // {valor} é entregue sem "R$ " para evitar duplicidade quando o template
  // já contém o prefixo (ex.: "Valor: R$ {valor}").
  const valor = valorFull.replace(/^R\$\s?/, "");
  const dataPgto = fmtDateBR(params.paymentDate);
  const venc = params.paidInvoices.map(i => fmtDateBR(i.due_date)).join(", ");
  const comp = params.paidInvoices.map(i => competenciaBR(i.due_date)).join(", ");

  // Se houver template custom, faz substituição preservando-o
  if (params.customTemplate && params.customTemplate.trim()) {
    let msg = params.customTemplate
      .replace(/\*?\{nome\}\*?/g, `**`)
      .replace(/{valor}/g, valor)
      .replace(/{data_pagamento}/g, dataPgto)
      .replace(/{data_vencimento}/g, venc || dataPgto)
      .replace(/{competencia}/g, comp)
      .replace(/{recibo}/g, params.receiptNo)
      .replace(/{titular_pix}/g, params.pixHolderName || "")
      .replace(/{link_portal}/g, "");
    return removePaymentConfirmationLinks(msg);
  }

  // Template padrão (novo)
  let msg =
`Olá, ${params.clientName}!

Seu pagamento foi identificado e registrado com sucesso. ✅

💰 Valor pago: ${valorFull}
📅 Data do pagamento: ${dataPgto}
📌 Vencimento da mensalidade: ${venc}
🗓️ Competência: ${comp}
🧾 Recibo: ${params.receiptNo}

Sua mensalidade foi baixada automaticamente em nosso sistema.

Obrigado pela confiança e pela pontualidade! 🙏

_Equipe Financeira_`;
  return removePaymentConfirmationLinks(msg);
}

/** Resolve dígitos de destino.
 *  Regra: SEMPRE prioriza o telefone cadastrado do cliente quando disponível.
 *  A origem (quem enviou o comprovante no WhatsApp) pode ser terceiro
 *  (familiar, contador, outro cliente encaminhando) — enviar a confirmação
 *  para ela faria o dono errado receber a mensagem. Só cai para a origem
 *  quando o cliente não tem telefone cadastrado válido. */
export function resolveDestinationDigits(originPhone: string, cadastroPhone: string | null): {
  destination: string; isLidFallback: boolean; isDivergent: boolean;
} {
  const origin = (originPhone || "").replace(/\D/g, "");
  const cadastro = (cadastroPhone || "").replace(/\D/g, "");
  const tail = (s: string) => s.slice(-8);
  const hasCadastro = cadastro.length >= 10;
  const isLid = origin.length >= 14;
  const isDivergent = hasCadastro && tail(cadastro) !== tail(origin);
  const useCadastro = hasCadastro && (isLid || isDivergent);
  const effective = useCadastro ? cadastro : (origin || cadastro);
  const dest = (effective.startsWith("55") && (effective.length === 12 || effective.length === 13))
    ? effective
    : ((effective.length === 10 || effective.length === 11) ? "55" + effective : effective);
  return {
    destination: dest,
    isLidFallback: useCadastro && isLid,
    isDivergent,
  };
}

/** Envia mensagem de texto + (opcional) anexo PDF via Evolution. */
export async function sendWhatsAppWithReceipt(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  destination: string;
  text: string;
  pdfUrl?: string | null;
  receiptNo: string;
}): Promise<{ textSent: boolean; mediaSent: boolean }> {
  const base = params.apiUrl.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", apikey: params.apiKey };

  let textSent = false;
  try {
    const r = await fetch(`${base}/message/sendText/${params.instanceName}`, {
      method: "POST", headers,
      body: JSON.stringify({ number: params.destination, textMessage: { text: params.text }, linkPreview: false }),
    });
    textSent = r.ok;
    if (!r.ok) console.error("[paymentReceipt] sendText fail", r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error("[paymentReceipt] sendText error", e); }

  let mediaSent = false;
  if (params.pdfUrl) {
    try {
      const r = await fetch(`${base}/message/sendMedia/${params.instanceName}`, {
        method: "POST", headers,
        body: JSON.stringify({
          number: params.destination,
          mediaMessage: {
            mediatype: "document",
            mimetype: "application/pdf",
            media: params.pdfUrl,
            fileName: `${params.receiptNo}.pdf`,
            caption: "🧾 Seu recibo de pagamento",
          },
        }),
      });
      mediaSent = r.ok;
      if (!r.ok) console.error("[paymentReceipt] sendMedia fail", r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.error("[paymentReceipt] sendMedia error", e); }
  }
  return { textSent, mediaSent };
}

/** Orquestrador completo: gera recibo + envia texto + anexa PDF + loga.
 *  Não bloqueia o fluxo da baixa em caso de falha (try/catch externo). */
export async function deliverPaymentConfirmation(
  supabase: any,
  args: {
    organizationId: string;
    eventId: string;
    clientId: string;
    originPhone: string;
    totalAmount: number;
    txid?: string | null;
  },
): Promise<{ ok: boolean; pdfUrl?: string | null; receiptNo: string }> {
  const receiptNo = receiptNumber(args.eventId);

  // 1) Dados do cliente + org + settings em paralelo
  const [{ data: client }, { data: org }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("name, phone, document").eq("id", args.clientId).single(),
    supabase.from("organizations").select("name").eq("id", args.organizationId).single(),
    supabase.from("billing_settings").select("template_baixa, pix_holder_name").eq("organization_id", args.organizationId).maybeSingle(),
  ]);
  if (!client) return { ok: false, receiptNo };

  // Origem inválida → bloqueia envio (mas baixa continua válida)
  const originDigits = (args.originPhone || "").replace(/\D/g, "");
  if (originDigits.length < 10) {
    await supabase.from("auto_settlement_logs").insert({
      organization_id: args.organizationId, event_id: args.eventId, client_id: args.clientId,
      action: "confirmation_blocked",
      details: { reason: "origem_invalida", origin: originDigits, status: "DESTINATARIO_DIVERGENTE" },
    });
    return { ok: false, receiptNo };
  }

  // 2) Buscar faturas pagas + portal link em paralelo
  const { getOrCreatePortalLink } = await import("./portalLink.ts");
  const [paidInvoices, portalLink] = await Promise.all([
    fetchPaidInvoices(supabase, args.eventId),
    getOrCreatePortalLink(supabase, args.clientId, args.organizationId),
  ]);

  // 3) Gerar PDF + upload
  let pdfUrl: string | null = null;
  try {
    const pdfBytes = await generateReceiptPdf({
      orgName: org?.name || "Sistema Financeiro",
      clientName: client.name || "Cliente",
      clientDocument: client.document,
      receiptNo,
      paymentDate: new Date(),
      totalAmount: args.totalAmount,
      paidInvoices,
      pixHolderName: settings?.pix_holder_name,
      txid: args.txid,
    });
    pdfUrl = await uploadReceiptPdf(supabase, args.organizationId, args.eventId, pdfBytes);
    await supabase.from("auto_settlement_logs").insert({
      organization_id: args.organizationId, event_id: args.eventId, client_id: args.clientId,
      action: "receipt_generated", details: { receipt_no: receiptNo, pdf_url: pdfUrl, invoices: paidInvoices.length },
    });
  } catch (e: any) {
    console.error("[paymentReceipt] PDF gen error", e);
    await supabase.from("auto_settlement_logs").insert({
      organization_id: args.organizationId, event_id: args.eventId, client_id: args.clientId,
      action: "receipt_generation_failed", details: { error: String(e?.message || e) },
    });
  }

  // 4) Resolver credenciais WhatsApp
  const { data: instance } = await supabase
    .from("whatsapp_instances").select("*")
    .eq("organization_id", args.organizationId).eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1).maybeSingle();
  const { data: gsRows } = await supabase
    .from("global_settings").select("key, value")
    .in("key", ["api_host", "global_api_key"]);
  const gs: Record<string, string> = {};
  (gsRows || []).forEach((s: any) => { gs[s.key] = s.value; });
  const apiUrl = instance?.api_url || gs.api_host || envEvolutionUrl();
  const apiKey = instance?.api_key || gs.global_api_key || envEvolutionKey();
  const instanceName = instance?.name || "";
  if (!apiUrl || !apiKey || !instanceName) {
    await supabase.from("auto_settlement_logs").insert({
      organization_id: args.organizationId, event_id: args.eventId, client_id: args.clientId,
      action: "confirmation_blocked", details: { reason: "whatsapp_not_configured" },
    });
    return { ok: false, pdfUrl, receiptNo };
  }

  // 5) Destino: origem é prioridade; se @lid → cadastro
  const { destination, isLidFallback, isDivergent } = resolveDestinationDigits(args.originPhone, client.phone);

  // 6) Texto
  const text = buildConfirmationText({
    clientName: client.name || "Cliente",
    totalAmount: args.totalAmount,
    paymentDate: new Date(),
    paidInvoices,
    receiptNo,
    portalLink: portalLink || undefined,
    customTemplate: settings?.template_baixa,
    pixHolderName: settings?.pix_holder_name,
  });

  // 7) Enviar texto + anexo
  const result = await sendWhatsAppWithReceipt({
    apiUrl, apiKey, instanceName, destination, text, pdfUrl, receiptNo,
  });

  // 8) Log + histórico
  await supabase.from("whatsapp_messages").insert({
    organization_id: args.organizationId,
    phone: args.originPhone,
    message: text,
    direction: "outgoing",
    status: result.textSent ? "sent" : "failed",
    instance_id: instance?.id || null,
    client_id: args.clientId,
    sent_at: new Date().toISOString(),
  });
  await supabase.from("auto_settlement_logs").insert({
    organization_id: args.organizationId, event_id: args.eventId, client_id: args.clientId,
    action: "confirmation_sent",
    details: {
      payment_event_id: args.eventId, client_id_baixa: args.clientId,
      telefone_origem: args.originPhone, telefone_destino: destination, telefone_cadastro: client.phone,
      divergente_cadastro: isDivergent, lid_fallback_cadastro: isLidFallback,
      text_sent: result.textSent, media_sent: result.mediaSent,
      receipt_no: receiptNo, pdf_url: pdfUrl,
      timestamp: new Date().toISOString(),
    },
  });

  return { ok: result.textSent, pdfUrl, receiptNo };
}
