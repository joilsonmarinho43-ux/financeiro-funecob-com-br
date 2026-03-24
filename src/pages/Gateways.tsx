import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Settings2, Key, Shield, Plus } from "lucide-react";

const GATEWAYS = [
  { id: "asaas", name: "Asaas", description: "Pagamentos via boleto, PIX e cartão" },
  { id: "mercadopago", name: "Mercado Pago", description: "Gateway completo de pagamentos" },
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

  const [selectedGw, setSelectedGw] = useState("");
  const [apiKey, setApiKey] = useState("");

  const handleSave = () => {
    if (!selectedGw || !apiKey) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ gateway_provider: selectedGw, gateway_api_key: apiKey });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gateways de Pagamento</h1>
          <p className="text-muted-foreground text-sm">Configure suas integrações de pagamento</p>
        </div>

        {settings?.gateway_provider && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Gateway ativo: <span className="text-primary">{settings.gateway_provider}</span></p>
                <p className="text-xs text-muted-foreground">Chave configurada: ••••{settings.gateway_api_key?.slice(-4)}</p>
              </div>
              <Badge className="ml-auto">Ativo</Badge>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {GATEWAYS.map((gw) => (
            <Card
              key={gw.id}
              className={`cursor-pointer transition-all hover:shadow-md ${selectedGw === gw.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedGw(gw.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Settings2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-foreground">{gw.name}</p>
                    <p className="text-xs text-muted-foreground">{gw.description}</p>
                  </div>
                  {settings?.gateway_provider === gw.id && <Badge variant="secondary" className="text-xs">Atual</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedGw && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4" /> Configurar {GATEWAYS.find(g => g.id === selectedGw)?.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Chave de API</Label>
                <Input type="password" placeholder="Cole sua chave de API aqui" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
              <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? "Salvando..." : "Salvar Gateway"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
