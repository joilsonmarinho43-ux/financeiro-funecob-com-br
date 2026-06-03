import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, parseDateLocal } from "@/lib/format";
import {
  Send,
  UserPlus,
  CheckCircle2,
  BarChart3,
  Users,
  Settings,
  TrendingDown,
  Zap,
  Trophy,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type Props = {
  activeClients: number;
  overdueClients: number;
  monthRevenue: number;
  yearRevenue: number;
  showValues: boolean;
  onOpenClient: (id: string) => void;
};

export function DashboardEnhancements({
  activeClients,
  overdueClients,
  monthRevenue,
  yearRevenue,
  showValues,
  onOpenClient,
}: Props) {
  const navigate = useNavigate();
  const { organizationId } = useOrganization();

  const inadimplencia = activeClients > 0 ? (overdueClients / activeClients) * 100 : 0;

  // PIX central (today)
  const { data: pixStats } = useQuery({
    queryKey: ["dashboard-pix-stats", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("auto_settlement_events")
        .select("status")
        .eq("organization_id", organizationId!)
        .gte("created_at", start.toISOString());
      const rows = data || [];
      return {
        total: rows.length,
        conciliated: rows.filter((r: any) => r.status === "conciliado").length,
        pending: rows.filter((r: any) => r.status === "pendente_revisao").length,
        processing: rows.filter((r: any) => r.status === "processando" || r.status === "recebido").length,
      };
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // Revenue chart — last 6 months (paid invoices)
  const { data: chartData = [] } = useQuery({
    queryKey: ["dashboard-revenue-chart", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split("T")[0];
      // Faturas emitidas (mês de vencimento) e pagas (mês de pagamento)
      const [{ data: dues }, { data: paid }] = await Promise.all([
        supabase.from("invoices").select("amount, due_date")
          .eq("organization_id", organizationId!).gte("due_date", start),
        supabase.from("invoices").select("amount, paid_date")
          .eq("organization_id", organizationId!).eq("status", "pago").gte("paid_date", start),
      ]);
      const months: { key: string; label: string; faturado: number; recebido: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push({ key, label: d.toLocaleDateString("pt-BR", { month: "short" }), faturado: 0, recebido: 0 });
      }
      const idx = new Map(months.map((m, i) => [m.key, i]));
      for (const r of dues || []) {
        const k = (r.due_date as string).slice(0, 7);
        const i = idx.get(k); if (i !== undefined) months[i].faturado += Number(r.amount);
      }
      for (const r of paid || []) {
        if (!r.paid_date) continue;
        const k = (r.paid_date as string).slice(0, 7);
        const i = idx.get(k); if (i !== undefined) months[i].recebido += Number(r.amount);
      }
      return months;
    },
  });

  // Top 10 highest paying clients (last 365 days)
  const { data: topClients = [] } = useQuery({
    queryKey: ["dashboard-top-clients", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const { data } = await supabase
        .from("invoices")
        .select("amount, paid_date, client_id, clients(name)")
        .eq("organization_id", organizationId!)
        .eq("status", "pago")
        .gte("paid_date", since);
      const m = new Map<string, { name: string; total: number; last: string }>();
      for (const r of data || []) {
        if (!r.client_id) continue;
        const name = (r as any).clients?.name || "—";
        const cur = m.get(r.client_id) || { name, total: 0, last: "" };
        cur.total += Number(r.amount);
        if (r.paid_date && r.paid_date > cur.last) cur.last = r.paid_date;
        m.set(r.client_id, cur);
      }
      return Array.from(m.entries())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    },
  });

  // (Lista "Clientes em Risco" foi consolidada na tabela "Clientes com Plano Vencido" da página)



  // Upcoming due — buckets
  const { data: upcoming = [] } = useQuery({
    queryKey: ["dashboard-upcoming", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];
      const plus10 = new Date(today); plus10.setDate(plus10.getDate() + 10);
      const { data } = await supabase
        .from("invoices")
        .select("id, amount, due_date, client_id, clients(name)")
        .eq("organization_id", organizationId!)
        .eq("status", "aberto")
        .gte("due_date", todayStr)
        .lte("due_date", plus10.toISOString().split("T")[0])
        .order("due_date", { ascending: true });
      return data || [];
    },
  });

  const buckets = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const b = { hoje: [] as any[], d3: [] as any[], d7: [] as any[], d10: [] as any[] };
    for (const inv of upcoming) {
      const days = Math.round((parseDateLocal(inv.due_date as any).getTime() - today.getTime()) / (24 * 3600 * 1000));
      if (days <= 0) b.hoje.push(inv);
      else if (days <= 3) b.d3.push(inv);
      else if (days <= 7) b.d7.push(inv);
      else b.d10.push(inv);
    }
    return b;
  }, [upcoming]);

  const fmt = (v: number) => showValues ? formatCurrency(v) : "••••";
  const fmtDate = (s?: string | null) => s ? parseDateLocal(s).toLocaleDateString("pt-BR") : "—";

  return (
    <>
      {/* Executive: Inadimplência */}
      <Card
        onClick={() => navigate("/relatorios")}
        className="border-0 shadow-sm cursor-pointer transition-transform hover:scale-[1.01] hover:shadow-md active:scale-[0.99]"
      >
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5" /> Taxa de Inadimplência
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${inadimplencia > 30 ? "text-destructive" : inadimplencia > 15 ? "text-warning" : "text-success"}`}>
              {inadimplencia.toFixed(1)}%
            </p>
            <p className="text-[10px] text-muted-foreground">{overdueClients} de {activeClients} ativos</p>
          </div>
        </CardContent>
      </Card>


      {/* Quick actions */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: "Enviar Cobrança", icon: Send, to: "/financeiro" },
              { label: "Novo Cliente", icon: UserPlus, to: "/clientes" },
              { label: "Registrar Pgto.", icon: CheckCircle2, to: "/financeiro" },
              { label: "Relatórios", icon: BarChart3, to: "/relatorios" },
              { label: "Clientes", icon: Users, to: "/clientes" },
              { label: "Configurações", icon: Settings, to: "/configuracoes" },
            ].map((a) => (
              <Button
                key={a.label}
                variant="outline"
                size="sm"
                onClick={() => navigate(a.to)}
                className="flex flex-col h-auto py-3 gap-1.5 text-[11px] leading-tight"
              >
                <a.icon className="h-4 w-4" />
                <span className="text-center">{a.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* PIX Central */}
      <Card
        onClick={() => navigate("/admin/auto-settlement")}
        className="border-0 shadow-sm overflow-hidden cursor-pointer transition-transform hover:scale-[1.005] hover:shadow-md"
      >
        <div className="px-4 py-3 bg-primary/10 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Central PIX</h3>
          <Badge variant="secondary" className="text-[10px] ml-auto">tempo real</Badge>
        </div>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "PIX Recebidos Hoje", value: pixStats?.total ?? "—", color: "text-foreground", to: "/admin/auto-settlement" },
            { label: "Reconhecidos Auto.", value: pixStats?.conciliated ?? "—", color: "text-success", to: "/admin/auto-settlement?status=conciliado" },
            { label: "Processando", value: pixStats?.processing ?? "—", color: "text-primary", to: "/admin/auto-settlement?status=processando" },
            { label: "Aguardando Conferência", value: pixStats?.pending ?? "—", color: "text-warning", to: "/admin/auto-settlement?status=pendente_revisao" },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(p.to); }}
              className="rounded-lg border p-3 text-left hover:bg-muted/40 transition-colors"
            >
              <p className="text-[11px] text-muted-foreground">{p.label}</p>
              <p className={`text-2xl font-bold mt-1 ${p.color}`}>{p.value}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Revenue chart */}
      <Card
        onClick={() => navigate("/relatorios")}
        className="border-0 shadow-sm cursor-pointer transition-transform hover:scale-[1.005] hover:shadow-md"
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Faturamento — Últimos 6 meses</h3>
            <Badge variant="secondary" className="text-[10px]">Faturado vs Recebido</Badge>
          </div>
          <div className="h-56">
            {chartData.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="faturado" name="Faturado" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="recebido" name="Recebido" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming buckets */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Alertas de Vencimento</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: "hoje", label: "🔴 Vencem Hoje", color: "border-destructive/40 bg-destructive/5", count: buckets.hoje, to: "/financeiro?vencimento=hoje" },
              { key: "d3", label: "🟠 Em até 3 dias", color: "border-orange-400/40 bg-orange-400/5", count: buckets.d3, to: "/financeiro?vencimento=3" },
              { key: "d7", label: "🟡 Em até 7 dias", color: "border-yellow-400/40 bg-yellow-400/5", count: buckets.d7, to: "/financeiro?vencimento=7" },
              { key: "d10", label: "🟢 Em até 10 dias", color: "border-success/40 bg-success/5", count: buckets.d10, to: "/financeiro?vencimento=10" },
            ].map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => navigate(b.to)}
                className={`rounded-lg border p-3 text-left transition-transform hover:scale-[1.02] hover:shadow-sm active:scale-[0.99] ${b.color}`}
              >
                <p className="text-[11px] font-medium">{b.label}</p>
                <p className="text-2xl font-bold mt-1">{b.count.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {fmt(b.count.reduce((s: number, i: any) => s + Number(i.amount), 0))}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top clientes */}
      <div className="grid grid-cols-1 gap-4">


        {/* Top */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-success/10 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-success" />
            <h3 className="font-semibold text-sm">Maiores Receitas (12 meses)</h3>
          </div>
          <CardContent className="p-0">
            {topClients.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-6">Sem pagamentos no período</p>
            ) : (
              <ol className="divide-y">
                {topClients.map((c, i) => (
                  <li key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-muted/30">
                    <button onClick={() => onOpenClient(c.id)} className="text-left flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-primary truncate hover:underline">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">Último pagto.: {fmtDate(c.last)}</p>
                      </div>
                    </button>
                    <p className="text-xs font-semibold shrink-0 text-success">{fmt(c.total)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
