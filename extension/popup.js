// FuneCob Bip - Chrome Extension
(function () {
  let currentAction = "baixa";
  let config = { apiUrl: "", apiKey: "" };
  let history = [];

  const $ = (id) => document.getElementById(id);

  // Load config
  chrome.storage.local.get(["bipConfig", "bipHistory"], (data) => {
    if (data.bipConfig) {
      config = data.bipConfig;
      $("apiUrl").value = config.apiUrl || "";
      $("apiKey").value = config.apiKey || "";
      updateStatus();
    }
    if (data.bipHistory) {
      history = data.bipHistory;
      renderHistory();
    }
  });

  function updateStatus() {
    const bar = $("statusBar");
    const text = $("statusText");
    if (config.apiUrl && config.apiKey) {
      bar.className = "status-bar connected";
      text.textContent = "Conectado";
    } else {
      bar.className = "status-bar disconnected";
      text.textContent = "Não configurado";
    }
  }

  // Toggle config
  $("toggleConfig").addEventListener("click", () => {
    $("configSection").classList.toggle("hidden");
  });

  // Save config
  $("saveConfig").addEventListener("click", () => {
    config.apiUrl = $("apiUrl").value.trim();
    config.apiKey = $("apiKey").value.trim();
    chrome.storage.local.set({ bipConfig: config });
    updateStatus();
    $("configSection").classList.add("hidden");
  });

  // Action tabs
  document.querySelectorAll(".action-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".action-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentAction = tab.dataset.action;

      const btn = $("bipBtn");
      btn.className = "bip-btn " + currentAction;
      updateBtnText();

      // Show/hide due date field
      const df = $("dueDateField");
      if (currentAction === "remarcacao") {
        df.classList.add("visible");
      } else {
        df.classList.remove("visible");
      }
    });
  });

  // Barcode input
  const barcodeInput = $("barcodeInput");
  barcodeInput.addEventListener("input", () => {
    const val = barcodeInput.value.replace(/\D/g, "");
    barcodeInput.value = val;
    const btn = $("bipBtn");
    btn.disabled = val.length < 10;
    updateBtnText();
  });

  // Auto-submit on 13+ digits (barcode scanner usually types fast)
  let scanTimeout;
  barcodeInput.addEventListener("keydown", (e) => {
    clearTimeout(scanTimeout);
    if (e.key === "Enter") {
      e.preventDefault();
      sendBip();
      return;
    }
    scanTimeout = setTimeout(() => {
      if (barcodeInput.value.length >= 13) {
        sendBip();
      }
    }, 300);
  });

  function updateBtnText() {
    const val = barcodeInput.value;
    const icon = $("bipBtnIcon");
    const text = $("bipBtnText");
    if (val.length < 10) {
      icon.textContent = "📷";
      text.textContent = "Aguardando código...";
    } else {
      const labels = { baixa: "✅ Confirmar Baixa", remarcacao: "📅 Confirmar Remarcação", retorno: "🔙 Confirmar Retorno" };
      const icons = { baixa: "✅", remarcacao: "📅", retorno: "🔙" };
      icon.textContent = icons[currentAction];
      text.textContent = labels[currentAction];
    }
  }

  // Send bip
  $("bipBtn").addEventListener("click", sendBip);

  async function sendBip() {
    const barcode = barcodeInput.value.trim();
    if (barcode.length < 10) return;
    if (!config.apiUrl || !config.apiKey) {
      showResult("error", "Configuração necessária", "Clique na engrenagem ⚙️ para configurar a API.");
      return;
    }

    const btn = $("bipBtn");
    btn.disabled = true;
    $("bipBtnText").textContent = "Enviando...";
    $("bipBtnIcon").textContent = "⏳";
    barcodeInput.className = "";

    const body = { barcode, action: currentAction };
    if (currentAction === "remarcacao") {
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
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify(body),
      });

      const data = await resp.json();

      if (!resp.ok) {
        barcodeInput.className = "error";
        showResult("error", "Erro " + resp.status, data.error || "Falha no processamento.");
      } else if (data.duplicate) {
        barcodeInput.className = "success";
        showResult("duplicate", "Bip Duplicado", "Este código já foi processado anteriormente.");
      } else {
        barcodeInput.className = "success";
        const actionLabels = { baixa: "Baixa confirmada", remarcacao: "Remarcação confirmada", retorno: "Retorno registrado" };
        const detail = data.client ? `Cliente: ${data.client.name}` : "";
        showResult("success", actionLabels[currentAction] + " ✅", detail);

        // Add to history
        history.unshift({
          barcode,
          action: currentAction,
          client: data.client?.name || "—",
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        });
        if (history.length > 10) history = history.slice(0, 10);
        chrome.storage.local.set({ bipHistory: history });
        renderHistory();
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
        <span>${h.client}</span>
        <span class="badge ${h.action}">${h.action === "baixa" ? "✅ Baixa" : h.action === "remarcacao" ? "📅 Remarcar" : "🔙 Retorno"}</span>
        <span style="color:#94a3b8">${h.time}</span>
      </div>
    `).join("");
  }
})();
