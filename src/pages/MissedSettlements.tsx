import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Download, Eye, ExternalLink, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const FAILED_STATUSES = ["pendente_revisao", "erro", "recebido"];
const ALL_VISIBLE = [...FAILED_STATUSES, "ignorado"];

const statusLabel: Record<string, { label: string; variant: any }> = {
  pendente_revisao: { label: "Pendente revisão", variant: "destructive" },
  erro:             { label: "Erro",              variant: "destructive" },
  recebido:         { label: "Não processado",    variant: "secondary"   },
  ignorado:         { label: "Ignorado",          variant: "outline"     },
  conciliado:       { label: "Conciliado",        variant: "default"     },
};

type ReasonCategory =
  | "sem_cliente"
  | "sugestao_terceiro"
  | "telefone_invalido"
  | "valor_nao_detectado"
  | "sem_fatura_compativel"
  | "ocr_falhou"
  | "template_placeholder"
  | "duplicado"
  | "erro_envio"
  | "nao_processado"
  | "outro";

const reasonMeta: Record<ReasonCategory, { label: string; variant: any; hint: string }> = {
  sem_cliente:           { label: "Cliente não vinculado",      variant: "destructive", hint: "Telefone do remetente não bate com nenhum cliente cadastrado." },
  sugestao_terceiro:     { label: "Sugestão (PIX terceiro)",    variant: "secondary",   hint: "Sistema sugeriu cliente pelo nome do pagador — confirme manualmente, pode ser PIX de terceiro." },
  telefone_invalido:     { label: "Telefone inválido",          variant: "destructive", hint: "Número malformado, sem DDI/DDD ou LID não resolvido." },
  valor_nao_detectado:   { label: "Valor não detectado",        variant: "destructive", hint: "OCR não conseguiu extrair o valor do comprovante." },
  sem_fatura_compativel: { label: "Sem fatura compatível",      variant: "destructive", hint: "Nenhuma fatura aberta bate com o valor recebido." },
  ocr_falhou:            { label: "Falha de OCR",               variant: "destructive", hint: "Imagem ilegível, sem texto ou OCR retornou vazio." },
  template_placeholder:  { label: "Template/placeholder",       variant: "destructive", hint: "'R$ R$' duplicado ou '{variavel}' não substituída." },
  duplicado:             { label: "Duplicado / já processado",  variant: "secondary",   hint: "Comprovante duplicado — ignorado por idempotência." },
  erro_envio:            { label: "Erro de envio WhatsApp",     variant: "destructive", hint: "Falha ao enviar confirmação (instância offline, API, timeout)." },
  nao_processado:        { label: "Não processado",             variant: "secondary",   hint: "Evento recebido mas o robô ainda não rodou nele." },
  outro:                 { label: "Outro / inspecionar",        variant: "outline",     hint: "Não classificado automaticamente — abra os detalhes." },
};

