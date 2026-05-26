import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Zap, RefreshCw, Eye, Copy, CheckCircle2, Webhook, Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  recebido: "secondary",
  processando: "secondary",
  conciliado: "default",
  duplicado: "outline",
  erro: "destructive",
  ignorado: "outline",
  pendente_revisao: "destructive",
};

export default function AutoSettlement() {
  const qc = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [linkEvent, setLinkEvent] = useState<any | null>(null);
  const [clientSearch, setClientSearch] = useState("");

  const { data: linkableClients = [] } = useQuery({
    queryKey: ["link-clients", linkEvent?.organization_id, clientSearch],
    queryFn: async () => {
      if (!linkEvent) return [];
      let q = supabase.from("clients").select("id, name, phone")
        .eq("organization_id", linkEvent.organization_id)
        .order("name").limit(30);
      if (clientSearch.trim()) q = q.ilike("name", `%${clientSearch.trim()}%`);
      const { data } = await q;
      return data || [];
    },
    enabled: !!linkEvent,
  });

  const assignClient = useMutation({
    mutationFn: async ({ event_id, client_id }: { event_id: string; client_id: string }) => {
      const { data, error } = await supabase.functions.invoke("auto-settlement-assign-client", {
        body: { event_id, client_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        `Vinculado a ${data?.client_name || "cliente"}${data?.whatsapp_sent ? " — confirmação WhatsApp enviada" : ""}`
      );
      setLinkEvent(null);
      setClientSearch("");
      qc.invalidateQueries({ queryKey: ["auto-settlement-events"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e.message}`),
  });

  const { data: flag } = useQuery({
    queryKey: ["auto-settlement-flag"],
    queryFn: async () => {
      const { data } = await supabase.from("global_settings").select("value").eq("key", "auto_settlement_enabled").maybeSingle();
      return data?.value === "true";
    },
  });

  const toggleFlag = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from("global_settings")
        .update({ value: enabled ? "true" : "false", updated_at: new Date().toISOString() })
        .eq("key", "auto_settlement_enabled");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto-settlement-flag"] });
      toast.success("Configuração atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const registerWebhook = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("register-pix-webhook", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const ok = data?.ok ?? 0;
      const total = data?.total ?? 0;
      if (ok === total && total > 0) {
        toast.success(`Webhook registrado em ${ok}/${total} instâncias`);
      } else {
        toast.warning(`Webhook registrado em ${ok}/${total} instâncias — verifique falhas no console`);
        console.warn("register-pix-webhook results:", data?.results);
      }
    },
    onError: (e: any) => toast.error(`Falha ao registrar webhook: ${e.message}`),
  });

  const { data: events = [], refetch: refetchEvents } = useQuery({
    queryKey: ["auto-settlement-events"],
    queryFn: async () => {
      const { data } = await supabase.from("auto_settlement_events")
        .select("*, clients(name)")
        .order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const { data: credits = [] } = useQuery({
    queryKey: ["auto-settlement-credits"],
    queryFn: async () => {
      const { data } = await supabase.from("auto_settlement_credits")
        .select("*, clients(name)")
        .eq("status", "disponivel")
        .order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["auto-settlement-logs", selectedEvent],
    queryFn: async () => {
      if (!selectedEvent) return [];
      const { data } = await supabase.from("auto_settlement_logs")
        .select("*").eq("event_id", selectedEvent).order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!selectedEvent,
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" /> Liquidação Automática (PIX OCR)
            </h1>
            <p className="text-sm text-muted-foreground">Motor desacoplado: identifica comprovante PIX no WhatsApp, quita faturas e gera créditos.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchEvents()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Feature Flag</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Ativar motor de antecipação automática</p>
                <p className="text-xs text-muted-foreground">Quando desligado, comprovantes recebidos são ignorados e nada é processado.</p>
              </div>
              <Switch checked={!!flag} onCheckedChange={(v) => toggleFlag.mutate(v)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Webhook do WhatsApp (Evolution API)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cole esta URL no campo <strong>Webhook</strong> da sua instância na Evolution API
              e habilite o evento <code className="px-1 py-0.5 bg-muted rounded text-xs">MESSAGES_UPSERT</code>.
              Quando o cliente enviar a foto do comprovante PIX no WhatsApp, o sistema lê o valor
              automaticamente e dá baixa nas faturas em aberto.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`);
                  toast.success("URL copiada");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => registerWebhook.mutate()}
                disabled={registerWebhook.isPending}
              >
                <Webhook className="h-4 w-4 mr-1" />
                {registerWebhook.isPending ? "Registrando..." : "Registrar webhook nas instâncias"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• <strong>Clique no botão acima</strong> para configurar automaticamente o webhook em todas as instâncias WhatsApp conectadas.</p>
              <p>• Funciona com <strong>imagens</strong> de comprovante (OCR via IA) e textos com valor (ex.: "Paguei R$ 44,00 via PIX").</p>
              <p>• Identifica o cliente pelo telefone do remetente dentro da organização.</p>
              <p>• Quita faturas em aberto na ordem de vencimento. Sobra vira crédito.</p>
              <p>• Idempotente: o mesmo TXID nunca é processado duas vezes.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Eventos Recentes</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Status</TableHead><TableHead>Cliente</TableHead><TableHead>Telefone</TableHead>
                <TableHead>Valor</TableHead><TableHead>TXID</TableHead><TableHead>Data</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum evento ainda</TableCell></TableRow>
                ) : events.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell><Badge variant={statusColors[e.status] as any}>{e.status}</Badge></TableCell>
                    <TableCell>{e.clients?.name || <span className="text-muted-foreground italic">não identificado</span>}</TableCell>
                    <TableCell className="text-xs font-mono">{e.phone}</TableCell>
                    <TableCell>{e.amount_detected ? `R$ ${Number(e.amount_detected).toFixed(2)}` : "-"}</TableCell>
                    <TableCell className="text-xs font-mono max-w-[120px] truncate">{e.txid || "-"}</TableCell>
                    <TableCell className="text-xs">{format(new Date(e.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(e.id)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Créditos Disponíveis</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Origem</TableHead><TableHead>Data</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {credits.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum crédito disponível</TableCell></TableRow>
                ) : credits.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.clients?.name || "-"}</TableCell>
                    <TableCell className="font-medium text-green-500">R$ {Number(c.amount).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{c.source}</Badge></TableCell>
                    <TableCell className="text-xs">{format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!selectedEvent} onOpenChange={(o) => !o && setSelectedEvent(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Auditoria do Evento</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {logs.map((l: any) => (
                <div key={l.id} className="text-xs border rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="secondary" className="text-[10px]">{l.action}</Badge>
                    <span className="text-muted-foreground">{format(new Date(l.created_at), "dd/MM HH:mm:ss")}</span>
                  </div>
                  <pre className="text-[10px] overflow-x-auto bg-muted p-1 rounded">{JSON.stringify(l.details, null, 2)}</pre>
                </div>
              ))}
              {logs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem logs</p>}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
