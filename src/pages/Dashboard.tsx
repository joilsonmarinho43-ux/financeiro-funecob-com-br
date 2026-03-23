import { Users, UserX, UserMinus, Eye, EyeOff, DollarSign, Send, MessageSquare, Loader2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function Dashboard() {
  const [showValues, setShowValues] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [chartDays, setChartDays] = useState(7);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const { organizationId } = useOrganization();

  // Fetch WhatsApp instance for sending
  const { data: whatsappInstance } = useQuery({
    queryKey: ["whatsapp-instance", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id, api_url, api_key, status")
        .eq("organization_id", organizationId)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch billing settings for message template
  const { data: billingSettings } = useQuery({
    queryKey: ["billing-settings", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("billing_settings")
        .select("template_overdue, pix_key")
        .eq("organization_id", organizationId)
        .maybeSingle();
      return data;
    },
    enabled: !!organizationId,
  });

  const sendWhatsAppMessage = async (inv: any) => {
    const client = inv.clients as any;
    const phone = client?.phone;
    if (!phone) {
      toast({ title: "Erro", description: "Cliente sem telefone cadastrado.", variant: "destructive" });
      return;
    }
    if (!whatsappInstance?.api_url || !whatsappInstance?.api_key) {
      toast({ title: "Erro", description: "Instância WhatsApp não configurada. Vá em WhatsApp → Parear.", variant: "destructive" });
      return;
    }

    setSendingId(inv.id);
    try {
      let message = billingSettings?.template_overdue || 
        "Olá {nome}! Sua fatura no valor de {valor} com vencimento em {vencimento} está em atraso. Por favor, regularize o pagamento.";
      message = message
        .replace("{nome}", client?.name || "")
        .replace("{valor}", inv.amount?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "")
        .replace("{vencimento}", new Date(inv.due_date).toLocaleDateString("pt-BR"))
        .replace("{link_ou_chave_pix}", billingSettings?.pix_key ? `Chave PIX: ${billingSettings.pix_key}` : "");

      // Queue the message
      const { error } = await supabase.from("whatsapp_queue").insert({
        phone: phone.replace(/\D/g, ""),
        message,
        organization_id: organizationId,
        status: "queued",
      });

      if (error) throw error;
      toast({ title: "Mensagem enfileirada!", description: `Cobrança enviada para ${client?.name}.` });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const openWhatsAppDirect = (inv: any) => {
    const client = inv.clients as any;
    const phone = client?.phone?.replace(/\D/g, "");
    if (!phone) {
      toast({ title: "Erro", description: "Cliente sem telefone cadastrado.", variant: "destructive" });
      return;
    }
    let message = `Olá ${client?.name}! Sua fatura no valor de ${inv.amount?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} venceu em ${new Date(inv.due_date).toLocaleDateString("pt-BR")}. Por favor, regularize o pagamento.`;
    if (billingSettings?.pix_key) message += ` Chave PIX: ${billingSettings.pix_key}`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const { data: clientStats, isLoading: loadingClients } = useQuery({
    queryKey: ["dashboard-clients", organizationId],
    queryFn: async () => {
      if (!organizationId) return { active: 0, expired: 0, inactive: 0 };
      const { data, error } = await supabase
        .from("clients")
        .select("status")
        .eq("organization_id", organizationId);
      if (error) throw error;
      const active = data.filter((c) => c.status === "ativo").length;
      const expired = data.filter((c) => c.status === "vencido").length;
      const inactive = data.filter((c) => c.status === "inativo" || c.status === "desativado").length;
      return { active, expired, inactive };
    },
    enabled: !!organizationId,
  });

  const { data: financialStats, isLoading: loadingFinancial } = useQuery({
    queryKey: ["dashboard-financial", organizationId],
    queryFn: async () => {
      if (!organizationId) return { monthBalance: 0, yearBalance: 0 };
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const startOfYear = `${now.getFullYear()}-01-01`;
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("amount, status, paid_date")
        .eq("organization_id", organizationId);
      if (error) throw error;
      let monthBalance = 0;
      let yearBalance = 0;
      for (const inv of invoices) {
        if (inv.status === "pago" && inv.paid_date) {
          if (inv.paid_date >= startOfYear) yearBalance += Number(inv.amount);
          if (inv.paid_date >= startOfMonth) monthBalance += Number(inv.amount);
        }
      }
      return { monthBalance, yearBalance };
    },
    enabled: !!organizationId,
  });

  // Client activity by period
  const { data: clientChartData } = useQuery({
    queryKey: ["dashboard-client-chart", organizationId, chartDays],
    queryFn: async () => {
      if (!organizationId) return [];
      const now = new Date();
      const days: { date: string; label: string }[] = [];
      for (let i = chartDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push({
          date: d.toISOString().split("T")[0],
          label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        });
      }
      const startDate = days[0].date;
      const { data, error } = await supabase
        .from("clients")
        .select("created_at, status")
        .eq("organization_id", organizationId)
        .gte("created_at", startDate);
      if (error) throw error;
      return days.map((day) => {
        const dayClients = data.filter((c) => c.created_at.startsWith(day.date));
        return {
          name: day.label,
          ativados: dayClients.filter((c) => c.status === "ativo").length,
          cadastrados: dayClients.length,
          renovados: 0,
        };
      });
    },
    enabled: !!organizationId,
  });

  // Transactions by period
  const { data: txChartData } = useQuery({
    queryKey: ["dashboard-tx-chart", organizationId, chartDays],
    queryFn: async () => {
      if (!organizationId) return [];
      const now = new Date();
      const days: { date: string; label: string }[] = [];
      for (let i = chartDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push({
          date: d.toISOString().split("T")[0],
          label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        });
      }
      const startDate = days[0].date;
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, type, transaction_date")
        .eq("organization_id", organizationId)
        .gte("transaction_date", startDate);
      if (error) throw error;
      return days.map((day) => {
        const dayTx = data.filter((t) => t.transaction_date === day.date);
        return {
          name: day.label,
          entradas: dayTx.filter((t) => t.type === "entrada").reduce((s, t) => s + Number(t.amount), 0),
          saidas: dayTx.filter((t) => t.type === "saida").reduce((s, t) => s + Number(t.amount), 0),
        };
      });
    },
    enabled: !!organizationId,
  });

  // Overdue clients
  const { data: overdueClients } = useQuery({
    queryKey: ["dashboard-overdue", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("id, amount, due_date, status, clients(name, phone), plans(name)")
        .eq("organization_id", organizationId)
        .eq("status", "vencido")
        .order("due_date", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const PIE_COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
    "hsl(var(--destructive))",
    "hsl(210, 70%, 55%)",
    "hsl(280, 60%, 55%)",
    "hsl(30, 80%, 55%)",
    "hsl(180, 60%, 45%)",
  ];

  const { data: clientsByPlan } = useQuery({
    queryKey: ["dashboard-clients-by-plan", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("client_id, plans(name)")
        .eq("organization_id", organizationId)
        .eq("status", "aberto");
      if (error) throw error;
      const planMap: Record<string, Set<string>> = {};
      for (const inv of invoices) {
        const planName = (inv.plans as any)?.name || "Sem plano";
        if (!planMap[planName]) planMap[planName] = new Set();
        planMap[planName].add(inv.client_id);
      }
      return Object.entries(planMap).map(([name, clients]) => ({
        name,
        value: clients.size,
      }));
    },
    enabled: !!organizationId,
  });

  // Fetch clients for selected plan slice
  const { data: planClients, isLoading: loadingPlanClients } = useQuery({
    queryKey: ["dashboard-plan-clients", organizationId, selectedPlan],
    queryFn: async () => {
      if (!organizationId || !selectedPlan) return [];
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("client_id, clients(name, phone, email, status)")
        .eq("organization_id", organizationId)
        .eq("status", "aberto");
      if (error) throw error;

      // If "Sem plano", get invoices with no plan
      let filtered = invoices;
      if (selectedPlan !== "Sem plano") {
        const { data: planInvoices, error: e2 } = await supabase
          .from("invoices")
          .select("client_id, plans!inner(name), clients(name, phone, email, status)")
          .eq("organization_id", organizationId)
          .eq("status", "aberto")
          .eq("plans.name", selectedPlan);
        if (e2) throw e2;
        filtered = planInvoices;
      } else {
        filtered = invoices.filter((inv) => !(inv as any).plan_id);
      }

      // Deduplicate by client_id
      const seen = new Set<string>();
      return filtered.filter((inv) => {
        if (seen.has(inv.client_id)) return false;
        seen.add(inv.client_id);
        return true;
      }).map((inv) => inv.clients as any);
    },
    enabled: !!organizationId && !!selectedPlan,
  });

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const now = new Date();
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-4">
      {/* Metric Cards - 2 columns on mobile */}
      <div className="grid grid-cols-2 gap-3">
        {/* Clientes Ativos */}
        <Card className="border-0 shadow-sm overflow-hidden bg-primary">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary-foreground/80 shrink-0" />
            <div>
              <p className="text-xs text-primary-foreground/80">Clientes Ativos</p>
              {loadingClients ? (
                <Skeleton className="h-7 w-12 mt-0.5 bg-primary-foreground/20" />
              ) : (
                <p className="text-2xl font-bold text-primary-foreground">{clientStats?.active ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Clientes Vencidos */}
        <Card className="border-0 shadow-sm overflow-hidden bg-destructive">
          <CardContent className="p-4 flex items-center gap-3">
            <UserX className="h-8 w-8 text-destructive-foreground/80 shrink-0" />
            <div>
              <p className="text-xs text-destructive-foreground/80">Clientes Vencidos</p>
              {loadingClients ? (
                <Skeleton className="h-7 w-12 mt-0.5 bg-destructive-foreground/20" />
              ) : (
                <p className="text-2xl font-bold text-destructive-foreground">{clientStats?.expired ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Clientes Desativados */}
        <Card className="border-0 shadow-sm overflow-hidden" style={{ background: "hsl(var(--sidebar-background))" }}>
          <CardContent className="p-4 flex items-center gap-3">
            <UserMinus className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Clientes Desativados</p>
              {loadingClients ? (
                <Skeleton className="h-7 w-12 mt-0.5" />
              ) : (
                <p className="text-2xl font-bold text-sidebar-foreground">{clientStats?.inactive ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Saldo do Mês */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Saldo Líquido do Mês</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {monthNames[now.getMonth()].slice(0, 3)}
              </Badge>
            </div>
            <div className="flex items-center justify-between mt-2">
              <DollarSign className="h-6 w-6 text-primary shrink-0" />
              {loadingFinancial ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <button onClick={() => setShowValues(!showValues)} className="flex items-center gap-1.5 text-foreground">
                  <span className="text-sm font-bold">
                    {showValues ? formatCurrency(financialStats?.monthBalance ?? 0) : "****** "}
                  </span>
                  {showValues ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Saldo do Ano - full width */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Saldo Líquido do Ano</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive">
                {now.getFullYear()}
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <DollarSign className="h-6 w-6 text-primary shrink-0" />
            {loadingFinancial ? (
              <Skeleton className="h-6 w-28" />
            ) : (
              <button onClick={() => setShowValues(!showValues)} className="flex items-center gap-1.5 text-foreground">
                <span className="text-sm font-bold">
                  {showValues ? formatCurrency(financialStats?.yearBalance ?? 0) : "****** "}
                </span>
                {showValues ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            )}
            <DollarSign className="h-6 w-6 text-primary shrink-0" />
          </div>
        </CardContent>
      </Card>

      {/* Period filter */}
      <div className="flex items-center justify-end gap-1">
        {[7, 15, 30].map((d) => (
          <Button
            key={d}
            size="sm"
            variant={chartDays === d ? "default" : "outline"}
            className="h-7 text-xs px-2.5"
            onClick={() => setChartDays(d)}
          >
            {d} dias
          </Button>
        ))}
      </div>

      {/* Status Clientes */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm text-foreground mb-3">Status Clientes — Últimos {chartDays} Dias</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clientChartData ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                <Line type="monotone" dataKey="ativados" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} name="Clientes Ativados" />
                <Line type="monotone" dataKey="cadastrados" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} name="Apenas Cadastrados" />
                <Line type="monotone" dataKey="renovados" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Clientes Renovados" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Movimentações Últimos 7 Dias */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm text-foreground mb-3">Movimentações — Últimos {chartDays} Dias</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={txChartData ?? []}>
                <defs>
                  <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                <Area type="monotone" dataKey="entradas" stroke="hsl(var(--success))" fill="url(#colorEntradas)" strokeWidth={2} name="Entradas" />
                <Area type="monotone" dataKey="saidas" stroke="hsl(var(--destructive))" fill="url(#colorSaidas)" strokeWidth={2} name="Saídas" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Distribuição de Clientes por Plano */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm text-foreground mb-3">Distribuição de Clientes por Plano</h3>
          <div className="h-[260px]">
            {(!clientsByPlan || clientsByPlan.length === 0) ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Nenhum dado disponível
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={clientsByPlan}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                    onClick={(_, index) => {
                      const planName = clientsByPlan[index]?.name;
                      setSelectedPlan(selectedPlan === planName ? null : planName);
                    }}
                    cursor="pointer"
                  >
                    {clientsByPlan.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                        stroke={selectedPlan === entry.name ? "hsl(var(--foreground))" : "transparent"}
                        strokeWidth={selectedPlan === entry.name ? 3 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [`${value} cliente(s)`, "Quantidade"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Selected Plan Clients Detail */}
      {selectedPlan && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-primary px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-primary-foreground">Clientes — {selectedPlan}</h3>
              <p className="text-xs text-primary-foreground/80">Clique na fatia novamente para fechar</p>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-primary-foreground hover:text-primary-foreground/80" onClick={() => setSelectedPlan(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">Telefone</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPlanClients ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : (!planClients || planClients.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                        Nenhum cliente encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    planClients.map((client: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-medium">{client?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{client?.phone ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{client?.email ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {client?.status ?? "—"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clientes com Plano Vencido */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="bg-destructive px-4 py-3">
          <h3 className="font-semibold text-sm text-destructive-foreground">Meus Clientes Com Plano Vencido</h3>
          <p className="text-xs text-destructive-foreground/80">Informe aos seus clientes sobre o vencimento</p>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Vencimento</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Plano</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!overdueClients || overdueClients.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum cliente com plano vencido
                    </TableCell>
                  </TableRow>
                ) : (
                  overdueClients.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-xs font-medium text-primary">
                        {(inv.clients as any)?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">
                          {new Date(inv.due_date).toLocaleDateString("pt-BR")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="text-[10px] bg-destructive/10 text-destructive border-0">
                          Vencido
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {(inv.plans as any)?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-primary hover:text-primary"
                            onClick={() => sendWhatsAppMessage(inv)}
                            disabled={sendingId === inv.id}
                            title="Enviar cobrança via robô"
                          >
                            {sendingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-success hover:text-success"
                            onClick={() => openWhatsAppDirect(inv)}
                            title="Abrir WhatsApp Web"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
