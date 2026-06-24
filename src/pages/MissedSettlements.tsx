import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Download, Eye, ExternalLink, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const FAILED_STATUSES = ["pendente_revisao", "erro", "recebido"];

const statusLabel: Record<string, { label: string; variant: any }> = {
  pendente_revisao: { label: "Sem cliente", variant: "destructive" },
  erro: { label: "Erro", variant: "destructive" },
  recebido: { label: "Não processado", variant: "secondary" },
};

type ReasonCategory =
  | "sem_cliente"
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
  telefone_invalido:     { label: "Telefone inválido",          variant: "destructive", hint: "Número malformado ou faltando DDI/DDD/9." },
  valor_nao_detectado:   { label: "Valor não detectado",        variant: "destructive", hint: "OCR não conseguiu extrair o valor do comprovante." },
  sem_fatura_compativel: { label: "Sem fatura compatível",      variant: "destructive", hint: "Nenhuma fatura aberta com o valor recebido." },
  ocr_falhou:            { label: "Falha de OCR",               variant: "destructive", hint: "Imagem ilegível, sem texto ou OCR retornou vazio." },
  template_placeholder:  { label: "Template/placeholder",       variant: "destructive", hint: "Mensagem com '{variavel}' não substituída, 'R$ R$' duplicado ou texto cru." },
  duplicado:             { label: "Duplicado / já processado",  variant: "secondary",   hint: "Comprovante igual já recebido — ignorado por idempotência." },
  erro_envio:            { label: "Erro de envio WhatsApp",     variant: "destructive", hint: "Falha ao enviar confirmação (instância offline, API, timeout)." },
  nao_processado:        { label: "Não processado",             variant: "secondary",   hint: "Evento recebido mas o robô ainda não rodou nele." },
  outro:                 { label: "Outro / inspecionar",        variant: "outline",     hint: "Não classificado automaticamente — abra os detalhes." },
};

function classifyReason(e: any): { category: ReasonCategory; detail: string } {
  const msg = String(e.error_message || "").toLowerCase();
  const raw = String(e.raw_text || e.ocr_payload?.raw_text || "");
  const status = e.status as string;

  // Heurísticas específicas (ordem importa — mais específicas primeiro)
  if (/r\$\s*r\$/i.test(raw) || /\{[a-z_]+\}/i.test(raw)) {
    const placeholders = Array.from(raw.matchAll(/\{([a-z_]+)\}/gi)).map((m) => m[1]);
    const issues: string[] = [];
    if (/r\$\s*r\$/i.test(raw)) issues.push("'R$ R$' duplicado");
    if (placeholders.length) issues.push(`placeholders não substituídos: ${[...new Set(placeholders)].join(", ")}`);
    return { category: "template_placeholder", detail: issues.join(" · ") };
  }
  if (/duplic|idempot|already.*processed|já.*process/i.test(msg)) {
    return { category: "duplicado", detail: e.error_message || "Mensagem WhatsApp duplicada" };
  }
  if (/sem fatura|no.*match|nenhuma fatura|invoice.*not.*found|sem invoice/i.test(msg)) {
    return { category: "sem_fatura_compativel", detail: e.error_message || "Nenhuma fatura aberta com esse valor" };
  }
  if (/invalid amount|valor.*nul|valor.*inval|amount.*null/i.test(msg) || e.amount_detected == null) {
    if (e.amount_detected == null) return { category: "valor_nao_detectado", detail: e.error_message || "OCR não extraiu o valor" };
  }
  if (/ocr|texto vazio|empty.*text|no.*text/i.test(msg)) {
    return { category: "ocr_falhou", detail: e.error_message || "OCR sem texto" };
  }
  if (/telefone|phone|lid|destination|number.*invalid|número.*inv/i.test(msg)) {
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

export default function MissedSettlements() {
  const today = toLocalISO(new Date());
  const [date, setDate] = useState(today);
  const [viewEvent, setViewEvent] = useState<any | null>(null);

  const { data: events = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["missed-settlements", date],
    queryFn: async () => {
      const start = `${date}T00:00:00.000Z`;
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      const end = toLocalISO(endDate) + "T00:00:00.000Z";
      const { data, error } = await supabase
        .from("auto_settlement_events")
        .select("id, organization_id, client_id, phone, amount_detected, status, error_message, raw_text, ocr_payload, whatsapp_message_id, created_at")
        .in("status", FAILED_STATUSES)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
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
    const header = ["Data/Hora", "Organização", "Cliente", "Telefone", "Valor", "Status", "Categoria", "Motivo detalhado", "Comprovante (trecho)"];
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
        raw.replace(/;/g, ","),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprovantes-nao-baixados-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-7xl mx-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="text-amber-500" />
              Comprovantes Não Baixados
            </h1>
            <p className="text-sm text-muted-foreground">
              Faturas que deveriam ter sido baixadas via WhatsApp mas falharam (sem cliente, erro de OCR ou sem fatura compatível).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={exportCSV} disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {rows.length} comprovante{rows.length !== 1 ? "s" : ""} pendente{rows.length !== 1 ? "s" : ""} em {format(new Date(date + "T12:00:00"), "dd 'de' MMMM yyyy", { locale: ptBR })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                ✅ Nenhum comprovante pendente nesta data. Todos foram conciliados automaticamente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{format(new Date(r.created_at), "HH:mm")}</TableCell>
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
                        <TableCell className="text-xs max-w-[260px] truncate" title={r.error_message || ""}>
                          {r.error_message || "—"}
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
                    ))}
                  </TableBody>
                </Table>
              </div>
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
                  <div className="col-span-2"><strong>Motivo:</strong> {viewEvent.error_message || "—"}</div>
                  {viewEvent.whatsapp_message_id && (
                    <div className="col-span-2 font-mono text-xs">
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