function classifyReason(e: any): { category: ReasonCategory; detail: string } {
  const msg = String(e.error_message || "").toLowerCase();
  const raw = String(e.raw_text || e.ocr_payload?.raw_text || "");
  const status = e.status as string;

  if (/r\$\s*r\$/i.test(raw) || /\{[a-z_]+\}/i.test(raw)) {
    const placeholders = Array.from(raw.matchAll(/\{([a-z_]+)\}/gi)).map((m) => m[1]);
    const issues: string[] = [];
    if (/r\$\s*r\$/i.test(raw)) issues.push("'R$ R$' duplicado");
    if (placeholders.length) issues.push(`placeholders: ${[...new Set(placeholders)].join(", ")}`);
    return { category: "template_placeholder", detail: issues.join(" · ") };
  }
  if (/candidato sugerido|sugerido por nome|pix.*terceiro|pode ser de terceiro|confirme manualmente/i.test(msg)) {
    return { category: "sugestao_terceiro", detail: e.error_message };
  }
  if (/duplic|idempot|already.*processed|já.*process/i.test(msg)) {
    return { category: "duplicado", detail: e.error_message || "Mensagem WhatsApp duplicada" };
  }
  if (/sem fatura|no.*match|nenhuma fatura|invoice.*not.*found|sem invoice|sem compatível|nenhuma compat/i.test(msg)) {
    return { category: "sem_fatura_compativel", detail: e.error_message };
  }
  if (/valor não detectado|valor nao detectado|invalid amount|valor.*nul|valor.*inval|amount.*null/i.test(msg) || e.amount_detected == null) {
    return { category: "valor_nao_detectado", detail: e.error_message || "OCR não extraiu o valor" };
  }
  if (/cliente não identificado|cliente nao identificado|vincule manualmente/i.test(msg)) {
    return { category: "sem_cliente", detail: e.error_message };
  }
  if (/ocr|texto vazio|empty.*text|no.*text/i.test(msg)) {
    return { category: "ocr_falhou", detail: e.error_message || "OCR sem texto" };
  }
  if (/telefone|phone|^lid|destination|number.*invalid|número.*inv/i.test(msg)) {
    return { category: "telefone_invalido", detail: e.error_message || "Telefone do remetente sem match" };
  }
  if (/send|envio|whatsapp.*fail|instance.*offline|timeout|evolution/i.test(msg)) {
    return { category: "erro_envio", detail: e.error_message || "Falha ao enviar confirmação" };
  }
  if (status === "pendente_revisao" || (!e.client_id && status !== "conciliado")) {
    return { category: "sem_cliente", detail: e.error_message || `Telefone ${e.phone || "?"} sem cliente vinculado` };
  }
  if (status === "recebido") {
    return { category: "nao_processado", detail: e.error_message || "Evento ainda não passou pelo robô" };
  }
  return { category: "outro", detail: e.error_message || "Sem mensagem de erro" };
}

function toLocalISO(d: Date) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

