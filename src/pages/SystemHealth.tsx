import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

type Health = {
  organization_id: string;
  organization_name: string;
  invoices_open: number;
  invoices_overdue: number;
  invoices_paid_30d: number;
  amount_open: number;
  amount_overdue: number;
  wa_queue_pending: number;
  wa_failed_24h: number;
  wa_messages_24h: number;
  wa_instances_connected: number;
  settlement_ok_30d: number;
  settlement_errors_total: number;
  credit_balance_available: number;
  clients_active: number;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

function scoreOf(h: Health) {
  let score = 100;
  if (h.wa_instances_connected === 0) score -= 25;
  if (h.wa_queue_pending > 100) score -= 10;
  if (h.wa_failed_24h > 20) score -= 10;
  if (h.settlement_errors_total > 5) score -= 10;
  const overdueRatio = h.invoices_open > 0 ? h.invoices_overdue / h.invoices_open : 0;
  if (overdueRatio > 0.5) score -= 15;
  else if (overdueRatio > 0.3) score -= 8;
  return Math.max(0, score);
}

function scoreColor(s: number) {
  if (s >= 85) return "text-emerald-500";
  if (s >= 60) return "text-yellow-500";
  return "text-destructive";
}

function KpiCard({
  title,
  value,
  icon: Icon,
  hint,
  tone = "default",
}: {
  title: string;
  value: string | number;
  icon: any;
  hint?: string;
  tone?: "default" | "success" | "warn" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-500",
    warn: "text-yellow-500",
    danger: "text-destructive",
  }[tone];
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">{title}</span>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </div>
        <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function SystemHealth() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("system_health_metrics")
        .select("*")
        .order("organization_name");
      if (error) throw error;
      return (data || []) as Health[];
    },
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const rows = data || [];
  const totals = rows.reduce(
    (a, r) => ({
      invoices_open: a.invoices_open + Number(r.invoices_open || 0),
      invoices_overdue: a.invoices_overdue + Number(r.invoices_overdue || 0),
      amount_open: a.amount_open + Number(r.amount_open || 0),
      amount_overdue: a.amount_overdue + Number(r.amount_overdue || 0),
      wa_queue_pending: a.wa_queue_pending + Number(r.wa_queue_pending || 0),
      wa_failed_24h: a.wa_failed_24h + Number(r.wa_failed_24h || 0),
      wa_messages_24h: a.wa_messages_24h + Number(r.wa_messages_24h || 0),
      wa_instances_connected: a.wa_instances_connected + Number(r.wa_instances_connected || 0),
      settlement_ok_30d: a.settlement_ok_30d + Number(r.settlement_ok_30d || 0),
      settlement_errors_total: a.settlement_errors_total + Number(r.settlement_errors_total || 0),
      credit_balance_available: a.credit_balance_available + Number(r.credit_balance_available || 0),
      clients_active: a.clients_active + Number(r.clients_active || 0),
    }),
    {
      invoices_open: 0,
      invoices_overdue: 0,
      amount_open: 0,
      amount_overdue: 0,
      wa_queue_pending: 0,
      wa_failed_24h: 0,
      wa_messages_24h: 0,
      wa_instances_connected: 0,
      settlement_ok_30d: 0,
      settlement_errors_total: 0,
      credit_balance_available: 0,
      clients_active: 0,
    }
  );

  const globalScore = rows.length
    ? Math.round(rows.reduce((s, r) => s + scoreOf(r), 0) / rows.length)
    : 100;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-7 w-7 text-primary" /> Saúde do Sistema
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Observabilidade em tempo real — financeiro, WhatsApp, liquidação e performance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={autoRefresh ? "default" : "secondary"} className="gap-1">
              <RefreshCw className={`h-3 w-3 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Auto 15s" : "Pausado"}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setAutoRefresh((v) => !v)}>
              {autoRefresh ? "Pausar" : "Retomar"}
            </Button>
            <Button size="sm" onClick={() => refetch()}>
              Atualizar
            </Button>
          </div>
        </div>

        {/* Global Score */}
        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Score Geral de Saúde
              </div>
              <div className={`text-6xl font-bold mt-1 ${scoreColor(globalScore)}`}>
                {globalScore}
                <span className="text-2xl text-muted-foreground">/100</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Média ponderada de {rows.length} organização(ões) • Atualizado{" "}
                {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR") : "—"}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {globalScore >= 85 && (
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Saudável
                </Badge>
              )}
              {globalScore < 85 && globalScore >= 60 && (
                <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 gap-1">
                  <AlertTriangle className="h-3 w-3" /> Atenção
                </Badge>
              )}
              {globalScore < 60 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Crítico
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* KPIs Globais */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Visão Consolidada
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <KpiCard
              title="A Receber"
              value={fmt(totals.amount_open)}
              icon={DollarSign}
              hint={`${totals.invoices_open} faturas abertas`}
            />
            <KpiCard
              title="Em Atraso"
              value={fmt(totals.amount_overdue)}
              icon={AlertTriangle}
              hint={`${totals.invoices_overdue} vencidas`}
              tone={totals.invoices_overdue > 0 ? "warn" : "default"}
            />
            <KpiCard
              title="Clientes Ativos"
              value={totals.clients_active}
              icon={Users}
            />
            <KpiCard
              title="Créditos Disponíveis"
              value={fmt(totals.credit_balance_available)}
              icon={TrendingUp}
              tone="success"
            />
            <KpiCard
              title="WhatsApp Conectados"
              value={totals.wa_instances_connected}
              icon={totals.wa_instances_connected > 0 ? Wifi : WifiOff}
              tone={totals.wa_instances_connected > 0 ? "success" : "danger"}
            />
            <KpiCard
              title="Fila WhatsApp"
              value={totals.wa_queue_pending}
              icon={MessageSquare}
              hint="pendentes"
              tone={totals.wa_queue_pending > 100 ? "warn" : "default"}
            />
            <KpiCard
              title="Falhas WA 24h"
              value={totals.wa_failed_24h}
              icon={AlertTriangle}
              tone={totals.wa_failed_24h > 20 ? "danger" : totals.wa_failed_24h > 0 ? "warn" : "success"}
            />
            <KpiCard
              title="Liquidações OK 30d"
              value={totals.settlement_ok_30d}
              icon={Zap}
              hint={`${totals.settlement_errors_total} erros totais`}
              tone="success"
            />
          </div>
        </div>

        {/* Por organização */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Por Organização</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
            )}
            {!isLoading && rows.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma organização encontrada.
              </div>
            )}
            <div className="divide-y divide-border/50">
              {rows.map((r) => {
                const s = scoreOf(r);
                return (
                  <div key={r.organization_id} className="p-4 hover:bg-accent/30 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold truncate">{r.organization_name}</span>
                          <Badge
                            variant="outline"
                            className={`${scoreColor(s)} border-current/30`}
                          >
                            {s}/100
                          </Badge>
                          {r.wa_instances_connected === 0 && (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <WifiOff className="h-3 w-3" /> WA off
                            </Badge>
                          )}
                          {r.settlement_errors_total > 5 && (
                            <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px]">
                              {r.settlement_errors_total} erros liq.
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>👥 {r.clients_active} clientes</span>
                          <span>📄 {r.invoices_open} abertas</span>
                          <span className={r.invoices_overdue > 0 ? "text-yellow-500" : ""}>
                            ⚠️ {r.invoices_overdue} atraso
                          </span>
                          <span>✅ {r.invoices_paid_30d} pagas 30d</span>
                          <span>💰 {fmt(r.amount_open)} a receber</span>
                          <span className={r.amount_overdue > 0 ? "text-yellow-500" : ""}>
                            🔴 {fmt(r.amount_overdue)} atraso
                          </span>
                          <span>💬 {r.wa_messages_24h} msgs 24h</span>
                          <span className={r.wa_queue_pending > 100 ? "text-yellow-500" : ""}>
                            📤 {r.wa_queue_pending} fila
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
