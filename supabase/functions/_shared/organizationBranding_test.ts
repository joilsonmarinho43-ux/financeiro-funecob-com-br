import { isSolDaVida, organizationLogo, SOL_DA_VIDA_LOGO } from "./organizationBranding.ts";
import { sendEvolutionText } from "./evolutionSend.ts";

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
function database(name: string, logo_url: string | null = SOL_DA_VIDA_LOGO) {
  return { from: () => ({ select: () => ({ eq: (_: string, id: string) => {
    assert(id === "tenant-sol", "lookup must use caller's tenant ID");
    return { maybeSingle: async () => ({ data: { name, logo_url }, error: null }) };
  } }) }) };
}

Deno.test("brand isolation and configured logo precedence", () => {
  assert(isSolDaVida("  Funerária Sol da Vida  "), "normalize accents");
  assert(!isSolDaVida("Julia_Auditoria"), "test tenant must remain independent");
  assert(!isSolDaVida("Outra Sol da Vida"), "no substring matching");
  assert(organizationLogo({ name: "Sol da Vida" }) === null, "removed logo stays removed");
  assert(organizationLogo({ name: "Outra empresa" }) === null, "no tenant leakage");
  assert(organizationLogo({ name: "Sol da Vida", logo_url: "custom.png" }) === "custom.png", "custom precedence");
});

async function withProvider(name: string, responses: Array<{ status: number; body: unknown }>, verify: (calls: Array<{ url: string; body: any }>, result: any) => void) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: any }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    const response = responses.shift();
    assert(response, "unexpected extra send");
    return new Response(JSON.stringify(response!.body), { status: response!.status });
  };
  try {
    const result = await sendEvolutionText("https://provider.test/message/sendText/Jhoy", "test-key", "5599999999999", "Olá *Cliente *!", {
      supabase: database(name), organizationId: "tenant-sol",
    });
    verify(calls, result);
  } finally { globalThis.fetch = originalFetch; }
}

Deno.test("Sol da Vida sends one image with caption and retains provider ID", async () => {
  await withProvider("Sol da Vida", [{ status: 201, body: { key: { id: "image-1" } } }], (calls, result) => {
    assert(calls.length === 1, "one send only");
    assert(calls[0].url.endsWith("/sendMedia/Jhoy"), "image endpoint");
    assert(calls[0].body.mediaMessage.caption === "Olá *Cliente* !", "complete normalized caption");
    assert(calls[0].body.mediaMessage.media.startsWith("iVBOR"), "bundled PNG");
    assert(result.ok && result.messageId === "image-1", "delivery tracking");
  });
});

Deno.test("other tenants retain text transport", async () => {
  await withProvider("Julia_Auditoria", [{ status: 200, body: { key: { id: "text-1" } } }], (calls, result) => {
    assert(calls[0].url.endsWith("/sendText/Jhoy"), "text endpoint");
    assert(!calls[0].body.mediaMessage && result.ok, "no Sol da Vida image");
  });
});

Deno.test("ambiguous acceptance never triggers a second send", async () => {
  await withProvider("Sol da Vida", [{ status: 200, body: { status: "PENDING" } }], (calls, result) => {
    assert(calls.length === 1 && !result.ok, "missing ID is not proof of delivery");
  });
});

Deno.test("v2 media fallback only follows explicit schema rejection", async () => {
  await withProvider("Sol da Vida", [
    { status: 400, body: { message: "requires property mediatype" } },
    { status: 201, body: { key: { id: "v2-image" } } },
  ], (calls, result) => {
    assert(calls.length === 2 && result.ok, "compatible media fallback");
    assert(calls[1].body.mediatype === "image" && !calls[1].body.mediaMessage, "v2 envelope");
  });
});
