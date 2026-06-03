import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Activity, AlertTriangle, CheckCircle2, DollarSign, MessageSquare,
  RefreshCw, TrendingUp, Users, Wifi, WifiOff, Zap, Maximize2, Minimize2,
  Search, Download, ShieldCheck, Bell, Clock, Server,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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

type LogRow = {
  id: string;
  action: string;
  created_at: string;
  organization_id: string | null;
  details: any;
};

type Severity = "critical" | "warning" | "info";
type Alert = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  org_id?: string | null;
  org_name?: string;
  at: string;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

const tsFmt = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

// ---------- Weighted score ----------
function pillarScores(h: Health) {
  // FINANCEIRO (0..100): inadimplência ratio + valor em atraso vs aberto
  const ratio = h.invoices_open > 0 ? h.invoices_overdue / h.invoices_open : 0;
  let fin = 100 - Math.min(60, ratio * 120);
  if (h.amount_open > 0) {
    const moneyRatio = Number(h.amount_overdue || 0) / Number(h.amount_open || 1);
    fin -= Math.min(30, moneyRatio * 50);
  }
  fin = Math.max(0, fin);

  // WHATSAPP (0..100)
  let wa = 100;
  if (h.wa_instances_connected === 0) wa -= 50;
  if (h.wa_queue_pending > 500) wa -= 30;
  else if (h.wa_queue_pending > 100) wa -= 15;
  if (h.wa_failed_24h > 50) wa -= 25;
  else if (h.wa_failed_24h > 20) wa -= 12;
  wa = Math.max(0, wa);

  // LIQUIDAÇÃO PIX
  const totalSet = h.settlement_ok_30d + h.settlement_errors_total;
  const errRatio = totalSet > 0 ? h.settlement_errors_total / totalSet : 0;
  let liq = 100 - Math.min(80, errRatio * 200);
  if (h.settlement_errors_total > 20) liq -= 10;
  liq = Math.max(0, liq);

  // PERFORMANCE (sem CPU real → derivado de fila)
  let perf = 100;
  if (h.wa_queue_pending > 1000) perf -= 40;
  else if (h.wa_queue_pending > 300) perf -= 20;
  perf = Math.max(0, perf);

  // SEGURANÇA (placeholder estável)
  const sec = 95;

  return { fin, wa, liq, perf, sec };
}

function weightedScore(h: Health) {
  const p = pillarScores(h);
  return Math.round(p.fin * 0.4 + p.wa * 0.25 + p.liq * 0.2 + p.perf * 0.1 + p.sec * 0.05);
}

function scoreColor(s: number) {
  if (s >= 85) return "text-emerald-500";
  if (s >= 60) return "text-yellow-500";
  return "text-destructive";
}
function scoreBg(s: number) {
  if (s >= 85) return "bg-emerald-500/10 border-emerald-500/30";
  if (s >= 60) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-destructive/10 border-destructive/30";
}

