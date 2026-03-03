import { Users, UserX, UserMinus, Eye, EyeOff, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function Dashboard() {
  const [showValues, setShowValues] = useState(false);
  const { organizationId } = useOrganization();

  // Fetch client counts by status
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

  // Fetch financial data (invoices)
  const { data: financialStats, isLoading: loadingFinancial } = useQuery({
    queryKey: ["dashboard-financial", organizationId],
    queryFn: async () => {
      if (!organizationId) return { monthBalance: 0, yearBalance: 0 };
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const startOfYear = `${now.getFullYear()}-01-01`;

      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("amount, status, paid_date, due_date")
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

  // Fetch monthly client creation for chart
  const { data: chartData, isLoading: loadingChart } = useQuery({
    queryKey: ["dashboard-chart", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const year = new Date().getFullYear();
      const { data, error } = await supabase
        .from("clients")
        .select("created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", `${year}-01-01`);
      if (error) throw error;

      const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      const counts = new Array(12).fill(0);
      for (const c of data) {
        const m = new Date(c.created_at).getMonth();
        counts[m]++;
      }
      // Accumulate
      let acc = 0;
      return months.map((month, i) => {
        acc += counts[i];
        return { month, ativos: acc };
      });
    },
    enabled: !!organizationId,
  });

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const now = new Date();
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const clientMetrics = [
    {
      title: "Clientes Ativos",
      value: clientStats?.active ?? 0,
      icon: Users,
      gradient: "gradient-primary",
    },
    {
      title: "Clientes Vencidos",
      value: clientStats?.expired ?? 0,
      icon: UserX,
      gradient: "gradient-warning",
    },
    {
      title: "Clientes Desativados",
      value: clientStats?.inactive ?? 0,
      icon: UserMinus,
      gradient: "gradient-danger",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do sistema de cobrança
          </p>
        </div>
        <button
          onClick={() => setShowValues(!showValues)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showValues ? "Ocultar valores" : "Mostrar valores"}
        </button>
      </div>

      {/* Client Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {clientMetrics.map((metric) => (
          <Card key={metric.title} className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center gap-4 p-5">
                <div className={`h-12 w-12 rounded-xl ${metric.gradient} flex items-center justify-center shrink-0`}>
                  <metric.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{metric.title}</p>
                  {loadingClients ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{metric.value}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Líquido do Mês</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{monthNames[now.getMonth()]} {now.getFullYear()}</p>
            </div>
            {loadingFinancial ? (
              <Skeleton className="h-9 w-40 mt-3" />
            ) : (
              <p className="text-3xl font-bold text-foreground mt-3">
                {showValues ? formatCurrency(financialStats?.monthBalance ?? 0) : "R$ ••••••"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Líquido do Ano</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{now.getFullYear()}</p>
            </div>
            {loadingFinancial ? (
              <Skeleton className="h-9 w-40 mt-3" />
            ) : (
              <p className="text-3xl font-bold text-foreground mt-3">
                {showValues ? formatCurrency(financialStats?.yearBalance ?? 0) : "R$ ••••••"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Clientes Cadastrados</h3>
              <p className="text-sm text-muted-foreground">
                Acumulado de 01/01/{now.getFullYear()} a 31/12/{now.getFullYear()}
              </p>
            </div>
          </div>
          <div className="h-[300px]">
            {loadingChart ? (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-full w-full rounded-lg" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData ?? []}>
                  <defs>
                    <linearGradient id="colorAtivos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(220, 10%, 46%)", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(220, 10%, 46%)", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(0, 0%, 100%)",
                      border: "1px solid hsl(220, 13%, 90%)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="ativos"
                    stroke="hsl(199, 89%, 48%)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorAtivos)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
