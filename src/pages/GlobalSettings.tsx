import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Globe, Key, Webhook, Loader2 } from "lucide-react";

const SETTINGS_KEYS = ["api_host", "global_api_key", "webhook_url"] as const;

export default function GlobalSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ api_host: "", global_api_key: "", webhook_url: "" });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("global_settings" as any)
        .select("key, value")
        .in("key", [...SETTINGS_KEYS]);
      if (error) throw error;
      return (data as unknown as { key: string; value: string }[]) || [];
    },
  });

  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      settings.forEach((s) => { map[s.key] = s.value; });
      setForm({
        api_host: map.api_host || "",
        global_api_key: map.global_api_key || "",
        webhook_url: map.webhook_url || "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const key of SETTINGS_KEYS) {
        const value = form[key];
        const { data: existing } = await supabase
          .from("global_settings" as any)
          .select("id")
          .eq("key", key)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("global_settings" as any)
            .update({ value, updated_at: new Date().toISOString() })
            .eq("key", key);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("global_settings" as any)
            .insert({ key, value });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-settings"] });
      toast({ title: "Configurações salvas com sucesso!" });
    },
    onError: (err: Error) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações Globais</h1>
          <p className="text-muted-foreground text-sm">Configurações da API de WhatsApp para todas as instâncias.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> API de WhatsApp — Funecob</CardTitle>
            <CardDescription>Esses dados serão usados automaticamente ao criar novas instâncias de WhatsApp para qualquer organização.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="api_host" className="flex items-center gap-2"><Globe className="h-4 w-4" /> API Host (URL)</Label>
                  <Input
                    id="api_host"
                    placeholder="http://161.97.181.130:8080"
                    value={form.api_host}
                    onChange={(e) => setForm({ ...form, api_host: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Endereço do servidor da API de WhatsApp.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="global_api_key" className="flex items-center gap-2"><Key className="h-4 w-4" /> Global API Key</Label>
                  <Input
                    id="global_api_key"
                    placeholder="Chave de segurança da Evolution"
                    value={form.global_api_key}
                    onChange={(e) => setForm({ ...form, global_api_key: e.target.value })}
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">Chave de autenticação da Evolution API.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhook_url" className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhook URL</Label>
                  <Input
                    id="webhook_url"
                    placeholder="https://meuservidor.com/webhook"
                    value={form.webhook_url}
                    onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">URL de retorno para receber eventos de mensagens.</p>
                </div>

                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full sm:w-auto">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Configurações
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
