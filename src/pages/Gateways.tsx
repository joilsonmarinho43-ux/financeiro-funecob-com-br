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
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Settings2, Key, Shield, Plus, CheckCircle2 } from "lucide-react";

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

  const [selectedGw, setSelectedGw] = useState("mercadopago");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (settings?.gateway_provider) {
      setSelectedGw(settings.gateway_provider);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (values: { gateway_provider: string; gateway_api_key: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      if (settings) {
        const { error } = await supabase
          .from("billing_settings")
          .update({ ...values })
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("billing_settings")
          .insert({ organization_id: organizationId, ...values });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-settings-gw"] });
      toast({ title: "Gateway salvo com sucesso!" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!selectedGw || !apiKey) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ gateway_provider: selectedGw, gateway_api_key: apiKey });
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
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Gateway ativo: <span className="text-primary">{activeGw.name}</span></p>
                <p className="text-xs text-muted-foreground">Chave configurada: ••••{settings?.gateway_api_key?.slice(-4)}</p>
              </div>
              <Badge className="ml-auto">Ativo</Badge>
            </CardContent>
          </Card>
        )}

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
      </div>
    </AppLayout>
  );
}
