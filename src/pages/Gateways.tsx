import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Settings2, Plus, CheckCircle2, Copy, Trash2, History, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const GATEWAYS = [
  { id: "asaas", name: "Asaas", description: "Pagamentos via boleto, PIX e cartão" },
  { id: "mercadopago", name: "Mercado Pago", description: "Gateway completo de pagamentos", default: true },
  { id: "v3pay", name: "V3Pay", description: "Solução de pagamentos integrada" },
  { id: "efi", name: "Efí (Gerencianet)", description: "PIX, boleto e carnê" },
  { id: "caixa", name: "Caixa Econômica", description: "Boleto e PIX via Caixa Federal" },
  { id: "bb", name: "Banco do Brasil", description: "Cobranças via API do BB" },
  { id: "itau", name: "Itaú", description: "Integração Itaú Shopline / API" },
  { id: "bradesco", name: "Bradesco", description: "Boleto e PIX via Bradesco" },
  { id: "santander", name: "Santander", description: "Cobranças e PIX Santander" },
  { id: "sicoob", name: "Sicoob", description: "Cooperativa de crédito — boleto e PIX" },
  { id: "sicredi", name: "Sicredi", description: "Cooperativa — boleto e PIX" },
  { id: "inter", name: "Banco Inter", description: "PIX e boleto via Inter" },
  { id: "pagseguro", name: "PagSeguro", description: "Gateway PagBank/PagSeguro" },
  { id: "cielo", name: "Cielo", description: "Adquirente — cartão e boleto" },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function Gateways() {
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["billing-settings-gw", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("billing_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const { data: webhookLogs } = useQuery({
    queryKey: ["webhook-logs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
    refetchInterval: 30000,
  });

  const [selectedGw, setSelectedGw] = useState("mercadopago");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (settings?.gateway_provider) {
      setSelectedGw(settings.gateway_provider);
    }
  }, [settings]);

  const webhookUrl = settings?.gateway_provider && organizationId
    ? `${SUPABASE_URL}/functions/v1/bip-receiver?org=${organizationId}&provider=${settings.gateway_provider}`
    : "";

  const updateMutation = useMutation({
    mutationFn: async (values: { gateway_provider: string; gateway_api_key: string; gateway_webhook_url?: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const payload = {
        ...values,
        billing_mode: "gateway",
        gateway_webhook_url: values.gateway_webhook_url || `${SUPABASE_URL}/functions/v1/bip-receiver?org=${organizationId}&provider=${values.gateway_provider}`,
      };
      if (settings) {
        const { error } = await supabase
          .from("billing_settings")
          .update(payload)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("billing_settings")
          .insert({ organization_id: organizationId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-settings-gw"] });
      toast({ title: "Gateway salvo com sucesso!" });
      setApiKey("");
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Sem organização");
      if (!window.confirm("Tem certeza que deseja desativar o gateway? O sistema voltará para o modo Pix Direto (manual).")) {
        throw new Error("cancelled");
      }
      const { error } = await supabase
        .from("billing_settings")
        .update({
          billing_mode: "pix_direto",
          gateway_provider: null,
          gateway_api_key: null,
          gateway_webhook_url: null,
        })
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-settings-gw"] });
      toast({ title: "Gateway desativado", description: "Voltou para o modo Pix Direto." });
    },
    onError: (e: Error) => {
      if (e.message !== "cancelled") {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      }
    },
  });

  const handleSave = () => {
    if (!selectedGw || !apiKey) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ gateway_provider: selectedGw, gateway_api_key: apiKey });
  };

  const copyWebhookUrl = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    toast({ title: "URL copiada!", description: "Cole no painel do seu provedor." });
  };

  const activeGw = GATEWAYS.find((g) => g.id === settings?.gateway_provider);
  const selectedGwInfo = GATEWAYS.find((g) => g.id === selectedGw);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gateways de Pagamento</h1>
          <p className="text-muted-foreground text-sm">Configure suas integrações de pagamento</p>
        </div>

        {activeGw && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3 flex-wrap">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Gateway ativo: <span className="text-primary">{activeGw.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Chave: ••••{settings?.gateway_api_key?.slice(-4)}
                </p>
              </div>
              <Badge>Ativo</Badge>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Desativar
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="config" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config">Configurar</TabsTrigger>
            <TabsTrigger value="webhook" disabled={!activeGw}>Webhook URL</TabsTrigger>
            <TabsTrigger value="logs">
              <History className="h-3.5 w-3.5 mr-1" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4" /> Selecionar Gateway
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Provedor</Label>
                  <Select value={selectedGw} onValueChange={setSelectedGw}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um gateway" />
                    </SelectTrigger>
                    <SelectContent>
                      {GATEWAYS.map((gw) => (
                        <SelectItem key={gw.id} value={gw.id}>
                          <span className="flex items-center gap-2">
                            {gw.name}
                            {settings?.gateway_provider === gw.id && (
                              <span className="text-xs text-primary font-medium">• Atual</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedGwInfo && (
                    <p className="text-xs text-muted-foreground">{selectedGwInfo.description}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Chave de API</Label>
                  <Input
                    type="password"
                    placeholder="Cole sua chave de API aqui"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>

                <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  {updateMutation.isPending ? "Salvando..." : "Salvar Gateway"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhook" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" /> URL do Webhook
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Cole esta URL no painel do seu provedor de pagamento</Label>
                  <div className="flex gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                    <Button onClick={copyWebhookUrl} variant="outline" size="icon" className="shrink-0" aria-label="Copiar URL do webhook">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Quando um pagamento for confirmado pelo provedor, a fatura correspondente será baixada automaticamente
                    e o cliente receberá uma confirmação por WhatsApp.
                  </p>
                </div>
                <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                  <p className="font-medium text-foreground">Como configurar:</p>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
                    <li>Acesse o painel do {activeGw?.name}</li>
                    <li>Vá em Webhooks / Notificações</li>
                    <li>Cole a URL acima</li>
                    <li>Selecione o evento de "Pagamento aprovado/recebido"</li>
                    <li>Salve</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" /> Webhooks Recebidos
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {webhookLogs?.length || 0} registros
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!webhookLogs || webhookLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum webhook recebido ainda. Configure o webhook URL no painel do seu provedor.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {webhookLogs.map((log) => {
                      const isSuccess = log.response_status === 200;
                      const isWarn = log.event?.includes("no_match") || log.event?.includes("ignored");
                      return (
                        <div
                          key={log.id}
                          className="border border-border rounded-md p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Badge
                              variant={isSuccess && !isWarn ? "default" : isWarn ? "secondary" : "destructive"}
                              className="text-[10px]"
                            >
                              {log.event}
                            </Badge>
                            <span className="text-muted-foreground">
                              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                            </span>
                          </div>
                          {log.response_body && (
                            <p className="text-muted-foreground font-mono break-all">
                              {log.response_body.length > 200
                                ? log.response_body.slice(0, 200) + "..."
                                : log.response_body}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
