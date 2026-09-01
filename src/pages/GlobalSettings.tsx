import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Globe, Key, Webhook, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const SETTINGS_KEYS = ["api_host", "global_api_key", "webhook_url", "default_instance_name"] as const;

type SettingsKey = typeof SETTINGS_KEYS[number];
type SettingsForm = Record<SettingsKey, string>;

const EMPTY_FORM: SettingsForm = {
  api_host: "",
  global_api_key: "",
  webhook_url: "",
  default_instance_name: "",
};

export default function GlobalSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM);

  const { data: isAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin-global-settings", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
  });

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("global_settings" as any)
        .select("key, value")
        .in("key", [...SETTINGS_KEYS]);
      if (error) throw error;
      return (data as unknown as { key: SettingsKey; value: string }[]) || [];
    },
    enabled: !!isAdmin,
  });

  useEffect(() => {
    if (!settings) return;
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value || ""])) as Partial<SettingsForm>;
    setForm({
      api_host: map.api_host || "",
      global_api_key: map.global_api_key || "",
      webhook_url: map.webhook_url || "",
      default_instance_name: map.default_instance_name || "",
    });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const key of SETTINGS_KEYS) {
        const value = form[key];
        const { data: existing, error: findError } = await supabase
          .from("global_settings" as any)
          .select("id")
          .eq("key", key)
          .maybeSingle();

        if (findError) throw findError;

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
    onError: (err: Error) => {
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (checkingAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Super Admin</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Configurações Globais</h1>
            <p className="text-muted-foreground text-sm">Configurações da API de WhatsApp para todas as organizações.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Super Admin
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" /> API de WhatsApp — Funecob
            </CardTitle>
            <CardDescription>
              Esses dados são globais e serão usados automaticamente quando uma organização não tiver uma configuração própria.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingSettings ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="api_host" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" /> API Host (URL)
                  </Label>
                  <Input
                    id="api_host"
                    placeholder="https://api.funecob.com.br"
                    value={form.api_host}
                    onChange={(e) => setForm({ ...form, api_host: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Endereço público do servidor da API de WhatsApp.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="global_api_key" className="flex items-center gap-2">
                    <Key className="h-4 w-4" /> Global API Key
                  </Label>
                  <Input
                    id="global_api_key"
                    placeholder="Chave de segurança da API"
                    value={form.global_api_key}
                    onChange={(e) => setForm({ ...form, global_api_key: e.target.value })}
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">Chave usada para autenticar as chamadas à API de WhatsApp.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhook_url" className="flex items-center gap-2">
                    <Webhook className="h-4 w-4" /> Webhook URL
                  </Label>
                  <Input
                    id="webhook_url"
                    placeholder="https://financeiro.funecob.com.br/functions/v1/whatsapp-webhook"
                    value={form.webhook_url}
                    onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">URL para receber eventos e mensagens da API.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default_instance_name" className="flex items-center gap-2">
                    <Webhook className="h-4 w-4" /> Nome da Instância Padrão
                  </Label>
                  <Input
                    id="default_instance_name"
                    placeholder="Jeova"
                    value={form.default_instance_name}
                    onChange={(e) => setForm({ ...form, default_instance_name: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Instância usada como padrão quando a organização não possui uma própria.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Configurações Globais
                  </Button>
                  <Button asChild variant="ghost" className="w-full sm:w-auto">
                    <Link to="/admin">Cancelar / Voltar</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
