import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, PhoneOff, PhoneCall, RefreshCw, ShieldAlert } from "lucide-react";
import { formatPhone } from "@/lib/masks";

// ---- Phone helpers (read-only normalization) ----
const digits = (v?: string | null) => (v || "").replace(/\D/g, "");

function normalizeBR(v?: string | null) {
  let d = digits(v);
  if (!d) return "";
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  // remove leading 0
  if (d.length === 12 && d.startsWith("0")) d = d.slice(1);
  return d;
}

/** Returns set of equivalent variants (with/without 9th digit) for comparison */
function variants(v?: string | null): Set<string> {
  const out = new Set<string>();
  const n = normalizeBR(v);
  if (!n) return out;
  out.add(n);
  if (n.length === 11 && n[2] === "9") out.add(n.slice(0, 2) + n.slice(3)); // drop 9
  if (n.length === 10) out.add(n.slice(0, 2) + "9" + n.slice(2));            // add 9
  return out;
}

function sameNumber(a?: string | null, b?: string | null) {
  const va = variants(a), vb = variants(b);
  for (const x of va) if (vb.has(x)) return true;
  return false;
}

function isValidBR(v?: string | null) {
  const n = normalizeBR(v);
  return n.length === 10 || n.length === 11;
}

type Status = "ok" | "sem_telefone" | "invalido" | "divergente" | "atualizar";

const statusMeta: Record<Status, { label: string; variant: any; color: string }> = {
  ok: { label: "OK", variant: "default", color: "text-green-500" },
  sem_telefone: { label: "Sem telefone", variant: "secondary", color: "text-muted-foreground" },
  invalido: { label: "Inválido", variant: "destructive", color: "text-red-500" },
  divergente: { label: "Divergente", variant: "destructive", color: "text-orange-500" },
  atualizar: { label: "Possível atualização", variant: "outline", color: "text-yellow-500" },
};