// ---------- Alerts derived from data ----------
function deriveAlerts(rows: Health[], logs: LogRow[]): Alert[] {
  const out: Alert[] = [];
  for (const r of rows) {
    if (r.wa_instances_connected === 0 && r.clients_active > 0) {
      out.push({
        id: `wa-off-${r.organization_id}`, severity: "critical",
        title: "WhatsApp desconectado",
        detail: `Nenhuma instância conectada — envios bloqueados`,
        org_id: r.organization_id, org_name: r.organization_name,
        at: new Date().toISOString(),
      });
    }
    if (r.wa_queue_pending > 500) {
      out.push({
        id: `wa-queue-${r.organization_id}`, severity: "critical",
        title: "Fila WhatsApp travada",
        detail: `${r.wa_queue_pending} mensagens pendentes`,
        org_id: r.organization_id, org_name: r.organization_name,
        at: new Date().toISOString(),
      });
    } else if (r.wa_queue_pending > 100) {
      out.push({
        id: `wa-queue-w-${r.organization_id}`, severity: "warning",
        title: "Fila WhatsApp crescendo",
        detail: `${r.wa_queue_pending} mensagens pendentes`,
        org_id: r.organization_id, org_name: r.organization_name,
        at: new Date().toISOString(),
      });
    }
    if (r.wa_failed_24h > 20) {
      out.push({
        id: `wa-fail-${r.organization_id}`, severity: r.wa_failed_24h > 50 ? "critical" : "warning",
        title: "Falhas WhatsApp acima do normal",
        detail: `${r.wa_failed_24h} falhas nas últimas 24h`,
        org_id: r.organization_id, org_name: r.organization_name,
        at: new Date().toISOString(),
      });
    }
    if (r.settlement_errors_total > 5) {
      out.push({
        id: `set-err-${r.organization_id}`, severity: r.settlement_errors_total > 20 ? "critical" : "warning",
        title: "Erros em liquidação PIX",
        detail: `${r.settlement_errors_total} eventos com erro`,
        org_id: r.organization_id, org_name: r.organization_name,
        at: new Date().toISOString(),
      });
    }
    const ratio = r.invoices_open > 0 ? r.invoices_overdue / r.invoices_open : 0;
    if (ratio > 0.5 && r.invoices_overdue > 5) {
      out.push({
        id: `delinq-${r.organization_id}`, severity: "warning",
        title: "Inadimplência elevada",
        detail: `${Math.round(ratio * 100)}% das faturas em atraso`,
        org_id: r.organization_id, org_name: r.organization_name,
        at: new Date().toISOString(),
      });
    }
  }
  // Alertas vindos de logs críticos recentes
  for (const l of logs) {
    const a = l.action || "";
    if (a.includes("error") || a.includes("erro") || a.endsWith("_failed") || a.includes("retry_exhausted")) {
      out.push({
        id: `log-${l.id}`, severity: "critical",
        title: a, detail: typeof l.details === "object" ? JSON.stringify(l.details).slice(0, 140) : String(l.details ?? ""),
        org_id: l.organization_id, at: l.created_at,
      });
    }
  }
  // ordena: critical > warning > info, depois data desc
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((x, y) => rank[x.severity] - rank[y.severity] || y.at.localeCompare(x.at));
}

