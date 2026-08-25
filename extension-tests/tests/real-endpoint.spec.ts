import { test, expect } from "@playwright/test";

// Real E2E against production bip-receiver — action=retorno (safe, doesn't change invoice status)
const ENDPOINT = "https://jxhgssqzyhrlfpvlqliv.supabase.co/functions/v1/bip-receiver";
const API_KEY  = process.env.BIP_API_KEY;
const ORG_ID   = "eaf58dbe-f43a-479e-97d8-e0078f3a7af9";

if (!API_KEY) {
  throw new Error("BIP_API_KEY environment variable is required to run these real endpoint tests.");
}

// Org config: client_id_length=7, year_length=4, month_length=2 → total 13
// Cliente real: client_code=0021674 (Sebastiana), invoice due 2026-04-22 → 0021674 + 2026 + 04
const VALID_BARCODE   = "0021674202604";
const INVALID_BARCODE = "9999999202604"; // valid length but no client with this code
const SHORT_BARCODE   = "12345678";       // wrong length, must be ignored

async function postBip(barcode: string, action = "retorno") {
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

test.describe("REAL ENDPOINT — bip-receiver de produção", () => {
  test("✅ Cenário REAL 1: barcode VÁLIDO existente (action=retorno)", async () => {
    const r = await postBip(VALID_BARCODE, "retorno");
    console.log("\n[REAL 1] VALID barcode →", JSON.stringify(r, null, 2));
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    // Backend deve achar o cliente — não pode vir ignored
    expect(r.body?.ignored).not.toBe(true);
  });

  test("✅ Cenário REAL 2: barcode com tamanho válido mas SEM cliente correspondente", async () => {
    const r = await postBip(INVALID_BARCODE, "retorno");
    console.log("\n[REAL 2] UNKNOWN client →", JSON.stringify(r, null, 2));
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    // Regra de ouro: agir como se nunca tivesse acontecido → ignored:true
    expect(r.body?.ignored).toBe(true);
  });

  test("✅ Cenário REAL 3: barcode CURTO (8 dígitos) — backend deve ignorar silenciosamente", async () => {
    const r = await postBip(SHORT_BARCODE, "retorno");
    console.log("\n[REAL 3] SHORT barcode →", JSON.stringify(r, null, 2));
    expect(r.status).toBe(200);
    expect(r.body?.ignored).toBe(true);
  });

  test("✅ Cenário REAL 4: SEM action — backend deve retornar ignored", async () => {
    // Use a unique unknown barcode to bypass idempotency cache from previous tests
    const uniqueBarcode = "8888888202604";
    // @ts-ignore
    const r = await postBip(uniqueBarcode, undefined as any);
    console.log("\n[REAL 4] NO action →", JSON.stringify(r, null, 2));
    expect(r.status).toBe(200);
    expect(r.body?.ignored).toBe(true);
  });

  test("✅ Cenário REAL 5: medição de tempo de resposta (5 chamadas)", async () => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await postBip(VALID_BARCODE, "retorno");
      times.push(r.elapsedMs);
    }
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);
    console.log(`\n[REAL 5] Latência (5 chamadas): min=${min}ms avg=${avg}ms max=${max}ms — todas:`, times);
    expect(avg).toBeLessThan(5000);
  });
});

test.afterAll(async () => {
  console.log("\n──────── ORG TESTADA ────────");
  console.log("organization_id:", ORG_ID);
  console.log("endpoint       :", ENDPOINT);
  console.log("barcode válido :", VALID_BARCODE);
  console.log("──────────────────────────────\n");
});
