// Smart duplicate detection for PIX receipts.
// Blocks only with STRONG evidence:
//   1) Same TXID   → duplicate
//   2) Same end_to_end_id → duplicate
//   3) Same amount + same payer_name_normalized + paid within 10 min → duplicate
// Otherwise: not duplicate.

export type DupCandidate = {
  id: string;
  txid: string | null;
  pix_end_to_end_id: string | null;
  amount_detected: number | null;
  ocr_payload: any;
  processed_at: string | null;
  created_at: string;
  status: string;
};

export type DupInput = {
  organizationId: string;
  txid: string | null;
  endToEndId: string | null;
  amount: number | null;
  payerNameNormalized: string | null;
  paidAt: string | null; // ISO
  excludeEventId?: string | null;
};

function normalize(s: string | null | undefined): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function minutesDiff(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

export async function detectDuplicate(supabase: any, i: DupInput): Promise<{
  isDuplicate: boolean;
  reason: string | null;
  event: DupCandidate | null;
}> {
  // 1) TXID
  if (i.txid) {
    const { data } = await supabase
      .from("auto_settlement_events")
      .select("id, txid, pix_end_to_end_id, amount_detected, ocr_payload, processed_at, created_at, status")
      .eq("organization_id", i.organizationId)
      .eq("txid", i.txid)
      .neq("status", "erro")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.id !== i.excludeEventId) return { isDuplicate: true, reason: "same_txid", event: data };
  }
  // 2) end_to_end_id
  if (i.endToEndId) {
    const { data } = await supabase
      .from("auto_settlement_events")
      .select("id, txid, pix_end_to_end_id, amount_detected, ocr_payload, processed_at, created_at, status")
      .eq("organization_id", i.organizationId)
      .eq("pix_end_to_end_id", i.endToEndId)
      .neq("status", "erro")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.id !== i.excludeEventId) return { isDuplicate: true, reason: "same_end_to_end", event: data };
  }
  // 3) amount + payer + time window 10min
  if (i.amount && i.payerNameNormalized && i.paidAt) {
    const start = new Date(new Date(i.paidAt).getTime() - 10 * 60_000).toISOString();
    const end = new Date(new Date(i.paidAt).getTime() + 10 * 60_000).toISOString();
    const { data } = await supabase
      .from("auto_settlement_events")
      .select("id, txid, pix_end_to_end_id, amount_detected, ocr_payload, processed_at, created_at, status")
      .eq("organization_id", i.organizationId)
      .eq("amount_detected", i.amount)
      .gte("created_at", start)
      .lte("created_at", end)
      .neq("status", "erro")
      .limit(10);
    const nn = normalize(i.payerNameNormalized);
    for (const row of data || []) {
      if (row.id === i.excludeEventId) continue;
      const rowPayer = normalize(row?.ocr_payload?.sender_name || row?.ocr_payload?.push_name || "");
      if (rowPayer && rowPayer === nn) {
        return { isDuplicate: true, reason: "same_amount_payer_time", event: row };
      }
    }
  }
  return { isDuplicate: false, reason: null, event: null };
}
