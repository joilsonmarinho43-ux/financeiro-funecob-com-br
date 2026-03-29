import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { format, parseISO } from "date-fns";
import {
  Save, Zap, Key, MessageSquare, Clock, Bell, BellRing,
  AlertTriangle, CheckCircle2, XCircle, Loader2, CreditCard,
  QrCode, Settings2, FileText, Activity, TrendingUp, RefreshCw,
  Send, BarChart3,
} from "lucide-react";

const TEMPLATE_VARS = [
  { var: "{nome}", desc: "Nome do cliente" },
  { var: "{valor}", desc: "Valor da fatura (R$)" },
  { var: "{vencimento}", desc: "Data de vencimento" },
  { var: "{link_ou_chave_pix}", desc: "Link de pagamento ou chave Pix" },
  { var: "{link_portal}", desc: "Link do portal do cliente" },
];

export default function BillingSettings() {
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [billingMode, setBillingMode] = useState<"pix_direto" | "gateway">("pix_direto");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("aleatoria");
  const [gatewayProvider, setGatewayProvider] = useState("");
  const [gatewayApiKey, setGatewayApiKey] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(2);
  const [templateReminder, setTemplateReminder] = useState(
    "Olá {nome}! Sua fatura no valor de {valor} vence em {vencimento}. Fique atento para evitar atrasos."
  );
  const [templateDueDate, setTemplateDueDate] = useState(
    "Olá {nome}! Sua fatura no valor de {valor} vence HOJE ({vencimento}). {link_ou_chave_pix}"
  );
  const [templateOverdue, setTemplateOverdue] = useState(
    "Olá {nome}! Sua fatura no valor de {valor} com vencimento em {vencimento} está em atraso. Por favor, regularize o pagamento. {link_ou_chave_pix}"
  );

  const { data: settings, isLoading } = useQuery({
    queryKey: ["billing-settings", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_settings")
        .select("*")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const { data: reminders = [], isLoading: remindersLoading } = useQuery({
    queryKey: ["billing-reminders", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("billing_reminders")
        .select("*, invoices(*, clients(name))")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Monitor queries
  const { data: queueStats } = useQuery({
    queryKey: ["robot-queue-stats", organizationId],
    queryFn: async () => {
      if (!organizationId) return { queued: 0, sending: 0, sent: 0, failed: 0, total: 0 };
      const { data, error } = await supabase
        .from("whatsapp_queue")
        .select("status")
        .eq("organization_id", organizationId);
      if (error) throw error;
      const stats = { queued: 0, sending: 0, sent: 0, failed: 0, total: data?.length || 0 };
      data?.forEach((q: any) => {
        if (q.status in stats) (stats as any)[q.status]++;
      });
      return stats;
    },
    enabled: !!organizationId,
    refetchInterval: 30000,
  });

  const { data: reminderStats } = useQuery({
    queryKey: ["robot-reminder-stats", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("billing_reminders")
        .select("status, reminder_type, created_at")
        .eq("organization_id", organizationId);
      if (error) throw error;
      const today = new Date().toISOString().split("T")[0];
      const stats = {
        totalSent: 0, totalPending: 0, totalFailed: 0,
        todaySent: 0, todayPending: 0, todayFailed: 0,
        byType: { reminder: 0, due_date: 0, overdue: 0 } as Record<string, number>,
      };
      data?.forEach((r: any) => {
        if (r.status === "sent") stats.totalSent++;
        else if (r.status === "pending") stats.totalPending++;
        else if (r.status === "failed") stats.totalFailed++;
        if (r.created_at?.startsWith(today)) {
          if (r.status === "sent") stats.todaySent++;
          else if (r.status === "pending") stats.todayPending++;
          else if (r.status === "failed") stats.todayFailed++;
        }
        if (r.reminder_type in stats.byType) stats.byType[r.reminder_type]++;
      });
      return stats;
    },
    enabled: !!organizationId,
    refetchInterval: 30000,
  });

  const { data: whatsappInstance } = useQuery({
    queryKey: ["robot-whatsapp-instance", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("name, status, api_url, api_key")
        .eq("organization_id", organizationId)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  useEffect(() => {
    if (settings) {
      setBillingMode(settings.billing_mode as "pix_direto" | "gateway");
      setPixKey(settings.pix_key || "");
      setPixKeyType(settings.pix_key_type || "aleatoria");
      setGatewayProvider(settings.gateway_provider || "");
      setGatewayApiKey(settings.gateway_api_key || "");
      setReminderEnabled(settings.reminder_enabled);
      setReminderDaysBefore(settings.reminder_days_before);
      setTemplateReminder(settings.template_reminder);
      setTemplateDueDate(settings.template_due_date);
      setTemplateOverdue(settings.template_overdue);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organização não encontrada");

      const payload = {
        organization_id: organizationId,
        billing_mode: billingMode,
        pix_key: pixKey || null,
        pix_key_type: pixKeyType,
        gateway_provider: gatewayProvider || null,
        gateway_api_key: gatewayApiKey || null,
        reminder_enabled: reminderEnabled,
        reminder_days_before: reminderDaysBefore,
        template_reminder: templateReminder,
        template_due_date: templateDueDate,
        template_overdue: templateOverdue,
      };

      if (settings?.id) {
        const { error } = await supabase
          .from("billing_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("billing_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-settings"] });
      toast({ title: "Configurações de cobrança salvas!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const reminderTypeBadge = (type: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      reminder: { cls: "bg-primary/10 text-primary border-0", label: "Lembrete" },
      due_date: { cls: "bg-warning/10 text-warning border-0", label: "Vencimento" },
      overdue: { cls: "bg-destructive/10 text-destructive border-0", label: "Atraso" },
    };
    const s = map[type] || { cls: "bg-muted text-muted-foreground border-0", label: type };
    return <Badge className={s.cls}>{s.label}</Badge>;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      pending: { cls: "bg-warning/10 text-warning border-0", label: "Pendente" },
      sent: { cls: "bg-success/10 text-success border-0", label: "Enviado" },
      failed: { cls: "bg-destructive/10 text-destructive border-0", label: "Falhou" },
    };
    const s = map[status] || { cls: "bg-muted text-muted-foreground border-0", label: status };
    return <Badge className={s.cls}>{s.label}</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cobrança Automatizada</h1>
          <p className="text-sm text-muted-foreground">
            Configure o modo de cobrança, templates e régua de notificações via WhatsApp
          </p>
        </div>

        <Tabs defaultValue="monitor" className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="monitor" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Monitor</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Config</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Templates</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Histórico</span>
            </TabsTrigger>
          </TabsList>

          {/* ─── Monitor Tab ─── */}
          <TabsContent value="monitor" className="space-y-4 mt-4">
            {/* Connection Status */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Status do Robô
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                    {reminderEnabled ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <div>
                      <p className="text-[10px] text-muted-foreground">Régua</p>
                      <p className="text-xs font-semibold text-foreground">{reminderEnabled ? "Ativo" : "Pausado"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                    {whatsappInstance ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                    )}
                    <div>
                      <p className="text-[10px] text-muted-foreground">WhatsApp</p>
                      <p className="text-xs font-semibold text-foreground">{whatsappInstance ? whatsappInstance.name : "Sem conexão"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                    {whatsappInstance?.api_url ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <div>
                      <p className="text-[10px] text-muted-foreground">API</p>
                      <p className="text-xs font-semibold text-foreground">{whatsappInstance?.api_url ? "Configurada" : "Pendente"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Próxima exec.</p>
                      <p className="text-xs font-semibold text-foreground">08:00</p>
                    </div>
                  </div>
                </div>

                {!whatsappInstance && (
                  <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Atenção:</strong> Nenhuma instância WhatsApp conectada com API configurada.
                      Vá em <strong>WhatsApp → Parear</strong> para configurar.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Enviadas", value: reminderStats?.totalSent || 0, today: reminderStats?.todaySent || 0, icon: Send, gradient: "gradient-success" },
                { label: "Pendentes", value: reminderStats?.totalPending || 0, today: reminderStats?.todayPending || 0, icon: Clock, gradient: "gradient-warning" },
                { label: "Falhas", value: reminderStats?.totalFailed || 0, today: reminderStats?.todayFailed || 0, icon: XCircle, gradient: "gradient-danger" },
                { label: "Na Fila", value: queueStats?.queued || 0, today: null, icon: MessageSquare, gradient: "gradient-primary" },
              ].map((m) => (
                <Card key={m.label} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`h-8 w-8 rounded-lg ${m.gradient} flex items-center justify-center`}>
                        <m.icon className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{m.value}</p>
                    {m.today !== null && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Hoje: {m.today}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* By Type Breakdown */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Notificações por Tipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Lembretes", value: reminderStats?.byType.reminder || 0, cls: "bg-primary" },
                    { label: "Vencimento", value: reminderStats?.byType.due_date || 0, cls: "bg-warning" },
                    { label: "Atraso", value: reminderStats?.byType.overdue || 0, cls: "bg-destructive" },
                  ].map((t) => {
                    const total = (reminderStats?.byType.reminder || 0) + (reminderStats?.byType.due_date || 0) + (reminderStats?.byType.overdue || 0);
                    const pct = total > 0 ? (t.value / total) * 100 : 0;
                    return (
                      <div key={t.label} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t.label}</span>
                          <span className="font-semibold text-foreground">{t.value}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${t.cls} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Queue Summary */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" /> Fila de Envio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-3 text-center">
                  {[
                    { label: "Na fila", value: queueStats?.queued || 0, cls: "text-muted-foreground" },
                    { label: "Enviando", value: queueStats?.sending || 0, cls: "text-warning" },
                    { label: "Enviadas", value: queueStats?.sent || 0, cls: "text-success" },
                    { label: "Falhas", value: queueStats?.failed || 0, cls: "text-destructive" },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Total processado: {queueStats?.total || 0} mensagens
                </p>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  try {
                    toast({ title: "Executando régua de cobrança..." });
                    const { data, error } = await supabase.functions.invoke("billing-cron");
                    if (error) throw error;
                    toast({ title: "Régua executada!", description: `${data?.processed || 0} faturas, ${data?.queued || 0} enfileiradas.` });
                    queryClient.invalidateQueries({ queryKey: ["robot-reminder-stats"] });
                    queryClient.invalidateQueries({ queryKey: ["robot-queue-stats"] });
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  }
                }}
              >
                <Zap className="h-4 w-4 mr-2" /> Executar Régua
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  try {
                    toast({ title: "Processando fila..." });
                    const { data, error } = await supabase.functions.invoke("whatsapp-sender");
                    if (error) throw error;
                    toast({ title: "Fila processada!", description: `${data?.sent || 0} enviadas, ${data?.failed || 0} falhas.` });
                    queryClient.invalidateQueries({ queryKey: ["robot-queue-stats"] });
                    queryClient.invalidateQueries({ queryKey: ["robot-reminder-stats"] });
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  }
                }}
              >
                <Send className="h-4 w-4 mr-2" /> Enviar Fila
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["robot-queue-stats"] });
                  queryClient.invalidateQueries({ queryKey: ["robot-reminder-stats"] });
                  queryClient.invalidateQueries({ queryKey: ["robot-whatsapp-instance"] });
                  toast({ title: "Dados atualizados!" });
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
            </div>
          </TabsContent>

          {/* ─── Config Tab ─── */}
          <TabsContent value="config" className="space-y-4 mt-4">
            {/* Billing Mode Toggle */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Modalidade de Cobrança
                </CardTitle>
                <CardDescription>
                  Escolha entre Pix Direto (notificativo) ou Gateway de Pagamento (automatizado)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setBillingMode("pix_direto")}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      billingMode === "pix_direto"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
                        <Key className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">Pix Direto</p>
                        <Badge variant="outline" className="text-[10px]">Notificativo</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cadastre sua chave Pix e o sistema envia automaticamente via WhatsApp. Baixa manual no dashboard.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBillingMode("gateway")}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      billingMode === "gateway"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg gradient-success flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">Gateway</p>
                        <Badge variant="outline" className="text-[10px]">Automatizado</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Integração via API com gateways (Asaas, Efí, V3Pay). Pix copia e cola, boleto e baixa automática via webhook.
                    </p>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Pix Direto Config */}
            {billingMode === "pix_direto" && (
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-primary" /> Configuração do Pix Direto
                  </CardTitle>
                  <CardDescription>
                    Cadastre a chave Pix que será enviada nas notificações de cobrança
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo da Chave</Label>
                    <Select value={pixKeyType} onValueChange={setPixKeyType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf">CPF/CNPJ</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="telefone">Telefone</SelectItem>
                        <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Chave Pix</Label>
                    <Input
                      placeholder={
                        pixKeyType === "cpf" ? "000.000.000-00" :
                        pixKeyType === "email" ? "email@exemplo.com" :
                        pixKeyType === "telefone" ? "+5511999999999" :
                        "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      }
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                    />
                  </div>
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Como funciona:</strong> O sistema enviará mensagens automáticas via WhatsApp contendo esta chave Pix.
                      A confirmação de pagamento deve ser feita manualmente no painel de faturas.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Gateway Config */}
            {billingMode === "gateway" && (
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" /> Configuração do Gateway
                  </CardTitle>
                  <CardDescription>
                    Configure a integração com o gateway de pagamento
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Provedor</Label>
                    <Select value={gatewayProvider} onValueChange={setGatewayProvider}>
                      <SelectTrigger><SelectValue placeholder="Selecione o gateway" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asaas">Asaas</SelectItem>
                        <SelectItem value="efi">Efí (Gerencianet)</SelectItem>
                        <SelectItem value="v3pay">V3Pay</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Chave da API</Label>
                    <Input
                      type="password"
                      placeholder="Insira a chave de API do gateway"
                      value={gatewayApiKey}
                      onChange={(e) => setGatewayApiKey(e.target.value)}
                    />
                  </div>
                  <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Em breve:</strong> A integração com gateways será ativada após configuração da API.
                      Pagamentos via Pix copia e cola e boleto com baixa automática via webhook.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reminder Settings */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary" /> Régua de Cobrança
                </CardTitle>
                <CardDescription>
                  Configure os disparos automáticos de notificações via WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Ativar régua de cobrança</p>
                    <p className="text-xs text-muted-foreground">Enviar lembretes automáticos de cobrança</p>
                  </div>
                  <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
                </div>

                {reminderEnabled && (
                  <>
                    <div className="space-y-2">
                      <Label>Dias antes do vencimento para lembrete</Label>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={reminderDaysBefore}
                        onChange={(e) => setReminderDaysBefore(parseInt(e.target.value) || 2)}
                        className="max-w-[120px]"
                      />
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Programação dos envios:</p>
                      <div className="space-y-2">
                        {[
                          { icon: Bell, label: `${reminderDaysBefore} dia(s) antes`, desc: "Lembrete de vencimento próximo", cls: "text-primary" },
                          { icon: AlertTriangle, label: "No dia do vencimento", desc: "Envio com chave Pix ou link de pagamento", cls: "text-warning" },
                          { icon: XCircle, label: "Após o vencimento", desc: "Notificação de cobrança pendente", cls: "text-destructive" },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                            <item.icon className={`h-4 w-4 ${item.cls} shrink-0`} />
                            <div>
                              <p className="text-sm font-medium text-foreground">{item.label}</p>
                              <p className="text-xs text-muted-foreground">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Execute Now & Status */}
            <Card className="border-0 shadow-sm border-l-4 border-l-primary">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Robô de Cobrança
                </CardTitle>
                <CardDescription>
                  O robô processa faturas diariamente às 08:00 e envia mensagens via WhatsApp a cada 2 minutos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Régua de Cobrança</p>
                      <p className="text-sm font-semibold text-foreground">Diário 08:00</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Envio WhatsApp</p>
                      <p className="text-sm font-semibold text-foreground">A cada 2 min</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <Bell className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="text-sm font-semibold text-foreground">{reminderEnabled ? "Ativo" : "Pausado"}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        toast({ title: "Executando régua de cobrança..." });
                        const { data, error } = await supabase.functions.invoke("billing-cron");
                        if (error) throw error;
                        toast({ title: "Régua executada!", description: `${data?.processed || 0} faturas processadas, ${data?.queued || 0} mensagens enfileiradas.` });
                        queryClient.invalidateQueries({ queryKey: ["billing-reminders"] });
                      } catch (err: any) {
                        toast({ title: "Erro", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    <Zap className="h-4 w-4 mr-2" /> Executar Régua Agora
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        toast({ title: "Processando fila de envio..." });
                        const { data, error } = await supabase.functions.invoke("whatsapp-sender");
                        if (error) throw error;
                        toast({ title: "Fila processada!", description: `${data?.sent || 0} enviadas, ${data?.failed || 0} falhas.` });
                      } catch (err: any) {
                        toast({ title: "Erro", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" /> Enviar Fila Agora
                  </Button>
                </div>

                <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                  <p><strong className="text-foreground">Como funciona o robô:</strong></p>
                  <p>1. Todos os dias às 08:00, o sistema identifica faturas com vencimento próximo, no dia ou vencidas</p>
                  <p>2. Monta a mensagem usando os templates configurados e enfileira no WhatsApp</p>
                  <p>3. A cada 2 minutos, as mensagens da fila são enviadas pela instância WhatsApp conectada</p>
                  <p>4. Cada envio é registrado no histórico para acompanhamento</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="gradient-primary text-primary-foreground"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </div>
          </TabsContent>

          {/* ─── Templates Tab ─── */}
          <TabsContent value="templates" className="space-y-4 mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" /> Templates de Mensagens
                </CardTitle>
                <CardDescription>
                  Personalize as mensagens de cobrança enviadas via WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="rounded-lg bg-muted/50 border border-border p-3">
                  <p className="text-xs font-medium text-foreground mb-2">Variáveis disponíveis:</p>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATE_VARS.map((v) => (
                      <span key={v.var} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-mono">
                        {v.var} <span className="text-muted-foreground font-sans">— {v.desc}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {[
              {
                label: "Lembrete (antes do vencimento)",
                icon: Bell,
                value: templateReminder,
                setter: setTemplateReminder,
                desc: `Enviado ${reminderDaysBefore} dia(s) antes do vencimento`,
                cls: "text-primary",
              },
              {
                label: "Vencimento (no dia)",
                icon: AlertTriangle,
                value: templateDueDate,
                setter: setTemplateDueDate,
                desc: "Enviado no dia do vencimento com link/chave Pix",
                cls: "text-warning",
              },
              {
                label: "Atraso (após vencimento)",
                icon: XCircle,
                value: templateOverdue,
                setter: setTemplateOverdue,
                desc: "Enviado quando a fatura está vencida",
                cls: "text-destructive",
              },
            ].map((t) => (
              <Card key={t.label} className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <t.icon className={`h-4 w-4 ${t.cls}`} /> {t.label}
                  </CardTitle>
                  <CardDescription className="text-xs">{t.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={t.value}
                    onChange={(e) => t.setter(e.target.value)}
                    rows={3}
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>
            ))}

            <div className="flex justify-end">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="gradient-primary text-primary-foreground"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Salvando..." : "Salvar Templates"}
              </Button>
            </div>
          </TabsContent>

          {/* ─── History Tab ─── */}
          <TabsContent value="history" className="space-y-4 mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Histórico de Notificações
                </CardTitle>
                <CardDescription>
                  Registro de todas as notificações de cobrança enviadas
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {remindersLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : reminders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Nenhuma notificação enviada ainda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reminders.map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              {r.invoices?.clients?.name || "—"}
                            </TableCell>
                            <TableCell>{reminderTypeBadge(r.reminder_type)}</TableCell>
                            <TableCell>{statusBadge(r.status)}</TableCell>
                            <TableCell className="text-sm">
                              {format(parseISO(r.created_at), "dd/MM/yy HH:mm")}
                            </TableCell>
                            <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                              {r.error_message || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