export default function PhoneAudit() {
  const { organizationId } = useOrganization();
  const [filter, setFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");

  const { data: clients = [], refetch, isFetching } = useQuery({
    queryKey: ["phone-audit-clients", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, phone")
        .eq("organization_id", organizationId!)
        .order("name");
      return data || [];
    },
  });

  // Auto-settlement events from last 90 days for match-source dashboard + divergence detection
  const { data: events = [] } = useQuery({
    queryKey: ["phone-audit-events", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("auto_settlement_events")
        .select("client_id, phone, status, ocr_payload, created_at")
        .eq("organization_id", organizationId!)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      return data || [];
    },
  });

  // Map: client_id -> [{phone, count}]
  const whatsappByClient = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const e of events as any[]) {
      if (!e.client_id || !e.phone) continue;
      const n = normalizeBR(e.phone);
      if (!n) continue;
      if (!m.has(e.client_id)) m.set(e.client_id, new Map());
      const inner = m.get(e.client_id)!;
      inner.set(n, (inner.get(n) || 0) + 1);
    }
    return m;
  }, [events]);

  const rows = useMemo(() => {
    return clients.map((c: any) => {
      const phoneRaw = c.phone;
      const wm = whatsappByClient.get(c.id);
      // top whatsapp used
      let topWa: string | null = null;
      let topCount = 0;
      if (wm) {
        for (const [k, v] of wm.entries()) if (v > topCount) { topCount = v; topWa = k; }
      }

      let status: Status;
      if (!phoneRaw || !digits(phoneRaw)) status = "sem_telefone";
      else if (!isValidBR(phoneRaw)) status = "invalido";
      else if (topWa && !sameNumber(phoneRaw, topWa)) {
        status = topCount >= 2 ? "atualizar" : "divergente";
      } else status = "ok";

      return {
        id: c.id,
        name: c.name,
        phone: phoneRaw,
        whatsapp: topWa,
        whatsapp_count: topCount,
        status,
      };
    });
  }, [clients, whatsappByClient]);

  const metrics = useMemo(() => {
    const total = rows.length || 1;
    const count = (s: Status) => rows.filter((r) => r.status === s).length;
    return {
      total: rows.length,
      ok: count("ok"),
      sem_telefone: count("sem_telefone"),
      invalido: count("invalido"),
      divergente: count("divergente"),
      atualizar: count("atualizar"),
      pct: (s: Status) => ((count(s) / total) * 100).toFixed(1),
    };
  }, [rows]);

  // Match-source dashboard (7/30/90d)
  const matchStats = useMemo(() => {
    const buckets = { 7: { total: 0, src: {} as Record<string, number> }, 30: { total: 0, src: {} as Record<string, number> }, 90: { total: 0, src: {} as Record<string, number> } };
    const now = Date.now();
    for (const e of events as any[]) {
      if (e.status !== "conciliado") continue;
      const age = (now - new Date(e.created_at).getTime()) / (24 * 60 * 60 * 1000);
      const src = (e.ocr_payload?._match_source || "desconhecido") as string;
      for (const d of [7, 30, 90] as const) {
        if (age <= d) {
          buckets[d].total++;
          buckets[d].src[src] = (buckets[d].src[src] || 0) + 1;
        }
      }
    }
    return buckets;
  }, [events]);

  const alerts = useMemo(() => {
    const out: string[] = [];
    const b30 = matchStats[30];
    if (b30.total > 0) {
      const phonePct = ((b30.src.phone || 0) + (b30.src.lid_map || 0)) / b30.total * 100;
      const fuzzyPct = (b30.src.fuzzy_name || 0) / b30.total * 100;
      if (phonePct < 50) out.push(`Phone+LID Match em ${phonePct.toFixed(1)}% (<50%) — saneamento de telefones recomendado.`);
      if (fuzzyPct > 20) out.push(`Fuzzy Match em ${fuzzyPct.toFixed(1)}% (>20%) — alta dependência de nome.`);
    }
    if (metrics.divergente + metrics.atualizar > metrics.total * 0.15)
      out.push(`Mais de 15% dos clientes apresentam divergência entre telefone cadastrado e WhatsApp.`);
    return out;
  }, [matchStats, metrics]);

  const filteredRows = rows.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const SrcBar = ({ b }: { b: { total: number; src: Record<string, number> } }) => {
    if (b.total === 0) return <p className="text-xs text-muted-foreground">Sem conciliações no período</p>;
    const row = (k: string, label: string) => {
      const v = b.src[k] || 0;
      const pct = (v / b.total) * 100;
      return (
        <div key={k} className="space-y-1">
          <div className="flex justify-between text-xs"><span>{label}</span><span className="font-mono">{pct.toFixed(1)}% ({v})</span></div>
          <div className="h-2 bg-muted rounded overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
        </div>
      );
    };
    return (
      <div className="space-y-2">
        {row("phone", "Phone Match")}
        {row("lid_map", "LID Match")}
        {row("document", "CPF Match")}
        {row("fuzzy_name", "Fuzzy Match")}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PhoneCall className="h-6 w-6 text-primary" /> Auditoria de Telefones
            </h1>
            <p className="text-sm text-muted-foreground">
              Análise apenas de leitura — identifica clientes com telefone ausente, inválido ou divergente do WhatsApp utilizado.
              Nenhum dado é alterado automaticamente.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {([
            ["Total", metrics.total, "100%", "text-foreground"],
            ["OK", metrics.ok, `${metrics.pct("ok")}%`, "text-green-500"],
            ["Sem telefone", metrics.sem_telefone, `${metrics.pct("sem_telefone")}%`, "text-muted-foreground"],
            ["Inválidos", metrics.invalido, `${metrics.pct("invalido")}%`, "text-red-500"],
            ["Divergentes", metrics.divergente, `${metrics.pct("divergente")}%`, "text-orange-500"],
            ["Atualizar", metrics.atualizar, `${metrics.pct("atualizar")}%`, "text-yellow-500"],
          ] as const).map(([label, v, pct, color]) => (
            <Card key={label}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{v}</p>
                <p className="text-[10px] text-muted-foreground">{pct}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-yellow-500">
                <ShieldAlert className="h-4 w-4" /> Alertas operacionais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {alerts.map((a, i) => <p key={i} className="text-sm">• {a}</p>)}
            </CardContent>
          </Card>
        )}

        {/* Match source dashboard */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dashboard de Identificação (origem do match)</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="30">
              <TabsList>
                <TabsTrigger value="7">7 dias</TabsTrigger>
                <TabsTrigger value="30">30 dias</TabsTrigger>
                <TabsTrigger value="90">90 dias</TabsTrigger>
              </TabsList>
              {([7, 30, 90] as const).map((d) => (
                <TabsContent key={d} value={String(d)} className="pt-3">
                  <p className="text-xs text-muted-foreground mb-2">Total de conciliações automáticas: <strong>{matchStats[d].total}</strong></p>
                  <SrcBar b={matchStats[d]} />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relatório de Qualidade</CardTitle>
            <div className="flex flex-wrap gap-2 pt-2">
              {(["all", "ok", "sem_telefone", "invalido", "divergente", "atualizar"] as const).map((s) => (
                <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
                  {s === "all" ? "Todos" : statusMeta[s].label}
                </Button>
              ))}
              <Input
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs h-8"
              />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone cadastrado</TableHead>
                <TableHead>WhatsApp detectado</TableHead>
                <TableHead className="text-center">Evidências</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recomendação</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente</TableCell></TableRow>
                ) : filteredRows.slice(0, 500).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs font-mono">{r.phone ? formatPhone(r.phone) : <span className="italic text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs font-mono">{r.whatsapp ? formatPhone(r.whatsapp) : <span className="italic text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-center text-xs">{r.whatsapp_count || "—"}</TableCell>
                    <TableCell><Badge variant={statusMeta[r.status].variant}>{statusMeta[r.status].label}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.status === "atualizar" && "Recomenda-se atualizar o cadastro para o WhatsApp mais utilizado."}
                      {r.status === "divergente" && "Confirmar com o cliente qual número é o oficial."}
                      {r.status === "sem_telefone" && "Solicitar telefone para habilitar identificação automática."}
                      {r.status === "invalido" && "Corrigir formato (DDD + número)."}
                      {r.status === "ok" && <span className="text-green-500 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Apto</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredRows.length > 500 && (
              <p className="text-xs text-muted-foreground mt-2">Exibindo primeiros 500 de {filteredRows.length}.</p>
            )}
          </CardContent>
        </Card>

        {/* Final summary */}
        <Card>
          <CardHeader><CardTitle className="text-base">Estimativa de Saneamento</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>• Clientes aptos para <strong>Phone Match</strong> hoje: <strong>{metrics.ok}</strong> ({metrics.pct("ok")}%)</p>
            <p>• Clientes que <strong>dependem de Fuzzy Match</strong> (sem/inválido/divergente): <strong>{metrics.sem_telefone + metrics.invalido + metrics.divergente + metrics.atualizar}</strong></p>
            <p>• Principais causas: telefone ausente ({metrics.sem_telefone}), divergência WhatsApp ({metrics.divergente + metrics.atualizar}), formato inválido ({metrics.invalido}).</p>
            <p className="pt-2 text-muted-foreground">
              Atualizando os <strong>{metrics.atualizar}</strong> clientes marcados como "Possível atualização" e preenchendo os{" "}
              <strong>{metrics.sem_telefone}</strong> sem telefone, a taxa potencial de identificação por Phone Match sobe para{" "}
              <strong>
                {(((metrics.ok + metrics.atualizar + metrics.sem_telefone) / Math.max(1, metrics.total)) * 100).toFixed(1)}%
              </strong>.
            </p>
            <p className="text-xs text-muted-foreground pt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Nenhuma alteração é aplicada automaticamente — todas as ações exigem edição manual no cadastro do cliente.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
