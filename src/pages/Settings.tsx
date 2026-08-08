import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Building2, Upload, Palette, Tag, Save, X, Key, Copy, Check, ScanBarcode, RefreshCw, Download, Plug } from "lucide-react";
import JSZip from "jszip";

export default function Settings() {
  const { organization, organizationId, isLoading } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [niche, setNiche] = useState("funeraria");
  const [cnpj, setCnpj] = useState("");
  const [address, setAddress] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0ea5e9");
  const [secondaryColor, setSecondaryColor] = useState("#1e293b");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (organization) {
      const org = organization as any;
      setName(org.name || "");
      setNiche(org.niche || "funeraria");
      setCnpj(org.cnpj || "");
      setAddress(org.address || "");
      setSupportPhone(org.support_phone || "");
      setPrimaryColor(org.primary_color || "#0ea5e9");
      setSecondaryColor(org.secondary_color || "#1e293b");
      if (org.logo_url) setLogoPreview(org.logo_url);
    }
  }, [organization]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 2MB", variant: "destructive" });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organização não encontrada");

      let logoUrl = (organization as any)?.logo_url || null;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `${organizationId}/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("logos")
          .upload(path, logoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      } else if (!logoPreview) {
        logoUrl = null;
      }

      const { error } = await supabase
        .from("organizations")
        .update({
          name,
          niche,
          cnpj: cnpj || null,
          address: address || null,
          support_phone: supportPhone || null,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          logo_url: logoUrl,
        } as any)
        .eq("id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-membership"] });
      toast({ title: "Configurações salvas com sucesso!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">Personalize sua empresa</p>
        </div>

        {/* Nome da Empresa */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Dados da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Nome Fantasia</Label>
              <Input id="orgName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Funerária Paz Eterna" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supportPhone">Telefone de Suporte</Label>
                <Input id="supportPhone" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, Nº, Bairro, Cidade - UF" />
            </div>
          </CardContent>
        </Card>

        {/* Nicho */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" /> Nicho de Atuação
            </CardTitle>
            <CardDescription>Termos e campos serão ajustados conforme o nicho</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={niche} onValueChange={setNiche} className="grid grid-cols-2 gap-4">
              {[
                { value: "funeraria", label: "Funerária", desc: "Planos funerários, cobranças de mensalidades" },
                { value: "crediario", label: "Crediário", desc: "Carnês, parcelas e cobranças recorrentes" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                    niche === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <RadioGroupItem value={opt.value} className="mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Logo */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Logo da Empresa
            </CardTitle>
            <CardDescription>PNG ou JPG, máximo 2MB</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/50 shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="logoUpload"
                  className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-primary hover:underline"
                >
                  <Upload className="h-4 w-4" /> Enviar imagem
                </Label>
                <input
                  id="logoUpload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                {logoPreview && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <X className="h-3 w-3" /> Remover
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cores */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" /> Cores da Marca
            </CardTitle>
            <CardDescription>Personalize as cores do sistema da sua empresa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <ColorPickerField
                label="Cor Primária"
                value={primaryColor}
                onChange={setPrimaryColor}
                presets={PRIMARY_PRESETS}
              />
              <ColorPickerField
                label="Cor Secundária"
                value={secondaryColor}
                onChange={setSecondaryColor}
                presets={SECONDARY_PRESETS}
              />
            </div>

            {/* Combos rápidos */}
            <div className="mt-6">
              <p className="text-xs font-medium text-muted-foreground mb-2">Combinações prontas</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {COLOR_COMBOS.map((combo) => {
                  const active = primaryColor.toLowerCase() === combo.primary.toLowerCase() && secondaryColor.toLowerCase() === combo.secondary.toLowerCase();
                  return (
                    <button
                      key={combo.name}
                      type="button"
                      onClick={() => { setPrimaryColor(combo.primary); setSecondaryColor(combo.secondary); }}
                      className={`group flex flex-col items-stretch gap-1 p-2 rounded-lg border transition-all ${active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                    >
                      <div className="flex h-8 rounded-md overflow-hidden">
                        <div className="flex-1" style={{ background: combo.primary }} />
                        <div className="flex-1" style={{ background: combo.secondary }} />
                      </div>
                      <span className="text-[11px] text-foreground/80 truncate">{combo.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            <div className="mt-4 p-4 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">Pré-visualização</p>
              <div className="flex gap-3">
                <div className="h-10 flex-1 rounded-md flex items-center justify-center text-xs font-medium" style={{ background: primaryColor, color: "#fff" }}>
                  Primária
                </div>
                <div className="h-10 flex-1 rounded-md flex items-center justify-center text-xs font-medium" style={{ background: secondaryColor, color: "#fff" }}>
                  Secundária
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Key & Endpoint */}
        <ApiKeySection organizationId={organizationId} />

        {/* Barcode Config */}
        <BarcodeConfigSection organizationId={organizationId} />

        {/* Integration / Extension Download */}
        <ExtensionDownloadSection organizationId={organizationId} orgName={name} logoUrl={logoPreview} />

        {/* Salvar */}
        <div className="flex justify-end pb-6">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gradient-primary text-primary-foreground"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

function ApiKeySection({ organizationId }: { organizationId: string | null }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: apiKeyData, refetch } = useQuery({
    queryKey: ["org-api-key", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("org_api_keys")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!organizationId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Org not found");
      if (apiKeyData) {
        // Regenerate
        await supabase
          .from("org_api_keys")
          .delete()
          .eq("organization_id", organizationId);
      }
      const { error } = await supabase
        .from("org_api_keys")
        .insert({ organization_id: organizationId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
      toast({ title: "API Key gerada com sucesso!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast({ title: `${label} copiado!` });
    setTimeout(() => setCopied(null), 2000);
  };

  const apiBaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const endpointUrl = `${apiBaseUrl}/functions/v1/bip-receiver`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" /> API de Integração
        </CardTitle>
        <CardDescription>Use estes dados para conectar a Extensão do Chrome ou sistemas externos ao FuneCob</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Endpoint da API</Label>
          <div className="flex gap-2">
            <Input value={endpointUrl} readOnly className="font-mono text-xs bg-muted/50" />
            <Button variant="outline" size="icon" className="shrink-0" aria-label="Copiar endpoint da API" onClick={() => copyToClipboard(endpointUrl, "URL")}>
              {copied === "URL" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>API Key</Label>
          {apiKeyData ? (
            <div className="flex gap-2">
              <Input value={apiKeyData.api_key} readOnly className="font-mono text-xs bg-muted/50" />
              <Button variant="outline" size="icon" className="shrink-0" aria-label="Copiar API Key" onClick={() => copyToClipboard(apiKeyData.api_key, "API Key")}>
                {copied === "API Key" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" className="shrink-0" aria-label="Regenerar API Key" onClick={() => {
                if (window.confirm("Regenerar a API Key invalidará a chave anterior. Continuar?")) generateMutation.mutate();
              }}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} variant="outline">
              <Key className="h-4 w-4 mr-2" />
              {generateMutation.isPending ? "Gerando..." : "Gerar API Key"}
            </Button>
          )}
        </div>

        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">📡 Como usar na Extensão do Chrome:</p>
          <p>1. Configure a <strong>URL do Endpoint</strong> e a <strong>API Key</strong> na extensão.</p>
          <p>2. Ao bipar um código de barras, a extensão envia um POST com o campo <code className="bg-muted px-1 rounded">barcode</code>.</p>
          <p>3. O FuneCob identifica o cliente, processa a ação e dispara o WhatsApp automaticamente.</p>
          <pre className="bg-muted rounded p-2 text-xs overflow-x-auto mt-2">{`POST ${endpointUrl}
Headers: { "x-api-key": "SUA_API_KEY" }
Body: { "barcode": "0022008202602", "action": "baixa" }`}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

function BarcodeConfigSection({ organizationId }: { organizationId: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [clientIdLen, setClientIdLen] = useState("7");
  const [yearLen, setYearLen] = useState("4");
  const [monthLen, setMonthLen] = useState("2");

  const { data: config } = useQuery({
    queryKey: ["barcode-config-settings", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("barcode_configs")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!organizationId,
  });

  useEffect(() => {
    if (config) {
      setClientIdLen(String(config.client_id_length));
      setYearLen(String(config.year_length));
      setMonthLen(String(config.month_length));
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Org not found");
      const payload = {
        organization_id: organizationId,
        client_id_length: parseInt(clientIdLen) || 7,
        year_length: parseInt(yearLen) || 4,
        month_length: parseInt(monthLen) || 2,
      };
      if (config) {
        await supabase.from("barcode_configs").update(payload as any).eq("id", config.id);
      } else {
        await supabase.from("barcode_configs").insert(payload as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barcode-config-settings"] });
      toast({ title: "Configuração de código de barras salva!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const total = (parseInt(clientIdLen) || 0) + (parseInt(yearLen) || 0) + (parseInt(monthLen) || 0);
  const example = "0".repeat(parseInt(clientIdLen) || 7) + "2026" + "02";

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScanBarcode className="h-4 w-4 text-primary" /> Código de Barras (Fatiamento)
        </CardTitle>
        <CardDescription>Configure o formato do código de barras para identificação de clientes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>ID do Cliente (dígitos)</Label>
            <Input type="number" min="1" max="20" value={clientIdLen} onChange={(e) => setClientIdLen(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Ano (dígitos)</Label>
            <Input type="number" min="2" max="4" value={yearLen} onChange={(e) => setYearLen(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Mês (dígitos)</Label>
            <Input type="number" min="1" max="2" value={monthLen} onChange={(e) => setMonthLen(e.target.value)} />
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm">
          <p className="text-muted-foreground">Formato: <strong>{total} dígitos</strong> — [{clientIdLen} cliente][{yearLen} ano][{monthLen} mês]</p>
          <p className="text-muted-foreground">Exemplo: <code className="font-mono bg-muted px-1 rounded">{example.substring(0, total)}</code></p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} variant="outline" className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Salvando..." : "Salvar Configuração de Código de Barras"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ExtensionDownloadSection({ organizationId, orgName, logoUrl }: { organizationId: string | null; orgName: string; logoUrl?: string | null }) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  const { data: apiKeyData } = useQuery({
    queryKey: ["org-api-key-ext", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("org_api_keys")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!organizationId,
  });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const endpointUrl = `${supabaseUrl}/functions/v1/bip-receiver`;

  const downloadExtension = async () => {
    if (!apiKeyData?.api_key) {
      toast({ title: "Gere uma API Key primeiro", description: "Vá à seção 'API de Integração' acima.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const zip = new JSZip();

      // manifest.json
      zip.file("manifest.json", JSON.stringify({
        manifest_version: 3,
        name: `FuneCob - ${orgName || "Extensão"}`,
        version: "1.0.0",
        description: `Extensão de captura de bips para ${orgName || "sua empresa"}`,
        permissions: ["activeTab", "storage", "tabs"],
        action: { default_popup: "popup.html", default_icon: "icon.png" },
        background: { service_worker: "background.js" },
        content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"], run_at: "document_idle" }],
        icons: { "48": "icon.png", "128": "icon.png" },
      }, null, 2));

      // content.js — injected with API_KEY and ENDPOINT
      zip.file("content.js", `
// FuneCob Extension - Auto-configured
const FUNECOB_API_KEY = "${apiKeyData.api_key}";
const FUNECOB_ENDPOINT = "${endpointUrl}";
const FUNECOB_ORG_NAME = "${(orgName || "").replace(/"/g, '\\"')}";

let barcodeBuffer = "";
let barcodeTimeout = null;
let currentAction = "baixa";

// Listen for action changes from popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.bipAction) currentAction = changes.bipAction.newValue || "baixa";
});
chrome.storage.local.get("bipAction", (d) => { if (d.bipAction) currentAction = d.bipAction; });

document.addEventListener("keypress", (e) => {
  if (e.target.tagName === "TEXTAREA" || (e.target.tagName === "INPUT" && e.target.type !== "hidden")) return;
  if (e.key === "Enter" && barcodeBuffer.trim().length >= 8) {
    const barcode = barcodeBuffer.replace(/\\s+/g, "").trim();
    barcodeBuffer = "";
    clearTimeout(barcodeTimeout);
    sendBip(barcode);
    return;
  }
  barcodeBuffer += e.key;
  clearTimeout(barcodeTimeout);
  barcodeTimeout = setTimeout(() => { barcodeBuffer = ""; }, 300);
});

async function sendBip(barcode) {
  const body = { barcode, action: currentAction };
  if (currentAction === "remarcacao") {
    const newDate = prompt("Nova data de vencimento (AAAA-MM-DD):");
    if (!newDate) { showToast("⚠️ Remarcação cancelada — data não informada", true); return; }
    body.new_due_date = newDate;
  }
  try {
    const res = await fetch(FUNECOB_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": FUNECOB_API_KEY },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const actionLabels = { baixa: "Baixa", remarcacao: "Remarcação", retorno: "Retorno" };
    if (data.success) {
      if (data.duplicate) {
        showToast("⚠️ Bip duplicado: " + (data.client?.name || barcode), true);
      } else {
        showToast("✅ " + actionLabels[currentAction] + ": " + (data.client?.name || barcode));
      }
    } else {
      showToast("⚠️ " + (data.error || "Erro ao processar bip"), true);
    }
  } catch (err) {
    showToast("❌ Falha de conexão com FuneCob", true);
  }
}

function showToast(msg, isError) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = "position:fixed;top:16px;right:16px;z-index:999999;padding:12px 20px;border-radius:8px;font-family:sans-serif;font-size:14px;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;" +
    (isError ? "background:#ef4444;" : "background:#22c55e;");
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 4000);
}
`);

      // background.js
      zip.file("background.js", `
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});
`);

      // welcome.html
      zip.file("welcome.html", `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FuneCob Conectado!</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.08);padding:48px;text-align:center;max-width:480px;width:100%}.icon{font-size:64px;margin-bottom:16px}.title{font-size:24px;font-weight:700;color:#1e293b;margin-bottom:8px}.subtitle{color:#64748b;font-size:15px;line-height:1.6;margin-bottom:24px}.badge{display:inline-block;background:#22c55e;color:#fff;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600}</style>
</head>
<body>
<div class="card">
  ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:80px;max-width:200px;margin:0 auto 16px;display:block;border-radius:8px;">` : `<div class="icon">🎉</div>`}
  <h1 class="title">FuneCob Conectado com Sucesso!</h1>
  <p class="subtitle">A extensão foi configurada automaticamente para a empresa:<br><strong>${(orgName || "Sua Empresa").replace(/</g, "&lt;")}</strong></p>
  <p class="subtitle">Agora basta bipar os códigos de barras em qualquer aba do navegador. Os pagamentos serão processados automaticamente.</p>
  <span class="badge">✅ Pronto para uso</span>
</div>
</body>
</html>`);

      // popup.html
      zip.file("popup.html", `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:320px;font-family:system-ui,sans-serif;padding:16px;background:#fff}.header{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}.logo{font-size:24px}.title{font-weight:700;color:#1e293b;font-size:15px}.status{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:10px}.connected{background:#f0fdf4;color:#16a34a}.tabs{display:flex;gap:4px;margin-bottom:10px;background:#f1f5f9;padding:3px;border-radius:8px}.tab{flex:1;padding:8px 4px;text-align:center;font-size:12px;font-weight:600;border:none;border-radius:6px;cursor:pointer;background:transparent;color:#64748b}.tab.active{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.1)}.tab.active.baixa{color:#16a34a}.tab.active.remarcacao{color:#d97706}.tab.active.retorno{color:#dc2626}.info{background:#f1f5f9;color:#64748b;font-size:12px;padding:8px 12px;border-radius:8px;line-height:1.5;margin-top:8px}</style></head>
<body>
<div class="header"><span class="logo">📡</span><span class="title">FuneCob</span></div>
<div class="status connected">🟢 Conectado a: ${(orgName || "Empresa").replace(/</g, "&lt;")}</div>
<div class="tabs">
  <button class="tab baixa active" data-action="baixa">✅ Baixa</button>
  <button class="tab remarcacao" data-action="remarcacao">📅 Remarcar</button>
  <button class="tab retorno" data-action="retorno">🔙 Retorno</button>
</div>
<div class="info" id="actionInfo">Bipe códigos em qualquer aba. Ação atual: <strong>Baixa</strong></div>
<script>
const tabs = document.querySelectorAll(".tab");
const info = document.getElementById("actionInfo");
const labels = {baixa:"Baixa",remarcacao:"Remarcação",retorno:"Retorno"};
chrome.storage.local.get("bipAction", (d) => {
  const a = d.bipAction || "baixa";
  tabs.forEach(t => { t.classList.toggle("active", t.dataset.action === a); });
  info.innerHTML = "Bipe códigos em qualquer aba. Ação atual: <strong>" + labels[a] + "</strong>";
});
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const a = tab.dataset.action;
    chrome.storage.local.set({bipAction: a});
    info.innerHTML = "Bipe códigos em qualquer aba. Ação atual: <strong>" + labels[a] + "</strong>";
  });
});
</script>
</body>
</html>`);

      // Simple icon (SVG as PNG placeholder - 1x1 green square encoded)
      zip.file("icon.png", await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAEpJREFUWEft0EERAAAEBLDR/n8NJ4CABOfe2d0zu3tf54IAAgggEBCwgiGBSBUEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBD4IXABu5oBIBjh5HMAAAAASUVORK5CYII=").then(r => r.blob()), { binary: true });

      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `funecob-extension-${(orgName || "org").toLowerCase().replace(/\s+/g, "-")}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);

      toast({ title: "Extensão gerada!", description: "Descompacte e instale no Chrome via 'Carregar sem compactação'." });
    } catch (err) {
      toast({ title: "Erro ao gerar extensão", description: String(err), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" /> Integração — Extensão do Chrome
        </CardTitle>
        <CardDescription>Baixe a extensão pré-configurada com os dados da sua organização</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-4 space-y-3">
          <p className="text-sm text-foreground font-medium">📦 Extensão FuneCob para Chrome</p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>API Key e Endpoint já embutidos — sem configuração manual</li>
            <li>Captura códigos de barras em qualquer aba do navegador</li>
            <li>Notificações visuais de sucesso/erro em tempo real</li>
            <li>Página de boas-vindas automática na instalação</li>
          </ul>
        </div>

        <Button
          onClick={downloadExtension}
          disabled={generating || !apiKeyData?.api_key}
          className="w-full gradient-primary text-primary-foreground"
        >
          <Download className="h-4 w-4 mr-2" />
          {generating ? "Gerando extensão..." : "Baixar Extensão FuneCob (.zip)"}
        </Button>

        {!apiKeyData?.api_key && (
          <p className="text-xs text-destructive text-center">⚠️ Gere uma API Key na seção acima antes de baixar a extensão.</p>
        )}

        <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">Como instalar:</p>
          <p>1. Descompacte o arquivo .zip baixado</p>
          <p>2. Abra <code className="bg-muted px-1 rounded">chrome://extensions</code> no Chrome</p>
          <p>3. Ative o <strong>Modo do desenvolvedor</strong> (canto superior direito)</p>
          <p>4. Clique em <strong>Carregar sem compactação</strong> e selecione a pasta</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Color presets & combos =====
const PRIMARY_PRESETS = [
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#52a35f", "#0d9488", "#7c3aed",
];

const SECONDARY_PRESETS = [
  "#0f172a", "#1e293b", "#334155", "#475569", "#1f2937", "#111827",
  "#18181b", "#27272a", "#3f3f46", "#0c4a6e", "#1e3a8a", "#312e81",
  "#581c87", "#831843", "#7f1d1d", "#78350f", "#365314", "#064e3b",
];

const COLOR_COMBOS: { name: string; primary: string; secondary: string }[] = [
  { name: "Oceano", primary: "#0ea5e9", secondary: "#0f172a" },
  { name: "Esmeralda", primary: "#10b981", secondary: "#064e3b" },
  { name: "Sunset", primary: "#f97316", secondary: "#1f2937" },
  { name: "Royal", primary: "#6366f1", secondary: "#1e1b4b" },
  { name: "Rosé", primary: "#ec4899", secondary: "#831843" },
  { name: "Floresta", primary: "#52a35f", secondary: "#1e293b" },
  { name: "Rubi", primary: "#ef4444", secondary: "#111827" },
  { name: "Dourado", primary: "#f59e0b", secondary: "#27272a" },
];

function ColorPickerField({
  label,
  value,
  onChange,
  presets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets: string[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded-lg border border-border cursor-pointer flex-shrink-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm uppercase"
          maxLength={7}
        />
      </div>
      <div className="grid grid-cols-9 gap-1.5 pt-1">
        {presets.map((c) => {
          const active = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onChange(c)}
              className={`h-7 w-full rounded-md border-2 transition-transform hover:scale-110 ${active ? "border-foreground ring-2 ring-primary/40 scale-110" : "border-border/50"}`}
              style={{ background: c }}
            />
          );
        })}
      </div>
    </div>
  );
}
