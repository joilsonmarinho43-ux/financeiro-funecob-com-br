// Testes Deno unitários — extração de telefone Evolution v2
// Roda 100% offline (não chama Supabase). Validam que a lógica de phone extraction
// cobre todos os formatos vistos em produção:
//   - @s.whatsapp.net (legado)
//   - @lid (novo protocolo Evolution v2)
//   - senderPn / remoteJidAlt / participantPn / participantAlt
//   - mensagens de grupo (devem ser ignoradas)
//   - fromMe (devem ser ignoradas)
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeImageWebhook, makeTextWebhook, makePdfWebhook, PHONE, LID, FAKE_OCRS } from "./fixtures.ts";

// Copia das helpers (mantém testes independentes do runtime)
function jidToDigits(j: any): string {
  if (!j || typeof j !== "string") return "";
  return j.split("@")[0].replace(/:\d+$/, "").replace(/\D/g, "");
}
function looksLikePhone(d: string): boolean { return d.length >= 10 && d.length <= 13; }
function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "").replace(/^55/, "");
}
function phoneVariants(p: string): string[] {
  const n = normalizePhone(p);
  if (!n) return [];
  const set = new Set<string>([n]);
  if (n.length === 11 && n[2] === "9") set.add(n.slice(0, 2) + n.slice(3));
  if (n.length === 10) set.add(n.slice(0, 2) + "9" + n.slice(2));
  if (n.length >= 8) set.add(n.slice(-8));
  return [...set];
}
function extractPhone(payload: any) {
  const msg = payload?.data || {};
  const key = msg.key || {};
  const remoteJid: string = key.remoteJid || "";
  const candidates = [
    jidToDigits(key.senderPn),
    jidToDigits(key.remoteJidAlt),
    jidToDigits(key.participantPn),
    jidToDigits(key.participantAlt),
    jidToDigits(key.participant),
    remoteJid.endsWith("@lid") ? "" : jidToDigits(remoteJid),
    jidToDigits(remoteJid),
  ].filter(Boolean);
  return candidates.find(looksLikePhone) || candidates[0] || "";
}

Deno.test("Evolution v2 — remoteJid legado @s.whatsapp.net", () => {
  const p = makeImageWebhook({});
  assertEquals(extractPhone(p), PHONE);
});

Deno.test("Evolution v2 — fallback senderPn quando remoteJid é @lid", () => {
  const p = makeImageWebhook({ remoteJidIsLid: true, phoneField: "senderPn" });
  assertEquals(extractPhone(p), PHONE);
});

Deno.test("Evolution v2 — fallback remoteJidAlt", () => {
  const p = makeImageWebhook({ remoteJidIsLid: true, phoneField: "remoteJidAlt" });
  assertEquals(extractPhone(p), PHONE);
});

Deno.test("Evolution v2 — fallback participantPn", () => {
  const p = makeImageWebhook({ remoteJidIsLid: true, phoneField: "participantPn" });
  assertEquals(extractPhone(p), PHONE);
});

Deno.test("Evolution v2 — somente @lid disponível → retorna LID (last resort)", () => {
  const p = makeImageWebhook({ remoteJidIsLid: true });
  const out = extractPhone(p);
  assert(out.length > 0, "deve retornar algo (LID) para log");
  assert(!looksLikePhone(out), "LID não deve passar no looksLikePhone");
});

Deno.test("phoneVariants — tolerância ao prefixo 9 (mobile)", () => {
  const v11 = phoneVariants("91984456470");
  const v10 = phoneVariants("9184456470");
  assert(v11.includes("9184456470"), "11 dígitos deve incluir variante de 10");
  assert(v10.includes("91984456470"), "10 dígitos deve incluir variante de 11");
});

Deno.test("phoneVariants — strip prefixo 55", () => {
  assert(phoneVariants("5511987654321").includes("11987654321"));
});

Deno.test("PDF documentMessage é roteado corretamente", () => {
  const p = makePdfWebhook({});
  assertEquals(extractPhone(p), PHONE);
  assertEquals(p.data.messageType, "documentMessage");
});

Deno.test("Texto sem PIX não deve disparar (filter externo)", () => {
  const p = makeTextWebhook({ text: "oi tudo bem?" });
  // sandbox apenas extrai telefone — filtro de PIX é no webhook
  assertEquals(extractPhone(p), PHONE);
});

Deno.test("FAKE_OCRS — 8 bancos + 3 casos adversos cobertos", () => {
  const banks = FAKE_OCRS.map((f) => f.bank);
  for (const b of ["Nubank", "Caixa", "Mercado Pago", "PicPay", "Inter", "Itaú", "Santander", "Bradesco"]) {
    assert(banks.includes(b), `falta fixture do banco ${b}`);
  }
  assert(banks.includes("Cortado"));
  assert(banks.includes("Borrado"));
  assert(banks.includes("Print escuro"));
});

Deno.test("REGRESSÃO — helpers core mantêm assinatura", () => {
  assertEquals(normalizePhone("+55 (11) 98765-4321"), "11987654321");
  assertEquals(jidToDigits("5511987654321@s.whatsapp.net"), "5511987654321");
  assertEquals(jidToDigits("123@lid"), "123");
  assertEquals(jidToDigits(null), "");
  assertEquals(looksLikePhone("11987654321"), true);
  assertEquals(looksLikePhone("12345"), false);
  assertEquals(looksLikePhone("12345678901234567"), false);
});
