// FuneCob Bip - Content Script
// Captures fast keyboard sequences (barcode scanners typing as keyboard) on any page.
// - Buffers digit keystrokes typed in rapid succession
// - On Enter or 300ms idle, if buffer has >= 8 digits, sends to background
// - Does NOT prevent default — the legacy system continues to receive the keystrokes normally
// - Operates silently: never shows alerts, never modifies the host page DOM

(function () {
  const MIN_LEN = 8;
  const IDLE_MS = 300;
  const FAST_KEY_MS = 50; // typical scanner inter-key delay is < 30ms; humans > 80ms

  let buffer = "";
  let lastKeyTime = 0;
  let idleTimer = null;
  let enabled = true;

  // Allow popup/background to disable globally
  try {
    chrome.storage.local.get(["bipConfig"], (data) => {
      if (data?.bipConfig?.globalCapture === false) enabled = false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.bipConfig) {
        enabled = changes.bipConfig.newValue?.globalCapture !== false;
      }
    });
  } catch {}

  function flush() {
    const candidate = buffer;
    buffer = "";
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (!enabled) return;
    if (candidate.length < MIN_LEN) return;
    try {
      chrome.runtime.sendMessage({ type: "BIP_CAPTURED", barcode: candidate });
    } catch {
      // Service worker may be asleep — silent
    }
  }

  function onKeyDown(e) {
    if (!enabled) return;
    const now = Date.now();
    const delta = now - lastKeyTime;
    lastKeyTime = now;

    // Enter ends the scan
    if (e.key === "Enter") {
      if (buffer.length >= MIN_LEN) flush();
      else buffer = "";
      return;
    }

    // Only digits are part of a barcode
    if (/^\d$/.test(e.key)) {
      // Reset buffer if previous key was too slow (likely human typing)
      if (delta > FAST_KEY_MS && buffer.length < 4) {
        buffer = "";
      }
      buffer += e.key;

      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(flush, IDLE_MS);
      return;
    }

    // Any other key: if buffer is small, drop it (human typing); if large, treat as boundary
    if (buffer.length >= MIN_LEN) {
      flush();
    } else {
      buffer = "";
    }
  }

  // Capture phase = true, so we observe but do not block the legacy app's listeners
  window.addEventListener("keydown", onKeyDown, true);
})();
