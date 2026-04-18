// FuneCob Bip - Chrome Extension (Popup UI)
(function () {
  let currentAction = "baixa";
  let config = {
    apiUrl: "",
    apiKey: "",
    globalCapture: true,
    strictMode: true,
    expectedLen: 13,
  };
  let history = [];

  const $ = (id) => document.getElementById(id);

  // Load config + history
  chrome.storage.local.get(["bipConfig", "bipHistory"], (data) => {
    if (data.bipConfig) {
      config = { globalCapture: true, strictMode: true, expectedLen: 13, ...data.bipConfig };
      $("apiUrl").value = config.apiUrl || "";
      $("apiKey").value = config.apiKey || "";
      const gc = $("globalCapture");
      if (gc) gc.checked = config.globalCapture !== false;
      const sm = $("strictMode");
      if (sm) sm.checked = config.strictMode !== false;
      const el = $("expectedLen");
      if (el) el.value = String(config.expectedLen ?? 13);
      updateStatus();
    }
    if (data.bipHistory) {
      history = data.bipHistory;
      renderHistory();
    }
    chrome.runtime.sendMessage({ type: "BIP_CONFIG_UPDATED", config }).catch(() => {});
  });

  function updateStatus() {
    const bar = $("statusBar");
    const text = $("statusText");
    if (config.apiUrl && config.apiKey) {
      bar.className = "status-bar connected";
      const parts = [];
      if (config.globalCapture !== false) parts.push("captura global");
      if (config.strictMode !== false) parts.push(`estrito ${config.expectedLen || 13}d`);
      text.textContent = "Conectado" + (parts.length ? " · " + parts.join(" · ") : "");
    } else {
      bar.className = "status-bar disconnected";
      text.textContent = "Não configurado";
    }
  }

  $("toggleConfig").addEventListener("click", () => {
    $("configSection").classList.toggle("hidden");
  });

  $("saveConfig").addEventListener("click", () => {
    config.apiUrl = $("apiUrl").value.trim();
    config.apiKey = $("apiKey").value.trim();
    const gc = $("globalCapture");
    config.globalCapture = gc ? gc.checked : true;
    const sm = $("strictMode");
    config.strictMode = sm ? sm.checked : true;
    const el = $("expectedLen");
    const n = el ? parseInt(el.value, 10) : 13;
    config.expectedLen = isNaN(n) || n < 0 ? 13 : n;
    chrome.storage.local.set({ bipConfig: config });
    chrome.runtime.sendMessage({ type: "BIP_CONFIG_UPDATED", config }).catch(() => {});
    updateStatus();
    $("configSection").classList.add("hidden");
  });

  // Action tabs
  document.querySelectorAll(".action-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".action-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentAction = tab.dataset.action;
      chrome.storage.local.set({ bipCurrentAction: currentAction });

      const btn = $("bipBtn");
      btn.className = "bip-btn " + currentAction;
      updateBtnText();

      const df = $("dueDateField");
      if (currentAction === "remarcacao") {
        df.classList.add("visible");
      } else {
        df.classList.remove("visible");
      }
    });
  });

  // Restore last action
  chrome.storage.local.get(["bipCurrentAction"], (d) => {
    if (d.bipCurrentAction) {
      const tab = document.querySelector(`.action-tab[data-action="${d.bipCurrentAction}"]`);
      if (tab) tab.click();
    }
  });

  const barcodeInput = $("barcodeInput");
  barcodeInput.addEventListener("input", () => {
    const val = barcodeInput.value.replace(/\D/g, "");
    barcodeInput.value = val;
    const btn = $("bipBtn");
    btn.disabled = val.length < 8;
    updateBtnText();
  });

  let scanTimeout;
  barcodeInput.addEventListener("keydown", (e) => {
    clearTimeout(scanTimeout);
    if (e.key === "Enter") {
      e.preventDefault();
      sendBip(barcodeInput.value.trim(), currentAction);
      return;
    }
    scanTimeout = setTimeout(() => {
      if (barcodeInput.value.length >= 8) {
        sendBip(barcodeInput.value.trim(), currentAction);
      }
    }, 300);
  });

  function updateBtnText() {
    const val = barcodeInput.value;
    const icon = $("bipBtnIcon");
    const text = $("bipBtnText");
    if (val.length < 8) {
      icon.textContent = "📷";
      text.textContent = "Aguardando código...";
    } else {
      const labels = { baixa: "✅ Confirmar Baixa", remarcacao: "📅 Confirmar Remarcação", retorno: "🔙 Confirmar Retorno" };
      const icons = { baixa: "✅", remarcacao: "📅", retorno: "🔙" };
      icon.textContent = icons[currentAction];
      text.textContent = labels[currentAction];
    }
  }

  $("bipBtn").addEventListener("click", () => sendBip(barcodeInput.value.trim(), currentAction));

  async function sendBip(barcode, action) {
    if (!barcode || barcode.length < 8) return;
    if (!config.apiUrl || !config.apiKey) {
      showResult("error", "Configuração necessária", "Clique na engrenagem ⚙️ para configurar a API.");
      return;
    }

    const btn = $("bipBtn");
    btn.disabled = true;
    $("bipBtnText").textContent = "Enviando...";
    $("bipBtnIcon").textContent = "⏳";
    barcodeInput.className = "";

    const body = { barcode, action };
    if (action === "remarcacao") {
      const newDate = $("newDueDate").value;
      if (!newDate) {
        showResult("error", "Data obrigatória", "Selecione a nova data de vencimento para remarcação.");
        btn.disabled = false;
        updateBtnText();
        return;
      }
      body.new_due_date = newDate;
    }

    try {
      const resp = await fetch(config.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": config.apiKey },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        barcodeInput.className = "error";
        showResult("error", "Erro " + resp.status, data.error || "Falha no processamento.");
      } else if (data.ignored) {
        // Silent: barcode not recognized — show subtle hint, no alarming UI
        barcodeInput.className = "";
        showResult("duplicate", "Código ignorado", "Não pertence a nenhum cliente cadastrado.");
      } else if (data.duplicate) {
        barcodeInput.className = "success";
        showResult("duplicate", "Bip Duplicado", "Este código já foi processado anteriormente.");
        addToHistory({ barcode, action, client: "—", time: timeNow(), status: "duplicate" });
      } else {
        barcodeInput.className = "success";
        const actionLabels = { baixa: "Baixa confirmada", remarcacao: "Remarcação confirmada", retorno: "Retorno registrado" };
        const detail = data.client?.name ? `Cliente: ${data.client.name}` : "";
        showResult("success", actionLabels[action] + " ✅", detail);
        addToHistory({ barcode, action, client: data.client?.name || "—", time: timeNow(), status: "success" });
      }
    } catch (err) {
      barcodeInput.className = "error";
      showResult("error", "Erro de Conexão", err.message || "Verifique sua internet e configurações.");
    }

    btn.disabled = false;
    barcodeInput.value = "";
    updateBtnText();
    setTimeout(() => barcodeInput.focus(), 100);
  }

  function timeNow() {
    return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function addToHistory(entry) {
    history.unshift(entry);
    if (history.length > 10) history = history.slice(0, 10);
    chrome.storage.local.set({ bipHistory: history });
    renderHistory();
  }

  function showResult(type, title, detail) {
    const box = $("resultBox");
    box.className = "result show " + type;
    $("resultTitle").textContent = title;
    $("resultDetail").textContent = detail;
    setTimeout(() => { box.className = "result"; }, 5000);
  }

  function renderHistory() {
    const list = $("historyList");
    if (history.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:11px;padding:8px;">Nenhum bip registrado</div>';
      return;
    }
    list.innerHTML = history.map((h) => `
      <div class="history-item">
        <span>${h.client || "—"}</span>
        <span class="badge ${h.action}">${h.action === "baixa" ? "✅ Baixa" : h.action === "remarcacao" ? "📅 Remarcar" : "🔙 Retorno"}</span>
        <span style="color:#94a3b8">${h.time}</span>
      </div>
    `).join("");
  }

  // Listen for background-captured bips and refresh history
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.bipHistory) {
      history = changes.bipHistory.newValue || [];
      renderHistory();
    }
  });
})();
