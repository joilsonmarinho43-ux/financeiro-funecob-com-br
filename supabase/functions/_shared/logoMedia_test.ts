import { logoStoragePath, loadOrganizationLogo } from "./logoMedia.ts";
import { compactPixBlock, COMPACT_REMINDER_TEMPLATE } from "./compactReminder.ts";
import { sendEvolutionText } from "./evolutionSend.ts";
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }

Deno.test("Storage logo is restricted to caller's organization and bucket", () => {
  const prefix = "https://api.test/storage/v1/object/public/logos/";
  assert(logoStoragePath(prefix + "org/logo-123.png", "org") === "org/logo-123.png", "valid upload");
  assert(logoStoragePath(prefix + "other/logo.png", "org") === null, "other organization");
  assert(logoStoragePath(prefix + "org%2F..%2Fother.png", "org") === null, "encoded traversal");
  assert(logoStoragePath("https://private.test/logo.png", "org") === null, "arbitrary URL");
  assert(logoStoragePath(prefix + "org/logo.svg", "org") === null, "unsupported format");
});

Deno.test("uploaded logo is fetched via trusted Storage and updates without baked asset", async () => {
  let requested = "";
  const supabase = { storage: { from: (bucket: string) => ({ download: async (path: string) => {
    assert(bucket === "logos", "trusted bucket"); requested = path;
    return { data: new Blob([new Uint8Array([255,216,255,0])]), error: null };
  } }) } };
  const logo = await loadOrganizationLogo(supabase, "org", { logo_url: "https://api.test/storage/v1/object/public/logos/org/logo-new.jpg" });
  assert(requested === "org/logo-new.jpg" && logo?.mimetype === "image/jpeg", "uses current upload");
  assert(await loadOrganizationLogo(supabase, "org", { logo_url: null }) === null, "removed logo");
});

Deno.test("compact reminder preserves exact billing data without repetitions", () => {
  const message = COMPACT_REMINDER_TEMPLATE.replace("{nome}", "*Teste*").replace("{valor}", "R$ 44,00")
    .replace("{vencimento}", "02/11/2026").replace("{link_ou_chave_pix}", compactPixBlock("chave-exemplo"))
    .replace("{link_portal}", "https://portal.test/token");
  assert(message.length < 300, "compact caption");
  assert(message.split("R$ 44,00").length === 2 && message.includes("02/11/2026"), "exact value and due date");
  assert(message.includes("chave-exemplo") && message.includes("https://portal.test/token"), "payment and portal preserved");
  assert(!message.includes("Instruções") && !message.includes("━━"), "no long instructions");
});

Deno.test("unavailable uploaded logo falls back to text before any provider send", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ key: { id: "text-safe" } }), { status: 201 });
  };
  const supabase = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Sol da Vida", logo_url: "https://api.test/storage/v1/object/public/logos/org/logo.png" }, error: null }) }) }) }),
    storage: { from: () => ({ download: async () => ({ data: null, error: new Error("Storage unavailable") }) }) },
  };
  try {
    const result = await sendEvolutionText("https://provider.test/message/sendText/Jhoy", "test-key", "5599999999999", "Mensagem preservada", { supabase, organizationId: "org" });
    assert(result.ok && result.messageId === "text-safe", "text still delivered");
    assert(urls.length === 1 && urls[0].includes("sendText"), "one send only, no duplicated media");
  } finally { globalThis.fetch = originalFetch; }
});