// Janela local-aware: converte início/fim do dia LOCAL para UTC ISO.
function localDayBoundsUTC(dateISO: string) {
  const start = new Date(`${dateISO}T00:00:00`); // local
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

type RangeMode = "today" | "7d" | "30d" | "custom";

export default function MissedSettlements() {
  const today = toLocalISO(new Date());
  const [rangeMode, setRangeMode] = useState<RangeMode>("7d");
  const [date, setDate] = useState(today);
  const [includeIgnored, setIncludeIgnored] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [viewEvent, setViewEvent] = useState<any | null>(null);

  const { startISO, endISO, label } = useMemo(() => {
    if (rangeMode === "custom") {
      const b = localDayBoundsUTC(date);
      return { startISO: b.start, endISO: b.end, label: format(new Date(date + "T12:00:00"), "dd 'de' MMMM yyyy", { locale: ptBR }) };
    }
    if (rangeMode === "today") {
      const b = localDayBoundsUTC(today);
      return { startISO: b.start, endISO: b.end, label: "hoje" };
    }
    const days = rangeMode === "7d" ? 7 : 30;
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    return { startISO: start.toISOString(), endISO: end.toISOString(), label: `últimos ${days} dias` };
  }, [rangeMode, date, today]);

  const statusFilter = includeIgnored ? ALL_VISIBLE : FAILED_STATUSES;

  // Métricas globais (inclui conciliados/ignorados para taxa de sucesso)
  const { data: metrics } = useQuery({
    queryKey: ["missed-metrics", startISO, endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_settlement_events")
        .select("status")
        .gte("created_at", startISO)
        .lt("created_at", endISO);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data || []) counts[r.status] = (counts[r.status] || 0) + 1;
      const total = (data || []).length;
      const ok = counts["conciliado"] || 0;
      const taxa = total > 0 ? Math.round((ok / total) * 100) : 0;
      return { counts, total, ok, taxa };
    },
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const { data: events = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["missed-settlements", startISO, endISO, statusFilter.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_settlement_events")
        .select("id, organization_id, client_id, phone, amount_detected, status, error_message, raw_text, ocr_payload, whatsapp_message_id, created_at")
        .in("status", statusFilter)
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const orgIds = useMemo(() => Array.from(new Set(events.map((e: any) => e.organization_id).filter(Boolean))), [events]);
  const clientIds = useMemo(() => Array.from(new Set(events.map((e: any) => e.client_id).filter(Boolean))), [events]);

  const { data: orgs = [] } = useQuery({
    queryKey: ["missed-orgs", orgIds],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, name").in("id", orgIds);
      return data || [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["missed-clients", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name, phone").in("id", clientIds);
      return data || [];
    },
  });

  const orgMap = useMemo(() => Object.fromEntries(orgs.map((o: any) => [o.id, o.name])), [orgs]);
  const clientMap = useMemo(() => Object.fromEntries(clients.map((c: any) => [c.id, c])), [clients]);

  const rows = events.map((e: any) => {
    const client = e.client_id ? clientMap[e.client_id] : null;
    const senderName = e.ocr_payload?.push_name || e.ocr_payload?.sender_name;
    const reason = classifyReason(e);
    return {
      ...e,
      _clientName: client?.name || senderName || "—",
      _orgName: orgMap[e.organization_id] || "—",
      _reasonCat: reason.category,
      _reasonDetail: reason.detail,
    };
  });

  const reasonSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r._reasonCat] = (counts[r._reasonCat] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const exportCSV = () => {
    const header = ["Data/Hora", "Organização", "Cliente", "Telefone", "Valor", "Status", "Categoria", "Motivo detalhado", "WA Message ID", "Comprovante (trecho)"];
    const lines = [header.join(";")];
    for (const r of rows) {
      const raw = (r.raw_text || r.ocr_payload?.raw_text || "").toString().replace(/\s+/g, " ").slice(0, 200);
      lines.push([
        format(new Date(r.created_at), "dd/MM/yyyy HH:mm"),
        r._orgName,
        r._clientName,
        r.phone || "",
        r.amount_detected != null ? `R$ ${Number(r.amount_detected).toFixed(2)}` : "",
        statusLabel[r.status]?.label || r.status,
        reasonMeta[r._reasonCat as ReasonCategory].label,
        (r._reasonDetail || r.error_message || "").replace(/;/g, ","),
        r.whatsapp_message_id || "",
        raw.replace(/;/g, ","),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprovantes-nao-baixados-${rangeMode === "custom" ? date : rangeMode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-7xl mx-auto p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="text-amber-500" />
              Comprovantes Não Baixados
            </h1>
            <p className="text-sm text-muted-foreground">
              Auditoria das mensagens com comprovante que falharam na baixa automática.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={rangeMode} onValueChange={(v) => setRangeMode(v as RangeMode)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="custom">Data específica</SelectItem>
              </SelectContent>
            </Select>
            {rangeMode === "custom" && (
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            )}
            <div className="flex items-center gap-2 px-2">
              <Switch id="ig" checked={includeIgnored} onCheckedChange={setIncludeIgnored} />
              <Label htmlFor="ig" className="text-xs cursor-pointer">Ignorados</Label>
            </div>
            <div className="flex items-center gap-2 px-2">
              <Switch id="ar" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              <Label htmlFor="ar" className="text-xs cursor-pointer">Auto 15s</Label>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={exportCSV} disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </div>

        {/* Métricas globais */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total recebido</div>
              <div className="text-xl font-bold">{metrics.total}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />Conciliado</div>
              <div className="text-xl font-bold text-emerald-600">{metrics.ok}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Pendente revisão</div>
              <div className="text-xl font-bold text-amber-600">{metrics.counts.pendente_revisao || 0}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Erro</div>
              <div className="text-xl font-bold text-red-600">{metrics.counts.erro || 0}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Taxa sucesso</div>
              <div className={`text-xl font-bold ${metrics.taxa >= 70 ? "text-emerald-600" : metrics.taxa >= 40 ? "text-amber-600" : "text-red-600"}`}>{metrics.taxa}%</div>
            </CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {rows.length} comprovante{rows.length !== 1 ? "s" : ""} para auditar — {label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                ✅ Nenhum comprovante pendente neste período.
              </p>
            ) : (
              <>
                {reasonSummary.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b">
                    {reasonSummary.map(([cat, count]) => {
                      const meta = reasonMeta[cat as ReasonCategory];
                      return (
                        <Badge key={cat} variant={meta.variant} title={meta.hint} className="cursor-help">
                          {meta.label}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Categoria do erro</TableHead>
                        <TableHead>Motivo detalhado</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r: any) => {
                        const meta = reasonMeta[r._reasonCat as ReasonCategory];
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(new Date(r.created_at), "dd/MM HH:mm")}
                            </TableCell>
                            <TableCell className="font-medium">
                              {r._clientName}
                              {!r.client_id && <Badge variant="outline" className="ml-2 text-[10px]">não vinculado</Badge>}
                              <div className="text-[11px] text-muted-foreground">{r._orgName}</div>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{r.phone || "—"}</TableCell>
                            <TableCell className="text-right font-mono">
                              {r.amount_detected != null ? `R$ ${Number(r.amount_detected).toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusLabel[r.status]?.variant || "secondary"}>
                                {statusLabel[r.status]?.label || r.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={meta.variant} title={meta.hint} className="cursor-help whitespace-nowrap">
                                {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs max-w-[280px] truncate" title={r._reasonDetail || ""}>
                              {r._reasonDetail || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setViewEvent(r)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" asChild>
                                  <Link to="/admin/auto-settlement" title="Abrir em Liquidação Auto">
                                    <ExternalLink className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!viewEvent} onOpenChange={(o) => !o && setViewEvent(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Comprovante WhatsApp</DialogTitle>
            </DialogHeader>
            {viewEvent && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><strong>Cliente:</strong> {viewEvent._clientName}</div>
                  <div><strong>Telefone:</strong> {viewEvent.phone || "—"}</div>
                  <div><strong>Valor:</strong> {viewEvent.amount_detected != null ? `R$ ${Number(viewEvent.amount_detected).toFixed(2)}` : "—"}</div>
                  <div><strong>Status:</strong> {statusLabel[viewEvent.status]?.label || viewEvent.status}</div>
                  <div className="col-span-2">
                    <strong>Categoria:</strong>{" "}
                    <Badge variant={reasonMeta[viewEvent._reasonCat as ReasonCategory].variant}>
                      {reasonMeta[viewEvent._reasonCat as ReasonCategory].label}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {reasonMeta[viewEvent._reasonCat as ReasonCategory].hint}
                    </div>
                  </div>
                  <div className="col-span-2"><strong>Motivo detalhado:</strong> {viewEvent._reasonDetail || viewEvent.error_message || "—"}</div>
                  {viewEvent.whatsapp_message_id && (
                    <div className="col-span-2 font-mono text-xs break-all">
                      <strong>WA Message ID:</strong> {viewEvent.whatsapp_message_id}
                    </div>
                  )}
                </div>
                {(viewEvent.raw_text || viewEvent.ocr_payload?.raw_text) && (
                  <div>
                    <strong>Texto do comprovante:</strong>
                    <pre className="mt-1 p-3 bg-muted rounded text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {viewEvent.raw_text || viewEvent.ocr_payload?.raw_text}
                    </pre>
                  </div>
                )}
                {viewEvent.ocr_payload && (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">Payload OCR completo</summary>
                    <pre className="mt-1 p-3 bg-muted rounded text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {JSON.stringify(viewEvent.ocr_payload, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="pt-2">
                  <Button asChild size="sm">
                    <Link to="/admin/auto-settlement">Vincular cliente em Liquidação Auto</Link>
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
