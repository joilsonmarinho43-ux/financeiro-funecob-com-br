import { test, expect, chromium, type BrowserContext, type Page, type Route } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { AddressInfo } from "node:net";

// ─── Resolve extension path ───────────────────────────────────────────────
// We expect the extension folder at <repo-root>/extension (relative to this file: ../../extension)
const EXTENSION_PATH = path.resolve(__dirname, "../../extension");
const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/test-page.html");

if (!fs.existsSync(path.join(EXTENSION_PATH, "manifest.json"))) {
  throw new Error(`Extension manifest not found at ${EXTENSION_PATH}`);
}

// ─── Lightweight HTTP server to host the test page ────────────────────────
let server: http.Server;
let baseUrl: string;

function startServer(): Promise<string> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === "/" || req.url === "/test") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(FIXTURE_PATH, "utf-8"));
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

// ─── Shared state ─────────────────────────────────────────────────────────
let context: BrowserContext;
let page: Page;
const interceptedRequests: Array<{ url: string; body: any; ts: number }> = [];

// Configurable backend mock response
let mockMode: "success" | "ignored" | "duplicate" = "success";

test.beforeAll(async () => {
  baseUrl = await startServer();

  // Persistent context REQUIRED for Chrome extensions
  // Allow overriding the chromium binary via env (useful in sandboxed envs where Playwright's
  // bundled chromium is missing system libs like libglib).
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  context = await chromium.launchPersistentContext("", {
    headless: false,
    executablePath,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  // Wait for the MV3 service worker (background.js) to register
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }
  console.log("✓ Extension service worker loaded:", serviceWorker.url());

  // Pre-configure the extension storage with the EXACT shape expected by the extension:
  //   - bipConfig:        { apiUrl, apiKey, expectedLen, strictMode, globalCapture }
  //   - bipCurrentAction: "baixa" | "retorno" | "remarcacao"
  await serviceWorker.evaluate(async () => {
    await new Promise<void>((res) =>
      // @ts-ignore
      chrome.storage.local.set(
        {
          bipConfig: {
            apiUrl: "https://mock-funecob.test/functions/v1/bip-receiver",
            apiKey: "test-api-key",
            expectedLen: 13,
            strictMode: true,
            globalCapture: true,
          },
          bipCurrentAction: "baixa",
        },
        () => res()
      )
    );
  });

  page = await context.newPage();

  // Intercept ALL requests to the mock endpoint and respond based on mockMode
  await context.route("**/mock-funecob.test/**", async (route: Route) => {
    const req = route.request();
    let body: any = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch { /* ignore */ }
    interceptedRequests.push({ url: req.url(), body, ts: Date.now() });

    let responseBody: any = { success: true, action: "baixa_automatica" };
    if (mockMode === "ignored") responseBody = { success: true, ignored: true, reason: "client_not_found" };
    if (mockMode === "duplicate") responseBody = { success: true, duplicate: true };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    });
  });

  await page.goto(`${baseUrl}/test`);
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((res) => server?.close(() => res()));
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Simulate a barcode scanner: very fast keypresses (<50ms each) followed by Enter */
async function scanBarcode(p: Page, code: string, perKeyDelay = 10) {
  await p.locator("#legacy-input").click();
  await p.locator("#legacy-input").fill("");
  for (const ch of code) {
    await p.keyboard.press(ch, { delay: 0 });
    // Use a very small delay to stay under the 50ms anti-human-typing threshold
    await p.waitForTimeout(perKeyDelay);
  }
  await p.keyboard.press("Enter");
}

/** Simulate human typing: deliberately slow (>100ms per key) */
async function humanType(p: Page, code: string, perKeyDelay = 150) {
  await p.locator("#legacy-input").click();
  await p.locator("#legacy-input").fill("");
  for (const ch of code) {
    await p.keyboard.press(ch, { delay: 0 });
    await p.waitForTimeout(perKeyDelay);
  }
  await p.keyboard.press("Enter");
}

function clearRequests() {
  interceptedRequests.length = 0;
}

async function waitForRequest(timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (interceptedRequests.length > 0) return interceptedRequests[0];
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

// ─── Test scenarios ───────────────────────────────────────────────────────

test.describe("FuneCob Bip — Extension E2E", () => {
  test("✅ Cenário 1: código VÁLIDO (13 dígitos) — deve enviar e receber success", async () => {
    clearRequests();
    mockMode = "success";

    await scanBarcode(page, "1234567202604"); // 13 dígitos
    const req = await waitForRequest(2000);

    expect(req, "Request não foi enviada ao backend").not.toBeNull();
    expect(req!.body.barcode).toBe("1234567202604");
    expect(req!.body.action).toBe("baixa");
    console.log("PASSOU — código válido enviado:", req!.body);
  });

  test("✅ Cenário 2: código CURTO (8 dígitos) — deve ser IGNORADO silenciosamente", async () => {
    clearRequests();
    mockMode = "success";

    await scanBarcode(page, "12345678");
    const req = await waitForRequest(1000);

    expect(req, "Código curto NÃO deveria ter sido enviado").toBeNull();
    console.log("PASSOU — código curto ignorado pela extensão (não enviou request)");
  });

  test("✅ Cenário 3: código LONGO (15 dígitos) em modo estrito — IGNORADO", async () => {
    clearRequests();
    mockMode = "success";

    await scanBarcode(page, "123456720260499"); // 15 dígitos
    const req = await waitForRequest(1000);

    expect(req, "Código fora do tamanho esperado NÃO deveria ter sido enviado").toBeNull();
    console.log("PASSOU — código longo ignorado em strictMode");
  });

  test("✅ Cenário 4: código DUPLICADO em janela de dedupe — só envia uma vez", async () => {
    clearRequests();
    mockMode = "success";

    await scanBarcode(page, "9876543202604");
    await page.waitForTimeout(300);
    await scanBarcode(page, "9876543202604"); // dentro da janela de 2.5s
    await page.waitForTimeout(800);

    expect(interceptedRequests.length).toBe(1);
    console.log(`PASSOU — dedupe funcionou, apenas ${interceptedRequests.length} request enviada`);
  });

  test("✅ Cenário 5: digitação HUMANA lenta — deve ser DESCARTADA", async () => {
    clearRequests();
    mockMode = "success";

    await humanType(page, "1234567202604", 200); // 200ms entre teclas
    const req = await waitForRequest(1000);

    expect(req, "Digitação humana NÃO deveria disparar bip").toBeNull();
    console.log("PASSOU — digitação humana ignorada (anti-velocidade)");
  });

  test("✅ Cenário 6: sem ação configurada — extensão NÃO deve enviar", async () => {
    clearRequests();
    mockMode = "success";

    // Limpa a ação no storage (chave correta usada pelo background.js)
    const sw = context.serviceWorkers()[0];
    await sw.evaluate(async () => {
      await new Promise<void>((res) =>
        // @ts-ignore
        chrome.storage.local.set({ bipCurrentAction: null }, () => res())
      );
    });

    await scanBarcode(page, "5555555202604");
    const req = await waitForRequest(1000);

    expect(req, "Sem ação explícita NÃO deveria enviar request").toBeNull();
    console.log("PASSOU — sem ação configurada, request não foi enviada");

    // Restaura ação para os próximos testes
    await sw.evaluate(async () => {
      await new Promise<void>((res) =>
        // @ts-ignore
        chrome.storage.local.set({ bipCurrentAction: "baixa" }, () => res())
      );
    });
  });

  test("✅ Cenário 7: backend retorna IGNORED — extensão aceita silenciosamente", async () => {
    clearRequests();
    mockMode = "ignored";

    await scanBarcode(page, "7777777202604");
    const req = await waitForRequest(2000);

    expect(req).not.toBeNull();
    // O comportamento esperado: a extensão NÃO mostra alerta, apenas processa silenciosamente
    const alerts: string[] = [];
    page.on("dialog", (d) => { alerts.push(d.message()); d.dismiss(); });
    await page.waitForTimeout(500);

    expect(alerts.length, "Não deveria ter alert visível para o operador").toBe(0);
    console.log("PASSOU — backend retornou ignored, sem alerta visível");
  });

  test("✅ Cenário 8: payload tem estrutura correta { barcode, action }", async () => {
    clearRequests();
    mockMode = "success";

    await scanBarcode(page, "1111111202604");
    const req = await waitForRequest(2000);

    expect(req).not.toBeNull();
    expect(req!.body).toHaveProperty("barcode");
    expect(req!.body).toHaveProperty("action");
    expect(typeof req!.body.barcode).toBe("string");
    expect(["baixa", "remarcacao", "retorno"]).toContain(req!.body.action);
    console.log("PASSOU — estrutura do payload validada:", req!.body);
  });
});
