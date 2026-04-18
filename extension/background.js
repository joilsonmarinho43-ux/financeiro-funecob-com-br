// FuneCob Bip - Background Service Worker
// Receives barcodes captured globally by content scripts and forwards them to the API silently.

let config = { apiUrl: "", apiKey: "", globalCapture: true };
let currentAction = "baixa";

chrome.storage.local.get(["bipConfig", "bipCurrentAction"], (data) => {
  if (data.bipConfig) config = { globalCapture: true, ...data.bipConfig };
  if (data.bipCurrentAction) currentAction = data.bipCurrentAction;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.bipConfig) config = { globalCapture: true, ...changes.bipConfig.newValue };
  if (changes.bipCurrentAction) currentAction = changes.bipCurrentAction.newValue;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "BIP_CONFIG_UPDATED" && msg.config) {
    config = { globalCapture: true, ...msg.config };
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "BIP_CAPTURED" && msg.barcode) {
    handleCapturedBarcode(msg.barcode);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

// Background-level dedup cache (extra safety beyond content.js)
const recentCache = new Map(); // barcode -> timestamp
const BG_DEDUP_MS = 3000;

async function handleCapturedBarcode(barcode) {
  if (!config.apiUrl || !config.apiKey) return; // not configured — ignore silently
  if (config.globalCapture === false) return;
  const clean = String(barcode).replace(/\D/g, "");
  if (clean.length < 8) return;

  // Strict-length re-check at background layer
  const expected = Number(config.expectedLen) || 0;
  const strict = config.strictMode !== false;
  if (strict && expected > 0 && clean.length !== expected) {
    console.debug("[FuneCob Bip] bg ignore wrong length:", clean.length, "expected", expected);
    return;
  }

  // Background-level dedup
  const now = Date.now();
  const last = recentCache.get(clean);
  if (last && (now - last) < BG_DEDUP_MS) {
    console.debug("[FuneCob Bip] bg ignore duplicate within", BG_DEDUP_MS, "ms");
    return;
  }
  recentCache.set(clean, now);
  // Trim cache
  if (recentCache.size > 50) {
    const cutoff = now - BG_DEDUP_MS;
    for (const [k, t] of recentCache) if (t < cutoff) recentCache.delete(k);
  }

  const action = currentAction || "baixa";
  // Skip remarcacao for global capture (needs date selection in popup)
  if (action === "remarcacao") return;

  try {
    const resp = await fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey },
      body: JSON.stringify({ barcode: clean, action }),
    });
    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data.success && !data.ignored) {
      // Update history for popup
      chrome.storage.local.get(["bipHistory"], (d) => {
        const history = Array.isArray(d.bipHistory) ? d.bipHistory : [];
        history.unshift({
          barcode: clean,
          action,
          client: data.client?.name || "—",
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          status: data.duplicate ? "duplicate" : "success",
        });
        chrome.storage.local.set({ bipHistory: history.slice(0, 10) });
      });
      // Subtle badge feedback
      try {
        chrome.action.setBadgeBackgroundColor({ color: data.duplicate ? "#d97706" : "#16a34a" });
        chrome.action.setBadgeText({ text: data.duplicate ? "·" : "✓" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
      } catch {}
    } else {
      // Silent log only — no UI alarm for unknown codes
      console.log("[FuneCob Bip] silent ignore:", data?.reason || resp.status);
    }
  } catch (err) {
    console.log("[FuneCob Bip] capture error (silent):", err?.message);
  }
}
