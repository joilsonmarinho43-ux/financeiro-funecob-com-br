// DEBUG-ONLY: gera e faz upload do PDF do recibo para um event_id já existente.
// Não envia mensagem nenhuma. Apaga depois.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  fetchPaidInvoices, generateReceiptPdf, uploadReceiptPdf, buildConfirmationText,
} from "../_shared/paymentReceipt.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { event_id } = await req.json();
  const supabase = createClient(URL, KEY);

  const { data: ev } = await supabase.from("auto_settlement_events").select("*").eq("id", event_id).single();
  if (!ev) return new Response(JSON.stringify({ error: "no event" }), { status: 404, headers: cors });

  const [{ data: cli }, { data: org }, { data: settings }, paid] = await Promise.all([
    supabase.from("clients").select("name, phone, document").eq("id", ev.client_id).single(),
    supabase.from("organizations").select("name").eq("id", ev.organization_id).single(),
    supabase.from("billing_settings").select("template_baixa, pix_holder_name").eq("organization_id", ev.organization_id).maybeSingle(),
    fetchPaidInvoices(supabase, ev.id),
  ]);

  const receiptNo = "REC-" + ev.id.replace(/-/g, "").slice(0, 10).toUpperCase();
  const pdfBytes = await generateReceiptPdf({
    orgName: org?.name || "Test Org",
    clientName: cli?.name || "Cliente",
    clientDocument: cli?.document,
    receiptNo,
    paymentDate: new Date(ev.processed_at || Date.now()),
    totalAmount: Number(ev.amount_detected),
    paidInvoices: paid,
    pixHolderName: settings?.pix_holder_name,
    txid: ev.txid,
  });
  const url = await uploadReceiptPdf(supabase, ev.organization_id, ev.id + "-test", pdfBytes);

  const text = buildConfirmationText({
    clientName: cli?.name || "Cliente",
    totalAmount: Number(ev.amount_detected),
    paymentDate: new Date(ev.processed_at || Date.now()),
    paidInvoices: paid,
    receiptNo,
    portalLink: "https://exemplo.com/portal/abc",
    customTemplate: settings?.template_baixa,
    pixHolderName: settings?.pix_holder_name,
  });

  return new Response(JSON.stringify({
    pdfUrl: url, receiptNo, paidInvoices: paid, text, pdfSizeKB: Math.round(pdfBytes.length / 1024),
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});
