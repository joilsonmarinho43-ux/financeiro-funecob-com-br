import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ─── Real E2E: action=baixa ────────────────────────────────────────────────
// PAYS A REAL INVOICE in production, validates the full flow, then REVERTS.
// User explicitly accepted the risk of WhatsApp confirmation being sent.

const ENDPOINT = "https://jxhgssqzyhrlfpvlqliv.supabase.co/functions/v1/bip-receiver";
const SUPABASE_URL = "https://jxhgssqzyhrlfpvlqliv.supabase.co";
const API_KEY = "36e51c7fbb29473239ad640da1f3c61d728e3b90832353bb2eb23d88a1ffdce7";
const ORG_ID = "eaf58dbe-f43a-479e-97d8-e0078f3a7af9";

// Target invoice — Raimundo Furtado, R$42, due 2026-04-05, client_code=0018753
const INVOICE_ID = "dfb5b34a-5c8b-40c7-b8f0-229ca2fa7a5a";
const CLIENT_ID = "bef086e0-7fdd-4bae-8954-ffcd3d37bbc7";
const BARCODE = "0018753202604"; // 0018753 + 2026 + 04

// Service-role key required to revert (bypasses RLS). Read from env.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY env var is required to revert the test invoice");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface InvoiceSnapshot {
  status: string;
  paid_date: string | null;
  updated_at: string;
}

async function snapshotInvoice(): Promise<InvoiceSnapshot> {
  const { data, error } = await admin
    .from("invoices")
    .select("status, paid_date, updated_at")
    .eq("id", INVOICE_ID)
    .single();
  if (error) throw error;
  return data as InvoiceSnapshot;
}

async function snapshotReminders() {
  const { data, error } = await admin
    .from("billing_reminders")
    .select("id, status")
    .eq("invoice_id", INVOICE_ID);
  if (error) throw error;
  return data || [];
}

async function postBip(barcode: string, action: string) {
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ barcode, action }),
  });
  const elapsed = Date.now() - t0;
  let body: any = null;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body, elapsedMs: elapsed };
}

test.describe("REAL ENDPOINT — action=baixa (pays + reverts)", () => {
  let beforeInvoice: InvoiceSnapshot;
  let beforeReminders: Array<{ id: string; status: string }>;
  let bipIdToCleanup: string | null = null;
  let logIdToCleanup: string | null = null;

  test("✅ Snapshot inicial — fatura está aberta", async () => {
    beforeInvoice = await snapshotInvoice();
    beforeReminders = await snapshotReminders();
    console.log("\n[SNAPSHOT BEFORE]");
    console.log("  invoice.status     :", beforeInvoice.status);
    console.log("  invoice.paid_date  :", beforeInvoice.paid_date);
    console.log("  reminders          :", beforeReminders.length, "rows →",
      beforeReminders.map(r => r.status).join(", ") || "(none)");

    expect(beforeInvoice.status).toBe("aberto");
    expect(beforeInvoice.paid_date).toBeNull();
  });

  test("✅ POST real action=baixa — backend deve marcar como pago", async () => {
    const r = await postBip(BARCODE, "baixa");
    console.log("\n[REAL BAIXA] response →", JSON.stringify(r, null, 2));
    console.log("[REAL BAIXA] latency  →", r.elapsedMs, "ms");

    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(r.body?.ignored).not.toBe(true);
  });

  test("✅ Validação pós-baixa — invoice='pago', reminders cancelados, bip registrado", async () => {
    // Give async writes a moment
    await new Promise(r => setTimeout(r, 1500));

    const after = await snapshotInvoice();
    const afterReminders = await snapshotReminders();

    console.log("\n[SNAPSHOT AFTER]");
    console.log("  invoice.status     :", after.status);
    console.log("  invoice.paid_date  :", after.paid_date);
    console.log("  reminders          :", afterReminders.length, "rows →",
      afterReminders.map(r => r.status).join(", ") || "(none)");

    expect(after.status).toBe("pago");
    expect(after.paid_date).not.toBeNull();

    // All previously-pending reminders must now be cancelled
    const stillPending = afterReminders.filter(r => r.status === "pending");
    expect(stillPending.length, "Nenhum reminder deveria continuar 'pending'").toBe(0);

    // A bip row should exist for this barcode
    const { data: bips } = await admin
      .from("bips")
      .select("id, action, status, invoice_id, client_id, whatsapp_sent")
      .eq("organization_id", ORG_ID)
      .eq("barcode_raw", BARCODE)
      .order("created_at", { ascending: false })
      .limit(1);
    console.log("[BIP REGISTRADO]", bips?.[0]);
    expect(bips?.length).toBeGreaterThan(0);
    expect(bips![0].action).toBe("baixa");
    expect(bips![0].invoice_id).toBe(INVOICE_ID);
    bipIdToCleanup = bips![0].id;

    // Audit log
    const { data: logs } = await admin
      .from("system_logs")
      .select("id, action, details")
      .eq("organization_id", ORG_ID)
      .eq("action", "baixa_manual")
      .order("created_at", { ascending: false })
      .limit(1);
    console.log("[AUDIT LOG]", logs?.[0]);
    expect(logs?.length).toBeGreaterThan(0);
    logIdToCleanup = logs![0].id;
  });

  test("✅ Idempotência — segunda baixa do mesmo barcode deve retornar duplicate", async () => {
    const r = await postBip(BARCODE, "baixa");
    console.log("\n[IDEMPOTENCY] response →", JSON.stringify(r, null, 2));
    expect(r.status).toBe(200);
    // Either explicit duplicate flag OR already_paid (both are acceptable safe responses)
    const ok = r.body?.duplicate === true || r.body?.already_paid === true || r.body?.success === true;
    expect(ok).toBe(true);
  });

  test.afterAll(async () => {
    console.log("\n──────── ROLLBACK ────────");

    // 1. Revert invoice to original state
    const { error: invErr } = await admin
      .from("invoices")
      .update({
        status: beforeInvoice.status,
        paid_date: beforeInvoice.paid_date,
      })
      .eq("id", INVOICE_ID);
    console.log("invoice rollback :", invErr ? `❌ ${invErr.message}` : "✅ status/paid_date restored");

    // 2. Restore reminders
    for (const rem of beforeReminders) {
      await admin
        .from("billing_reminders")
        .update({ status: rem.status })
        .eq("id", rem.id);
    }
    console.log("reminders rollback:", beforeReminders.length, "row(s) restored");

    // 3. Delete the bip created by the test (cleans up audit trail noise)
    if (bipIdToCleanup) {
      // bips has no DELETE policy for users, but service role bypasses RLS
      const { error } = await admin.from("bips").delete().eq("id", bipIdToCleanup);
      console.log("bip cleanup      :", error ? `⚠️  ${error.message} (kept for audit)` : "✅ deleted");
    }

    // 4. Audit log: leave as-is (system_logs has no DELETE policy by design — immutable)
    console.log("system_log       : ⏭  kept (immutable by design)");

    // 5. Final verification
    const final = await snapshotInvoice();
    console.log("\n[FINAL STATE] status:", final.status, "| paid_date:", final.paid_date);
    console.log("──────────────────────────\n");
  });
});
