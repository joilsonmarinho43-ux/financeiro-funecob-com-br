// FuneCob Bip - Background Service Worker
// Receives barcodes captured globally by content scripts and forwards them to the API silently.
//
// RULES (must mirror content.js exactly):
// - Length validation uses ONLY expectedLen (no generic floors like "< 8")
// - Strict mode requires exact length match
// - Action MUST be explicit — no automatic "baixa" default
// - Backend is the single source of truth for whether a code belongs to Funecob

const DEFAULTS = {
  apiUrl: "",
  apiKey: "",
  expectedLen: 13,
  strictMode: true,
  globalCapture: true,
};

let config = { ...DEFAULTS };
let currentAction = null; // No default — must be set explicitly by the user

chrome.storage.local.get(["bipConfig", "bipCurrentAction"], (data) => {
  if (data.bipConfig) config = { ...DEFAULTS, ...data.bipConfig };
  if (data.bipCurrentAction) currentAction = data.bipCurrentAction;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.bipConfig) config = { ...DEFAULTS, ...(changes.bipConfig.newValue || {}) };
  if (changes.bipCurrentAction) currentAction = changes.bipCurrentAction.newValue || null;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "BIP_CONFIG_UPDATED" && msg.config) {
    config = { ...DEFAULTS, ...msg.config };
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

function silentLog(reason, extra) {
  try { console.debug("[FuneCob Bip bg]", reason, extra ?? ""); } catch {}
}

async function handleCapturedBarcode(barcode) {
  // Not configured — silent
  if (!config.apiUrl || !config.apiKey) {
    silentLog("not_configured");
    return;
  }
  if (config.globalCapture === false) {
    silentLog("global_capture_off");
    return;
  }

  const clean = String(barcode).replace(/\D/g, "");

  // ─── Length validation (mirrors content.js — uses ONLY expectedLen) ───
  const expected = Number(config.expectedLen) || 0;
  if (expected <= 0) {
    silentLog("no_expected_len");
    return;
  }
  const strict = config.strictMode !== false;
  if (strict && clean.length !== expected) {
    silentLog("ignored_wrong_length", `${clean.length} !== ${expected}`);
    return;
  }
  if (!strict && clean.length < expected) {
    silentLog("ignored_below_expected", `${clean.length} < ${expected}`);
    return;
  }

  // ─── Action validation: must be explicit ───
  // Global capture only supports baixa/retorno (remarcacao requires a date from the popup)
  const action = currentAction;
  if (!action || !["baixa", "retorno"].includes(action)) {
    silentLog("ignored_no_explicit_action", action);
    return;
  }

  // ─── Background-level dedup ───
  const now = Date.now();
  const last = recentCache.get(clean);
  if (last && (now - last) < BG_DEDUP_MS) {
    silentLog("ignored_duplicate_bg");
    return;
  }
  recentCache.set(clean, now);
  if (recentCache.size > 50) {
    const cutoff = now - BG_DEDUP_MS;
    for (const [k, t] of recentCache) if (t < cutoff) recentCache.delete(k);
  }

  // ─── Send to backend (single source of truth) ───
  try {
    const resp = await fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey },
      body: JSON.stringify({ barcode: clean, action }),
    });
    const data = await resp.json().catch(() => ({}));

    // Only treat as success if backend explicitly says so AND did not ignore
    if (resp.ok && data.success && !data.ignored) {
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
      try {
        chrome.action.setBadgeBackgroundColor({ color: data.duplicate ? "#d97706" : "#16a34a" });
        chrome.action.setBadgeText({ text: data.duplicate ? "·" : "✓" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
      } catch {}
    } else {
      // ignored=true OR error — silent, no UI alarm.
      silentLog("backend_ignored_or_error", data?.reason || resp.status);
    }
  } catch (err) {
    silentLog("network_error", err?.message);
  }
}
