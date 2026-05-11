import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, AlertTriangle, RefreshCw, PlayCircle, Wrench, Undo2 } from "lucide-react";

type Integrity = {
  misaligned: any[];
  duplicates: any[];
  gaps: any[];
  invalid_dates: any[];
  summary: { misaligned_count: number; duplicate_groups: number; clients_with_gaps: number; invalid_count: number };
};

export default function RecurrenceAudit() {
  const qc = useQueryClient();
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  const { data: integrity, isLoading, refetch } = useQuery({
    queryKey: ["recurrence-integrity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("audit_recurrence_integrity", { p_organization_id: null as any });
      if (error) throw error;
      return data as unknown as Integrity;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["recurrence-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurrence_audit_logs" as any)
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const dryRun = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("repair_client_due_dates", { p_organization_id: null as any, p_dry_run: true });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => { setDryRunResult(d); toast({ title: "Simulação concluída" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("repair_client_due_dates", { p_organization_id: null as any, p_dry_run: false });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast({ title: "Correções aplicadas", description: `${d.updated} fatura(s) ajustada(s).` });
      setDryRunResult(null);
      qc.invalidateQueries({ queryKey: ["recurrence-integrity"] });
      qc.invalidateQueries({ queryKey: ["recurrence-audit-logs"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const rollback = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("rollback_due_date_change", { p_audit_log_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast({ title: "Revertido" }); qc.invalidateQueries({ queryKey: ["recurrence-audit-logs"] }); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const s = integrity?.summary;
  const healthy = s && s.misaligned_count === 0 && s.duplicate_groups === 0 && s.invalid_count === 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Auditoria de Recorrência
          </h1>
          <p className="text-sm text-muted-foreground">Integridade do calendário de mensalidades</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Recarregar</Button>
          <Button variant="outline" size="sm" onClick={() => dryRun.mutate()} disabled={dryRun.isPending}>
            {dryRun.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Simular correções
          </Button>
          <Button size="sm" onClick={() => { if (window.confirm("Aplicar correções automáticas em todas as orgs?")) apply.mutate(); }} disabled={apply.isPending}>
            {apply.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
            Aplicar correções
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Desalinhadas" value={s?.misaligned_count ?? 0} ok={s?.misaligned_count === 0} />
            <StatCard label="Duplicidades" value={s?.duplicate_groups ?? 0} ok={s?.duplicate_groups === 0} />
            <StatCard label="Clientes com gaps" value={s?.clients_with_gaps ?? 0} ok={s?.clients_with_gaps === 0} muted />
            <StatCard label="Datas inválidas" value={s?.invalid_count ?? 0} ok={s?.invalid_count === 0} />
          </div>

          {healthy && (
            <Card className="border-green-500/40 bg-green-500/5">
              <CardContent className="p-4 flex items-center gap-3 text-green-400">
                <ShieldCheck className="h-5 w-5" /> Integridade do calendário: 100% OK
              </CardContent>
            </Card>
          )}

          {dryRunResult && (
            <Card className="border-primary/40">
              <CardHeader><CardTitle className="text-base">Resultado da simulação</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>Detectadas: <b>{dryRunResult.total_detected}</b></div>
                <div>Aplicaria: <b>{dryRunResult.updated}</b></div>
                <div>Colisões puladas: <b>{dryRunResult.skipped_collision}</b></div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="misaligned">
            <TabsList>
              <TabsTrigger value="misaligned">Desalinhadas ({s?.misaligned_count ?? 0})</TabsTrigger>
              <TabsTrigger value="duplicates">Duplicadas ({s?.duplicate_groups ?? 0})</TabsTrigger>
              <TabsTrigger value="gaps">Gaps ({s?.clients_with_gaps ?? 0})</TabsTrigger>
              <TabsTrigger value="logs">Histórico ({logs?.length ?? 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="misaligned">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Fatura</TableHead><TableHead>Cliente</TableHead><TableHead>Vencimento atual</TableHead><TableHead>Dia original</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(integrity?.misaligned ?? []).map((r) => (
                      <TableRow key={r.invoice_id}>
                        <TableCell className="font-mono text-xs">{r.invoice_id?.slice(0, 8)}</TableCell>
                        <TableCell className="font-mono text-xs">{r.client_id?.slice(0, 8)}</TableCell>
                        <TableCell>{r.due_date}</TableCell>
                        <TableCell><Badge variant="secondary">dia {r.original_due_day}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {!integrity?.misaligned?.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhuma divergência</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="duplicates">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Competência</TableHead><TableHead>Qtd</TableHead><TableHead>IDs</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(integrity?.duplicates ?? []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.client_id?.slice(0, 8)}</TableCell>
                        <TableCell><Badge variant="destructive">{r.competencia}</Badge></TableCell>
                        <TableCell>{r.count}</TableCell>
                        <TableCell className="font-mono text-[10px]">{(r.invoice_ids ?? []).map((x: string) => x.slice(0,8)).join(", ")}</TableCell>
                      </TableRow>
                    ))}
                    {!integrity?.duplicates?.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhuma duplicidade</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="gaps">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Meses faltando</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(integrity?.gaps ?? []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.client_id?.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">{(r.missing_months ?? []).join(", ")}</TableCell>
                      </TableRow>
                    ))}
                    {!integrity?.gaps?.length && <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">Sem lacunas</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="logs">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Motivo</TableHead><TableHead>Origem</TableHead><TableHead>De → Para</TableHead><TableHead>Dia orig.</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(logs ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{new Date(l.changed_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell><Badge variant="outline">{l.reason}</Badge></TableCell>
                        <TableCell><Badge variant={l.source === "manual" ? "default" : "secondary"}>{l.source}</Badge></TableCell>
                        <TableCell className="text-xs">{l.old_due_date ?? "—"} → {l.new_due_date ?? "—"}</TableCell>
                        <TableCell className="text-xs">{l.original_due_day ?? "—"}</TableCell>
                        <TableCell>
                          {l.old_due_date && (
                            <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Reverter esta alteração?")) rollback.mutate(l.id); }}>
                              <Undo2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!logs?.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sem registros</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, ok, muted }: { label: string; value: number; ok: boolean; muted?: boolean }) {
  const color = muted ? "text-muted-foreground" : ok ? "text-green-400" : "text-destructive";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          {ok ? <ShieldCheck className="h-4 w-4 text-green-400" /> : <AlertTriangle className={`h-4 w-4 ${muted ? "text-muted-foreground" : "text-destructive"}`} />}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`text-3xl font-bold mt-2 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
