import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { Activity, CheckCircle2, AlertTriangle, Clock, Zap } from "lucide-react";

export default function PixAnalytics() {
  const { organizationId } = useOrganization();

  const { data: stats } = useQuery({
    queryKey: ["pix-analytics-events", organizationId],
    enabled: !!organizationId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      const { data } = await supabase
        .from("auto_settlement_events")
        .select("status, score, decision, ocr_provider, ocr_elapsed_ms, error_message, created_at")
        .eq("organization_id", organizationId!)
        .gte("created_at", since);
      const rows = data || [];
      const total = rows.length;
      const auto = rows.filter((r: any) => r.status === "conciliado").length;
      const manual = rows.filter((r: any) => r.status === "pendente_revisao").length;
      const errored = rows.filter((r: any) => r.status === "erro").length;
      const avgScore = rows.filter((r: any) => r.score != null).reduce((s: number, r: any) => s + r.score, 0) / (rows.filter((r: any) => r.score != null).length || 1);
      const avgMs = rows.filter((r: any) => r.ocr_elapsed_ms).reduce((s: number, r: any) => s + r.ocr_elapsed_ms, 0) / (rows.filter((r: any) => r.ocr_elapsed_ms).length || 1);
      const failures: Record<string, number> = {};
      for (const r of rows) {
        if (r.status === "pendente_revisao" || r.status === "erro") {
          const key = (r.error_message || "outros").slice(0, 60);
          failures[key] = (failures[key] || 0) + 1;
        }
      }
      const topFailures = Object.entries(failures).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const byDecision: Record<string, number> = {};
      for (const r of rows) if (r.decision) byDecision[r.decision] = (byDecision[r.decision] || 0) + 1;
      const byProvider: Record<string, number> = {};
      for (const r of rows) if (r.ocr_provider) byProvider[r.ocr_provider] = (byProvider[r.ocr_provider] || 0) + 1;
      return { total, auto, manual, errored, avgScore, avgMs, topFailures, byDecision, byProvider };
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["pix-analytics-providers"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from("ocr_provider_stats").select("*").order("provider");
      return data || [];
    },
  });

  const autoRate = stats?.total ? Math.round((stats.auto / stats.total) * 100) : 0;
  const manualRate = stats?.total ? Math.round((stats.manual / stats.total) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> Analytics PIX</h1>
        <p className="text-sm text-muted-foreground">Métricas de processamento automático de comprovantes (últimos 30 dias)</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Taxa de Automação" value={`${autoRate}%`} icon={CheckCircle2} tone="success" hint={`${stats?.auto || 0} de ${stats?.total || 0}`} />
        <KpiCard label="Revisão Manual" value={`${manualRate}%`} icon={AlertTriangle} tone="warning" hint={`${stats?.manual || 0} eventos`} />
        <KpiCard label="Score Médio" value={`${Math.round(stats?.avgScore || 0)}`} icon={Zap} tone="info" hint="0–100" />
        <KpiCard label="Tempo Médio OCR" value={`${Math.round((stats?.avgMs || 0) / 1000 * 10) / 10}s`} icon={Clock} tone="neutral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Decisão do Motor de Score</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats?.byDecision || {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-sm">{k}</span>
                <Badge variant={k.startsWith("auto") ? "default" : "secondary"}>{v}</Badge>
              </div>
            ))}
            {!Object.keys(stats?.byDecision || {}).length && <p className="text-xs text-muted-foreground">Sem dados ainda.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Provedores OCR</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(providers || []).map((p: any) => {
              const disabled = p.disabled_until && new Date(p.disabled_until).getTime() > Date.now();
              return (
                <div key={p.provider} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{p.provider}</p>
                    <p className="text-xs text-muted-foreground">✓ {p.success_count} · ✗ {p.fail_count} · {p.avg_elapsed_ms ? `${Math.round(p.avg_elapsed_ms)}ms` : "—"}</p>
                  </div>
                  <Badge variant={disabled ? "destructive" : "default"}>{disabled ? "Desabilitado" : "Ativo"}</Badge>
                </div>
              );
            })}
            {!providers?.length && <p className="text-xs text-muted-foreground">Nenhuma estatística ainda.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Principais Causas de Falha / Revisão</CardTitle></CardHeader>
        <CardContent>
          {stats?.topFailures?.length ? (
            <ul className="space-y-1">
              {stats.topFailures.map(([reason, count]) => (
                <li key={reason} className="flex items-center justify-between text-sm border-b pb-1">
                  <span className="truncate mr-3">{reason}</span>
                  <Badge variant="outline">{count}</Badge>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">Sem falhas registradas.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
