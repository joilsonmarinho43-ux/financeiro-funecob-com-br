// Trusted payers: histórico "pagador X paga para cliente Y".
// Aumenta confiança em PIX de terceiro quando o mesmo pagador já quitou antes.

export function normalizeName(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function findTrustedPayer(
  supabase: any,
  organizationId: string,
  payerName: string | null,
  payerDocument: string | null,
): Promise<{ client_id: string; payment_count: number; confidence: number } | null> {
  if (!payerName && !payerDocument) return null;
  const nn = normalizeName(payerName);

  // Prefer document match (very strong)
  if (payerDocument) {
    const doc = payerDocument.replace(/\D/g, "");
    if (doc.length >= 11) {
      const { data } = await supabase
        .from("pix_trusted_payers")
        .select("client_id, payment_count")
        .eq("organization_id", organizationId)
        .eq("payer_document", doc)
        .order("payment_count", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return { client_id: data.client_id, payment_count: data.payment_count, confidence: 98 };
    }
  }

  if (nn) {
    const { data } = await supabase
      .from("pix_trusted_payers")
      .select("client_id, payment_count")
      .eq("organization_id", organizationId)
      .eq("payer_name_normalized", nn)
      .order("payment_count", { ascending: false })
      .limit(2);
    if (data && data.length === 1) {
      // 2+ payments = "conhecido"
      const conf = data[0].payment_count >= 2 ? 88 : 70;
      return { client_id: data[0].client_id, payment_count: data[0].payment_count, confidence: conf };
    }
  }
  return null;
}

export async function recordTrustedPayer(
  supabase: any,
  organizationId: string,
  clientId: string,
  payerName: string | null,
  payerDocument: string | null,
  amount: number | null,
): Promise<void> {
  const nn = normalizeName(payerName);
  if (!nn) return;
  const doc = (payerDocument || "").replace(/\D/g, "") || null;
  try {
    // Upsert with counter increment via RPC-less approach: read, then upsert
    const { data: cur } = await supabase
      .from("pix_trusted_payers")
      .select("id, payment_count")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .eq("payer_name_normalized", nn)
      .maybeSingle();
    if (cur) {
      await supabase
        .from("pix_trusted_payers")
        .update({
          payment_count: (cur.payment_count || 0) + 1,
          last_amount: amount,
          last_paid_at: new Date().toISOString(),
          payer_document: doc || undefined,
        })
        .eq("id", cur.id);
    } else {
      await supabase.from("pix_trusted_payers").insert({
        organization_id: organizationId,
        client_id: clientId,
        payer_name_normalized: nn,
        payer_document: doc,
        payment_count: 1,
        last_amount: amount,
        last_paid_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn("[trustedPayers] record failed", String((e as any)?.message || e));
  }
}
