// FuneCob Bip - Content Script (HARDENED)
// Captures fast keyboard sequences (barcode scanner emulating keyboard input).
// Validates length, speed, pattern, and dedupes — silent on every failure.
//
// RULES:
// - Inter-key delay must be < FAST_KEY_MS (50ms) — anything slower is treated as human typing
// - Buffer must reach exactly EXPECTED_LEN digits (configurable, default 13)
// - Optional pattern check (client_code + year + month) before sending
// - Recent-cache (DEDUP_MS) drops duplicates
// - Strict mode rejects any deviation
// - Never blocks legacy app keystrokes (capture phase, no preventDefault)
// - Never shows UI errors

(function () {
  // ===== Defaults (overridable via bipConfig in chrome.storage.local) =====
  // Single source of truth = expectedLen configured in the SaaS.
  // No generic length floors — backend is the only authority on what's a Funecob code.
  const DEFAULTS = {
    expectedLen: 13,        // exact length required (must be > 0)
    fastKeyMs: 50,          // max ms between keys to count as scanner
    idleMs: 300,            // ms of silence to flush
    dedupMs: 2500,          // ignore same barcode within this window
    strictMode: true,       // reject anything that doesn't match expectedLen exactly
    patternEnabled: false,  // if true, validate clientLen+yearLen+monthLen
    clientIdLength: 7,
    yearLength: 4,
    monthLength: 2,
    globalCapture: true,
  };

  let cfg = { ...DEFAULTS };
  let buffer = "";
  let lastKeyTime = 0;
  let idleTimer = null;
  let lastSent = { barcode: "", time: 0 };

  // ===== Load + watch config =====
  try {
    chrome.storage.local.get(["bipConfig"], (data) => {
      if (data?.bipConfig) cfg = { ...DEFAULTS, ...data.bipConfig };
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.bipConfig) {
        cfg = { ...DEFAULTS, ...(changes.bipConfig.newValue || {}) };
      }
    });
  } catch {}

  function silentLog(reason, code) {
    // Internal-only — never surfaces to the user
    try { console.debug("[FuneCob Bip]", reason, code?.slice(0, 4) + "***"); } catch {}
  }

  function resetBuffer() {
    buffer = "";
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function validatePattern(code) {
    if (!cfg.patternEnabled) return true;
    const required = (cfg.clientIdLength || 0) + (cfg.yearLength || 0) + (cfg.monthLength || 0);
    if (code.length < required) return false;
    // Sanity: year must be 4 digits starting with 19/20, month 01-12
    if (cfg.yearLength === 4 && cfg.monthLength === 2) {
      const year = code.substring(cfg.clientIdLength, cfg.clientIdLength + 4);
      const month = code.substring(cfg.clientIdLength + 4, cfg.clientIdLength + 6);
      if (!/^(19|20)\d{2}$/.test(year)) return false;
      const m = parseInt(month, 10);
      if (isNaN(m) || m < 1 || m > 12) return false;
    }
    return true;
  }

  function flush() {
    const candidate = buffer;
    resetBuffer();
    if (cfg.globalCapture === false) return;

    // ─── Length validation (uses ONLY expectedLen — no generic floors) ───
    const expected = Number(cfg.expectedLen) || 0;
    if (expected <= 0) {
      silentLog("ignored_no_expected_len", candidate);
      return;
    }
    if (cfg.strictMode && candidate.length !== expected) {
      silentLog("ignored_wrong_length", candidate);
      return;
    }
    if (!cfg.strictMode && candidate.length < expected) {
      silentLog("ignored_below_expected", candidate);
      return;
    }

    // ─── Pattern validation ───
    if (!validatePattern(candidate)) {
      silentLog("ignored_pattern_mismatch", candidate);
      return;
    }

    // ─── Dedup window ───
    const now = Date.now();
    if (lastSent.barcode === candidate && (now - lastSent.time) < cfg.dedupMs) {
      silentLog("ignored_duplicate_recent", candidate);
      return;
    }
    lastSent = { barcode: candidate, time: now };

    // ─── Forward to background ───
    try {
      chrome.runtime.sendMessage({ type: "BIP_CAPTURED", barcode: candidate });
    } catch (e) {
      // Service worker asleep or other error — silent
    }
  }

  function onKeyDown(e) {
    if (cfg.globalCapture === false) return;

    const now = Date.now();
    const delta = now - lastKeyTime;
    lastKeyTime = now;

    const expected = Number(cfg.expectedLen) || 0;

    // Enter ends the scan — only flush if buffer reached expected length
    if (e.key === "Enter") {
      if (expected > 0 && buffer.length >= expected) flush();
      else resetBuffer();
      return;
    }

    // Only digits are part of a barcode
    if (/^\d$/.test(e.key)) {
      // Anti-human-typing: if previous key was too slow, drop the buffer.
      if (buffer.length >= 1 && delta > cfg.fastKeyMs) {
        silentLog("buffer_reset_slow_key", buffer);
        buffer = "";
      }
      buffer += e.key;

      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(flush, cfg.idleMs);
      return;
    }

    // Any other key: if buffer reached expected length, flush; else drop silently
    if (expected > 0 && buffer.length >= expected) {
      flush();
    } else if (buffer.length > 0) {
      silentLog("buffer_reset_non_digit", buffer);
      resetBuffer();
    }
  }

  // Capture phase = true so we observe but never block legacy app listeners.
  // No preventDefault anywhere — operator's normal flow continues untouched.
  window.addEventListener("keydown", onKeyDown, true);
})();