// ---------- KPI Card ----------
function KpiCard({
  title, value, icon: Icon, hint, tone = "default",
}: { title: string; value: string | number; icon: any; hint?: string; tone?: "default" | "success" | "warn" | "danger" }) {
  const toneClass = { default: "text-foreground", success: "text-emerald-500", warn: "text-yellow-500", danger: "text-destructive" }[tone];
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

function PillarBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${scoreColor(value)}`}>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${value >= 85 ? "bg-emerald-500" : value >= 60 ? "bg-yellow-500" : "bg-destructive"}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export default function SystemHealth() {
  const { user } = useAuthGuard();
  const { data: isAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin-health", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      return !!data;
    },
    enabled: !!user,
  });

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [noc, setNoc] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"score" | "overdue" | "errors" | "delinquency">("score");
  const [logSearch, setLogSearch] = useState("");
  const [logSev, setLogSev] = useState<"all" | "critical" | "warning">("all");
  const containerRef = useRef<HTMLDivElement>(null);


  const { data: rows = [], refetch, dataUpdatedAt, isLoading } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("system_health_metrics").select("*").order("organization_name");
      if (error) throw error;
      return (data || []) as Health[];
    },
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["system-health-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_logs")
        .select("id, action, created_at, organization_id, details")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data || []) as LogRow[];
    },
    refetchInterval: autoRefresh ? 20000 : false,
  });

  const orgNameMap = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.organization_id, r.organization_name));
    return m;
  }, [rows]);

  const filteredRows = useMemo(
    () => (orgFilter === "all" ? rows : rows.filter((r) => r.organization_id === orgFilter)),
    [rows, orgFilter],
  );

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    if (sortBy === "score") arr.sort((a, b) => weightedScore(a) - weightedScore(b));
    else if (sortBy === "overdue") arr.sort((a, b) => Number(b.amount_overdue) - Number(a.amount_overdue));
    else if (sortBy === "errors") arr.sort((a, b) => b.settlement_errors_total + b.wa_failed_24h - (a.settlement_errors_total + a.wa_failed_24h));
    else if (sortBy === "delinquency") arr.sort((a, b) => (b.invoices_open ? b.invoices_overdue / b.invoices_open : 0) - (a.invoices_open ? a.invoices_overdue / a.invoices_open : 0));
    return arr;
  }, [filteredRows, sortBy]);

  const alerts = useMemo(() => {
    const a = deriveAlerts(filteredRows, logs);
    return logSev === "all" ? a : a.filter((x) => x.severity === logSev);
  }, [filteredRows, logs, logSev]);

  const totals = filteredRows.reduce(
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
      invoices_open: 0, invoices_overdue: 0, amount_open: 0, amount_overdue: 0,
      wa_queue_pending: 0, wa_failed_24h: 0, wa_messages_24h: 0, wa_instances_connected: 0,
      settlement_ok_30d: 0, settlement_errors_total: 0, credit_balance_available: 0, clients_active: 0,
    },
  );

  // Score global ponderado (média ponderada dos scores ponderados de cada org)
  const globalScore = filteredRows.length
    ? Math.round(filteredRows.reduce((s, r) => s + weightedScore(r), 0) / filteredRows.length)
    : 100;

  const globalPillars = filteredRows.length
    ? filteredRows.reduce(
        (acc, r) => {
          const p = pillarScores(r);
          return { fin: acc.fin + p.fin, wa: acc.wa + p.wa, liq: acc.liq + p.liq, perf: acc.perf + p.perf, sec: acc.sec + p.sec };
        },
        { fin: 0, wa: 0, liq: 0, perf: 0, sec: 0 },
      )
    : { fin: 100, wa: 100, liq: 100, perf: 100, sec: 100 };
  const N = Math.max(1, filteredRows.length);
  const gp = { fin: globalPillars.fin / N, wa: globalPillars.wa / N, liq: globalPillars.liq / N, perf: globalPillars.perf / N, sec: globalPillars.sec / N };

  // Anomaly detection: pico de logs de erro nos últimos 60min vs baseline 24h
  const anomaly = useMemo(() => {
    const now = Date.now();
    const last60 = logs.filter((l) => {
      const t = new Date(l.created_at).getTime();
      return now - t < 60 * 60 * 1000 && /error|erro|_failed|retry_exhausted/i.test(l.action);
    }).length;
    const last24h = logs.filter((l) => {
      const t = new Date(l.created_at).getTime();
      return now - t < 24 * 60 * 60 * 1000 && /error|erro|_failed|retry_exhausted/i.test(l.action);
    }).length;
    const baseline = Math.max(1, last24h / 24);
    const ratio = last60 / baseline;
    return { last60, baseline: Math.round(baseline * 10) / 10, ratio: Math.round(ratio * 10) / 10, alert: ratio >= 3 && last60 >= 5 };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((l) => {
      if (orgFilter !== "all" && l.organization_id !== orgFilter) return false;
      if (q && !l.action.toLowerCase().includes(q) && !JSON.stringify(l.details ?? {}).toLowerCase().includes(q)) return false;
      if (logSev === "critical" && !/error|erro|_failed|retry_exhausted/i.test(l.action)) return false;
      if (logSev === "warning" && !/warn|retry|slow|pause/i.test(l.action)) return false;
      return true;
    });
  }, [logs, orgFilter, logSearch, logSev]);

  const exportLogs = () => {
    const header = "id,action,created_at,organization_id,details\n";
    const body = filteredLogs
      .map((l) => [l.id, l.action, l.created_at, l.organization_id ?? "", JSON.stringify(l.details ?? {}).replace(/"/g, '""')]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `system-logs-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleNoc = async () => {
    if (!noc) {
      try { await containerRef.current?.requestFullscreen(); } catch {}
      setNoc(true);
    } else {
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
      setNoc(false);
    }
  };
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setNoc(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const headerBlock = (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-7 w-7 text-primary" /> Saúde do Sistema
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Observabilidade em tempo real — score ponderado, alertas, timeline e anomalias.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Filtrar organização" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas organizações</SelectItem>
            {rows.map((r) => <SelectItem key={r.organization_id} value={r.organization_id}>{r.organization_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant={autoRefresh ? "default" : "secondary"} className="gap-1">
          <RefreshCw className={`h-3 w-3 ${autoRefresh ? "animate-spin" : ""}`} />
          {autoRefresh ? "Auto 15s" : "Pausado"}
        </Badge>
        <Button size="sm" variant="outline" onClick={() => setAutoRefresh((v) => !v)}>{autoRefresh ? "Pausar" : "Retomar"}</Button>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Atualizar</Button>
        <Button size="sm" variant={noc ? "default" : "outline"} onClick={toggleNoc} className="gap-1">
          {noc ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} NOC
        </Button>
      </div>
    </div>
  );

  const body = (
    <div ref={containerRef} className={`space-y-6 ${noc ? "bg-background p-6 overflow-auto h-screen" : ""}`}>
      {headerBlock}

      {/* Score Global */}
      <Card className={`border ${scoreBg(globalScore)}`}>
        <CardContent className="p-6 grid lg:grid-cols-2 gap-6 items-center">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Score Geral Ponderado</div>
            <div className={`text-6xl font-bold mt-1 ${scoreColor(globalScore)}`}>
              {globalScore}<span className="text-2xl text-muted-foreground">/100</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {filteredRows.length} org(s) • Pesos: Financeiro 40% • WhatsApp 25% • PIX 20% • Performance 10% • Segurança 5%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Atualizado {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR") : "—"}
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              {globalScore >= 85 && <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" /> Saudável</Badge>}
              {globalScore < 85 && globalScore >= 60 && <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 gap-1"><AlertTriangle className="h-3 w-3" /> Atenção</Badge>}
              {globalScore < 60 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Crítico</Badge>}
              {anomaly.alert && <Badge variant="destructive" className="gap-1"><Bell className="h-3 w-3" /> Anomalia: {anomaly.last60} erros/h (×{anomaly.ratio})</Badge>}
            </div>
          </div>
          <div className="space-y-3">
            <PillarBar label="Financeiro (40%)" value={gp.fin} />
            <PillarBar label="WhatsApp (25%)" value={gp.wa} />
            <PillarBar label="Liquidação PIX (20%)" value={gp.liq} />
            <PillarBar label="Performance (10%)" value={gp.perf} />
            <PillarBar label="Segurança (5%)" value={gp.sec} />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Visão Consolidada</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <KpiCard title="A Receber" value={fmt(totals.amount_open)} icon={DollarSign} hint={`${totals.invoices_open} faturas abertas`} />
          <KpiCard title="Em Atraso" value={fmt(totals.amount_overdue)} icon={AlertTriangle} hint={`${totals.invoices_overdue} vencidas`} tone={totals.invoices_overdue > 0 ? "warn" : "default"} />
          <KpiCard title="Clientes Ativos" value={totals.clients_active} icon={Users} />
          <KpiCard title="Créditos Disponíveis" value={fmt(totals.credit_balance_available)} icon={TrendingUp} tone="success" />
          <KpiCard title="WhatsApp Conectados" value={totals.wa_instances_connected} icon={totals.wa_instances_connected > 0 ? Wifi : WifiOff} tone={totals.wa_instances_connected > 0 ? "success" : "danger"} />
          <KpiCard title="Fila WhatsApp" value={totals.wa_queue_pending} icon={MessageSquare} hint="pendentes" tone={totals.wa_queue_pending > 100 ? "warn" : "default"} />
          <KpiCard title="Falhas WA 24h" value={totals.wa_failed_24h} icon={AlertTriangle} tone={totals.wa_failed_24h > 20 ? "danger" : totals.wa_failed_24h > 0 ? "warn" : "success"} />
          <KpiCard title="Liquidações OK 30d" value={totals.settlement_ok_30d} icon={Zap} hint={`${totals.settlement_errors_total} erros totais`} tone="success" />
        </div>
      </div>

      <Tabs defaultValue="alerts" className="w-full">
        <TabsList>
          <TabsTrigger value="alerts" className="gap-1"><Bell className="h-3.5 w-3.5" /> Alertas {alerts.length > 0 && <Badge variant="secondary" className="ml-1 h-4 text-[10px]">{alerts.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="orgs" className="gap-1"><Server className="h-3.5 w-3.5" /> Por Organização</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1"><Clock className="h-3.5 w-3.5" /> Timeline</TabsTrigger>
          <TabsTrigger value="perf" className="gap-1"><Activity className="h-3.5 w-3.5" /> Performance</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1"><Search className="h-3.5 w-3.5" /> Logs</TabsTrigger>
        </TabsList>

        {/* Alertas */}
        <TabsContent value="alerts" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Alertas Operacionais</CardTitle>
              <Select value={logSev} onValueChange={(v: any) => setLogSev(v)}>
                <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas severidades</SelectItem>
                  <SelectItem value="critical">Críticos</SelectItem>
                  <SelectItem value="warning">Atenção</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              {alerts.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground"><ShieldCheck className="h-8 w-8 mx-auto mb-2 text-emerald-500" />Nenhum alerta. Sistema saudável.</div>}
              <div className="divide-y divide-border/50 max-h-[500px] overflow-auto">
                {alerts.map((a) => (
                  <div key={a.id} className="p-3 flex items-start gap-3 hover:bg-accent/30">
                    <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${a.severity === "critical" ? "bg-destructive animate-pulse" : a.severity === "warning" ? "bg-yellow-500" : "bg-info"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{a.title}</span>
                        <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="text-[10px] uppercase">{a.severity}</Badge>
                        {a.org_name && <span className="text-xs text-muted-foreground">• {a.org_name}</span>}
                        {!a.org_name && a.org_id && <span className="text-xs text-muted-foreground">• {orgNameMap.get(a.org_id) ?? "—"}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 break-all">{a.detail}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{tsFmt(a.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Por org */}
        <TabsContent value="orgs" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Saúde por Organização</CardTitle>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Pior score</SelectItem>
                  <SelectItem value="overdue">Maior atraso (R$)</SelectItem>
                  <SelectItem value="errors">Mais erros</SelectItem>
                  <SelectItem value="delinquency">Maior inadimplência</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>}
              {!isLoading && sortedRows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma organização.</div>}
              <div className="divide-y divide-border/50">
                {sortedRows.map((r) => {
                  const s = weightedScore(r);
                  const p = pillarScores(r);
                  const ratio = r.invoices_open > 0 ? r.invoices_overdue / r.invoices_open : 0;
                  return (
                    <div key={r.organization_id} className="p-4 hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-semibold truncate">{r.organization_name}</span>
                        <Badge variant="outline" className={`${scoreColor(s)} border-current/30`}>{s}/100</Badge>
                        {r.wa_instances_connected === 0 && <Badge variant="destructive" className="text-[10px] gap-1"><WifiOff className="h-3 w-3" /> WA off</Badge>}
                        {ratio > 0.5 && <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px]">{Math.round(ratio * 100)}% atraso</Badge>}
                        {r.settlement_errors_total > 5 && <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px]">{r.settlement_errors_total} erros liq.</Badge>}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
                        <span>👥 {r.clients_active} clientes</span>
                        <span>📄 {r.invoices_open} abertas</span>
                        <span className={r.invoices_overdue > 0 ? "text-yellow-500" : ""}>⚠️ {r.invoices_overdue} atraso</span>
                        <span>✅ {r.invoices_paid_30d} pagas 30d</span>
                        <span>💰 {fmt(r.amount_open)} a receber</span>
                        <span className={r.amount_overdue > 0 ? "text-yellow-500" : ""}>🔴 {fmt(r.amount_overdue)} atraso</span>
                        <span>💬 {r.wa_messages_24h} msgs 24h</span>
                        <span className={r.wa_queue_pending > 100 ? "text-yellow-500" : ""}>📤 {r.wa_queue_pending} fila</span>
                      </div>
                      <div className="grid md:grid-cols-5 gap-2">
                        <PillarBar label="Fin" value={p.fin} />
                        <PillarBar label="WA" value={p.wa} />
                        <PillarBar label="PIX" value={p.liq} />
                        <PillarBar label="Perf" value={p.perf} />
                        <PillarBar label="Sec" value={p.sec} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-base">Timeline Operacional</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50 max-h-[600px] overflow-auto">
                {logs.filter((l) => orgFilter === "all" || l.organization_id === orgFilter).slice(0, 80).map((l) => {
                  const critical = /error|erro|_failed|retry_exhausted/i.test(l.action);
                  const warn = /warn|retry|slow|pause/i.test(l.action);
                  return (
                    <div key={l.id} className="p-3 flex items-start gap-3 text-sm">
                      <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${critical ? "bg-destructive" : warn ? "bg-yellow-500" : "bg-emerald-500"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold">{l.action}</span>
                          {l.organization_id && <span className="text-[10px] text-muted-foreground">{orgNameMap.get(l.organization_id) ?? l.organization_id.slice(0, 8)}</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{tsFmt(l.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                {logs.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Sem eventos recentes.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="perf" className="mt-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard title="Erros últimas 60min" value={anomaly.last60} icon={AlertTriangle} tone={anomaly.alert ? "danger" : anomaly.last60 > 0 ? "warn" : "success"} hint={`baseline: ${anomaly.baseline}/h`} />
            <KpiCard title="Anomalia (×baseline)" value={`×${anomaly.ratio}`} icon={TrendingUp} tone={anomaly.alert ? "danger" : "default"} />
            <KpiCard title="Throughput msgs 24h" value={totals.wa_messages_24h} icon={MessageSquare} />
            <KpiCard title="Taxa erro WA" value={`${totals.wa_messages_24h > 0 ? Math.round((totals.wa_failed_24h / totals.wa_messages_24h) * 100) : 0}%`} icon={Activity} tone={totals.wa_messages_24h > 0 && totals.wa_failed_24h / totals.wa_messages_24h > 0.1 ? "warn" : "default"} />
            <KpiCard title="Taxa erro PIX" value={`${(totals.settlement_ok_30d + totals.settlement_errors_total) > 0 ? Math.round((totals.settlement_errors_total / (totals.settlement_ok_30d + totals.settlement_errors_total)) * 100) : 0}%`} icon={Zap} />
            <KpiCard title="Carga total fila" value={totals.wa_queue_pending} icon={MessageSquare} tone={totals.wa_queue_pending > 500 ? "danger" : totals.wa_queue_pending > 100 ? "warn" : "success"} />
            <KpiCard title="Logs/24h" value={logs.length} icon={Server} />
            <KpiCard title="Score médio" value={globalScore} icon={Activity} tone={globalScore >= 85 ? "success" : globalScore >= 60 ? "warn" : "danger"} />
          </div>
          <Card className="border-border/50 mt-4">
            <CardHeader className="pb-3"><CardTitle className="text-base">Pilares Globais</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <PillarBar label="Financeiro" value={gp.fin} />
              <PillarBar label="WhatsApp" value={gp.wa} />
              <PillarBar label="Liquidação PIX" value={gp.liq} />
              <PillarBar label="Performance" value={gp.perf} />
              <PillarBar label="Segurança" value={gp.sec} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs */}
        <TabsContent value="logs" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Logs Inteligentes</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Buscar..." className="h-8 pl-7 w-[200px]" />
                </div>
                <Select value={logSev} onValueChange={(v: any) => setLogSev(v)}>
                  <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="critical">Críticos</SelectItem>
                    <SelectItem value="warning">Atenção</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={exportLogs} className="gap-1"><Download className="h-3.5 w-3.5" />CSV</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50 max-h-[600px] overflow-auto">
                {filteredLogs.slice(0, 100).map((l) => (
                  <div key={l.id} className="p-3 text-sm hover:bg-accent/30">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold">{l.action}</span>
                      {l.organization_id && <Badge variant="outline" className="text-[10px]">{orgNameMap.get(l.organization_id) ?? l.organization_id.slice(0, 8)}</Badge>}
                      <span className="text-[10px] text-muted-foreground ml-auto">{tsFmt(l.created_at)}</span>
                    </div>
                    {l.details && Object.keys(l.details).length > 0 && (
                      <pre className="text-[10px] text-muted-foreground mt-1 overflow-hidden truncate max-w-full">{JSON.stringify(l.details).slice(0, 200)}</pre>
                    )}
                  </div>
                ))}
                {filteredLogs.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum log encontrado.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  if (noc) return body;
  return <AppLayout>{body}</AppLayout>;
}
