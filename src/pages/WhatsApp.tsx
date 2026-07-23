import { useState, useEffect, useCallback, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { sanitizeInstanceName } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import {
  MessageSquare, Send, Radio, Megaphone, Smartphone,
  Plus, Trash2, Search, Wifi, WifiOff, Clock, CheckCircle2,
  XCircle, Loader2, AlertTriangle, QrCode, RefreshCw,
  BarChart3, ChevronLeft, ChevronRight, Activity,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const PAGE_SIZE = 30;

// ─── Helpers ────────────────────────────────────────────
const statusBadge = (status: string) => {
  const map: Record<string, { cls: string; label: string }> = {
    connected: { cls: "bg-success/10 text-success border-0", label: "Conectado" },
    disconnected: { cls: "bg-destructive/10 text-destructive border-0", label: "Desconectado" },
    pairing: { cls: "bg-warning/10 text-warning border-0", label: "Pareando" },
    pending: { cls: "bg-warning/10 text-warning border-0", label: "Pendente" },
    queued: { cls: "bg-warning/10 text-warning border-0", label: "Na Fila" },
    processing: { cls: "bg-primary/10 text-primary border-0", label: "Processando" },
    sent: { cls: "bg-success/10 text-success border-0", label: "Enviado" },
    delivered: { cls: "bg-primary/10 text-primary border-0", label: "Entregue" },
    read: { cls: "bg-primary/10 text-primary border-0", label: "Lido" },
    failed: { cls: "bg-destructive/10 text-destructive border-0", label: "Falhou" },
    draft: { cls: "bg-muted text-muted-foreground border-0", label: "Rascunho" },
    scheduled: { cls: "bg-warning/10 text-warning border-0", label: "Agendada" },
    running: { cls: "bg-primary/10 text-primary border-0", label: "Enviando" },
    completed: { cls: "bg-success/10 text-success border-0", label: "Concluída" },
    cancelled: { cls: "bg-destructive/10 text-destructive border-0", label: "Cancelada" },
    retry: { cls: "bg-warning/10 text-warning border-0", label: "Retry" },
    sending: { cls: "bg-warning/10 text-warning border-0", label: "Enviando" },
    paused: { cls: "bg-muted text-muted-foreground border-0", label: "Pausado" },
  };
  const s = map[status] || { cls: "bg-muted text-muted-foreground border-0", label: status };
  return <Badge className={s.cls}>{s.label}</Badge>;
};

const isQrImageData = (value: string) => {
  const clean = value.trim();
  return clean.startsWith("data:image/") || clean.startsWith("iVBOR") || clean.startsWith("/9j/") || clean.startsWith("UklGR");
};

function PaginationControls({ page, setPage, totalCount }: { page: number; setPage: (p: number) => void; totalCount: number }) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  return (
    <div className="flex items-center justify-between pt-3">
      <p className="text-xs text-muted-foreground">{totalCount} registro(s) — Página {page} de {totalPages}</p>
      <div className="flex gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Tab: Mensagens ─────────────────────────────────────
function MessagesTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ phone: "", message: "" });
  const [page, setPage] = useState(1);

  const { data: totalCount = 0 } = useQuery({
    queryKey: ["whatsapp-messages-count", organizationId, search],
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_messages")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("deleted_at", null);
      if (search) {
        q = q.or(`phone.ilike.%${search}%,message.ilike.%${search}%`);
      }
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["whatsapp-messages", organizationId, page, search],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("whatsapp_messages")
        .select("*, clients(name)")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (search) {
        q = q.or(`phone.ilike.%${search}%,message.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const phone = form.phone.replace(/\D/g, "");
      const { error } = await supabase.from("whatsapp_queue").insert({
        organization_id: organizationId,
        phone,
        message: form.message,
        status: "queued",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-queue"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-queue-count"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-queue-stats"] });
      toast({ title: "Mensagem enviada para a fila de processamento!" });
      setDialogOpen(false);
      setForm({ phone: "", message: "" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteByClientMutation = useMutation({
    mutationFn: async (clientPhone: string) => {
      const { error } = await supabase
        .from("whatsapp_messages")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any)
        .eq("organization_id", organizationId)
        .eq("phone", clientPhone);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
      toast({ title: "Histórico do cliente apagado!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("whatsapp_messages")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
      toast({ title: "Todo o histórico foi apagado!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  useEffect(() => { setPage(1); }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por telefone ou mensagem..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" size="sm"
            onClick={() => {
              if (window.confirm("Tem certeza? Esta ação apagará TODO o histórico de mensagens.")) {
                if (window.confirm("CONFIRMAÇÃO FINAL: Esta ação é IRREVERSÍVEL. Deseja continuar?")) {
                  deleteAllMutation.mutate();
                }
              }
            }}
            disabled={deleteAllMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Apagar Histórico
          </Button>
          <Button className="gradient-primary text-primary-foreground" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Mensagem
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhuma mensagem encontrada.</div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Direção</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.phone}</TableCell>
                    <TableCell>{m.clients?.name || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{m.message}</TableCell>
                    <TableCell>{m.direction === "outgoing" ? "Saída" : "Entrada"}</TableCell>
                    <TableCell>{statusBadge(m.status)}</TableCell>
                    <TableCell className="text-sm">{format(parseISO(m.created_at), "dd/MM/yy HH:mm")}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Apagar histórico deste número"
                        onClick={() => {
                          if (window.confirm(`Apagar todo o histórico de ${m.phone}?`)) {
                            deleteByClientMutation.mutate(m.phone);
                          }
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls page={page} setPage={setPage} totalCount={totalCount} />
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Mensagem</DialogTitle>
            <DialogDescription>Envie uma mensagem individual via WhatsApp.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); sendMutation.mutate(); }} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Telefone *</Label>
              <Input placeholder="5511999999999" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea placeholder="Digite a mensagem..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={sendMutation.isPending}>
                {sendMutation.isPending ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Fila ──────────────────────────────────────────
function QueueTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [resetting, setResetting] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["whatsapp-queue"] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-queue-count"] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-queue-stats"] });
  };

  const resetStuck = async () => {
    if (!window.confirm("Resetar mensagens travadas em 'Enviando' há mais de 5 minutos para 'retry'?")) return;
    setResetting(true);
    try {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("whatsapp_queue")
        .update({ status: "retry", error_message: "Reset manual: travado em sending" } as any)
        .eq("organization_id", organizationId)
        .eq("status", "sending")
        .lt("updated_at", cutoff)
        .select("id");
      if (error) throw error;
      toast({ title: `${data?.length || 0} mensagem(ns) resetada(s) para retry` });
      invalidateAll();
    } catch (err: any) {
      toast({ title: "Erro ao resetar", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const { data: totalCount = 0 } = useQuery({
    queryKey: ["whatsapp-queue-count", organizationId, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_queue")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 10000,
  });

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["whatsapp-queue", organizationId, page, statusFilter],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("whatsapp_queue")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
    refetchInterval: 15000,
  });

  // Stats (lightweight count query)
  const { data: stats = { queued: 0, sending: 0, sent: 0, failed: 0, retry: 0 } } = useQuery({
    queryKey: ["whatsapp-queue-stats", organizationId],
    queryFn: async () => {
      const statuses = ["queued", "sending", "sent", "failed", "retry"] as const;
      const results = await Promise.all(
        statuses.map((status) =>
          supabase
            .from("whatsapp_queue")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("status", status)
            .then(({ count }) => count || 0)
        )
      );
      return statuses.reduce((acc, s, i) => ({ ...acc, [s]: results[i] }), {} as Record<string, number>);
    },
    enabled: !!organizationId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  useEffect(() => { setPage(1); }, [statusFilter]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Na Fila", value: stats.queued, icon: Clock, cls: "gradient-primary", spin: false },
          { label: "Enviando", value: stats.sending, icon: Loader2, cls: "gradient-warning", spin: stats.sending > 0 },
          { label: "Enviados", value: stats.sent, icon: CheckCircle2, cls: "gradient-success", spin: false },
          { label: "Falhas", value: stats.failed, icon: XCircle, cls: "gradient-danger", spin: false },
          { label: "Retry", value: stats.retry, icon: RefreshCw, cls: "bg-muted", spin: false },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`h-9 w-9 rounded-lg ${s.cls} flex items-center justify-center`}>
                <s.icon className={`h-4 w-4 text-primary-foreground ${s.spin ? "animate-spin" : ""}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs">Filtrar:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="queued">Na Fila</SelectItem>
            <SelectItem value="sending">Enviando</SelectItem>
            <SelectItem value="sent">Enviados</SelectItem>
            <SelectItem value="failed">Falhas</SelectItem>
            <SelectItem value="retry">Retry</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs ml-auto"
          onClick={resetStuck}
          disabled={resetting || stats.sending === 0}
          title="Reseta mensagens travadas em 'Enviando' há mais de 5 minutos"
        >
          {resetting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Resetar travados
        </Button>
      </div>


      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : queue.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Fila vazia no momento.</div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agendado</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((q: any) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-sm">{q.phone}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{q.message}</TableCell>
                    <TableCell>{statusBadge(q.status)}</TableCell>
                    <TableCell className="text-sm">{q.scheduled_for ? format(parseISO(q.scheduled_for), "dd/MM HH:mm") : "—"}</TableCell>
                    <TableCell className="text-sm">{q.sent_at ? format(parseISO(q.sent_at), "dd/MM HH:mm") : "—"}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[150px] truncate">{q.error_message || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls page={page} setPage={setPage} totalCount={totalCount} />
        </div>
      )}
    </div>
  );
}

// ─── Tab: Envio em Massa ────────────────────────────────
function BulkTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ message: "", phones: "", minDelay: "5", maxDelay: "15" });

  const { data: clients = [] } = useQuery({
    queryKey: ["whatsapp-clients", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, phone").eq("organization_id", organizationId).not("phone", "is", null);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
    staleTime: 60000,
  });

  const sendBulk = useMutation({
    mutationFn: async () => {
      const phones = form.phones
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      if (phones.length === 0) throw new Error("Informe ao menos um telefone");

      const minD = parseInt(form.minDelay) || 5;
      const maxD = parseInt(form.maxDelay) || 15;
      const items = phones.map((phone, i) => ({
        organization_id: organizationId,
        phone: phone.replace(/\D/g, ""),
        message: form.message,
        status: "queued" as const,
        campaign_id: null,
        scheduled_for: new Date(Date.now() + i * ((Math.random() * (maxD - minD) + minD) * 1000)).toISOString(),
      }));

      const { error } = await supabase.from("whatsapp_queue").insert(items);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-queue"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-queue-count"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-queue-stats"] });
      toast({ title: `Mensagens adicionadas à fila!` });
      setForm({ ...form, phones: "", message: "" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Envio em Massa</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); sendBulk.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea placeholder="Digite a mensagem que será enviada para todos..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Telefones (um por linha) *</Label>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                  onClick={() => {
                    const phones = clients.filter((c: any) => c.phone).map((c: any) => c.phone).join("\n");
                    setForm({ ...form, phones });
                  }}>
                  Importar todos os clientes ({clients.filter((c: any) => c.phone).length})
                </Button>
              </div>
              <Textarea placeholder="5511999999999&#10;5511888888888" value={form.phones} onChange={(e) => setForm({ ...form, phones: e.target.value })} rows={5} required />
              <p className="text-xs text-muted-foreground">{form.phones.split("\n").filter(Boolean).length} telefone(s)</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delay mínimo (seg)</Label>
                <Input type="number" min="1" value={form.minDelay} onChange={(e) => setForm({ ...form, minDelay: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Delay máximo (seg)</Label>
                <Input type="number" min="1" value={form.maxDelay} onChange={(e) => setForm({ ...form, maxDelay: e.target.value })} />
              </div>
            </div>
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <p className="text-muted-foreground">
                Intervalo aleatório entre <strong>{form.minDelay}s</strong> e <strong>{form.maxDelay}s</strong> entre cada envio (anti-ban).
              </p>
            </div>
            <Button type="submit" className="gradient-primary text-primary-foreground w-full" disabled={sendBulk.isPending}>
              {sendBulk.isPending ? "Adicionando à fila..." : "Adicionar à Fila de Envio"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Campanhas ─────────────────────────────────────
function CampaignsTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", message: "", minDelay: "5", maxDelay: "15" });

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["whatsapp-campaigns", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_campaigns").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
    staleTime: 30000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("whatsapp_campaigns").insert({
        organization_id: organizationId,
        name: form.name,
        message: form.message,
        min_delay: parseInt(form.minDelay) || 5,
        max_delay: parseInt(form.maxDelay) || 15,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
      toast({ title: "Campanha criada!" });
      setDialogOpen(false);
      setForm({ name: "", message: "", minDelay: "5", maxDelay: "15" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
      toast({ title: "Campanha excluída!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gradient-primary text-primary-foreground" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhuma campanha criada.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enviados</TableHead>
                <TableHead>Falhas</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.message}</TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell>{c.sent_count}/{c.total_contacts}</TableCell>
                  <TableCell>{c.failed_count}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                      if (window.confirm("Excluir esta campanha?")) deleteMutation.mutate(c.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
            <DialogDescription>Crie uma campanha de envio em massa.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delay mín (seg)</Label>
                <Input type="number" min="1" value={form.minDelay} onChange={(e) => setForm({ ...form, minDelay: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Delay máx (seg)</Label>
                <Input type="number" min="1" value={form.maxDelay} onChange={(e) => setForm({ ...form, maxDelay: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Parear ────────────────────────────────────────
function PairTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [editForm, setEditForm] = useState({ id: "", name: "", phone: "", api_url: "", api_key: "" });
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const intervalRef = useRef<any>(null);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["whatsapp-instances", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_instances").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
    staleTime: 30000,
  });

  const fetchQr = useCallback(async (instanceId: string) => {
    setQrLoading(true);
    setQrBase64(null);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/whatsapp-manager`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "get_qr", instance_id: instanceId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao obter QR Code");

      if (result.qr_code) {
        setQrBase64(result.qr_code);
      } else if (result.status === "connected") {
        toast({ title: "Instância já está conectada!" });
        queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
        setQrDialogOpen(false);
      } else {
        throw new Error("QR Code não retornado pela instância");
      }
    } catch (err) {
      toast({ title: "Erro ao obter QR Code", description: (err as Error).message, variant: "destructive" });
    } finally {
      setQrLoading(false);
    }
  }, [queryClient, toast]);

  useEffect(() => {
    if (!qrDialogOpen || !selectedInstance) return;
    setCountdown(30);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchQr(selectedInstance.id);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [qrDialogOpen, selectedInstance, fetchQr]);

  const handleConnect = (inst: any) => {
    setSelectedInstance(inst);
    setQrDialogOpen(true);
    fetchQr(inst.id);
  };

  const handleEdit = (inst: any) => {
    setEditForm({ id: inst.id, name: inst.name, phone: inst.phone || "", api_url: inst.api_url || "", api_key: inst.api_key || "" });
    setEditDialogOpen(true);
  };

  const handleCheckStatus = async (inst: any) => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/whatsapp-manager`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "check_status", instance_id: inst.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao verificar status");
      const newStatus = result.status === "connected" ? "connected" : result.status === "pairing" ? "pairing" : "disconnected";
      await supabase.from("whatsapp_instances").update({ status: newStatus }).eq("id", inst.id);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: `Status: ${newStatus === "connected" ? "Conectado" : newStatus === "pairing" ? "Pareando" : "Desconectado"}` });
    } catch (err) {
      toast({ title: "Erro ao verificar status", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleDisconnect = async (inst: any) => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/whatsapp-manager`;
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "disconnect", instance_id: inst.id }),
      });
      await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", inst.id);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: "Instância desconectada" });
    } catch (err) {
      toast({ title: "Erro ao desconectar", variant: "destructive" });
    }
  };

  const handleResetSession = async (inst: any) => {
    if (!window.confirm(`Resetar a sessão travada da instância "${inst.name}" e tentar gerar um novo QR Code?`)) return;
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/whatsapp-manager`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "reset_session", instance_id: inst.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao resetar sessão");

      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      if (result.qr_code) {
        setSelectedInstance(inst);
        setQrBase64(result.qr_code);
        setQrDialogOpen(true);
        toast({ title: "Sessão resetada. Escaneie o novo QR Code." });
      } else {
        toast({
          title: "Sessão ainda travada na Evolution API",
          description: "A API reiniciou, mas não retornou QR Code. Reinicie a instância/servidor Evolution e tente conectar novamente.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Erro ao resetar sessão", description: (err as Error).message, variant: "destructive" });
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const sanitizedName = sanitizeInstanceName(form.name);
      if (!sanitizedName) {
        throw new Error("Use um nome com letras ou números para a instância.");
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/whatsapp-manager`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "create_instance",
          instance_name: sanitizedName,
          organization_id: organizationId,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao criar instância");
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: "Instância criada com sucesso!" });
      setDialogOpen(false);
      setForm({ name: "", phone: "" });
      if (result.qr_code) {
        setQrBase64(result.qr_code);
        setSelectedInstance({ id: result.instance_id, name: result.instance_name || form.name });
        setQrDialogOpen(true);
      }
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("whatsapp_instances").update({
        name: editForm.name,
        phone: editForm.phone || null,
        api_url: editForm.api_url || null,
        api_key: editForm.api_key || null,
      }).eq("id", editForm.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: "Instância atualizada!" });
      setEditDialogOpen(false);
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_instances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: "Instância excluída!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gradient-primary text-primary-foreground" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Instância
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : instances.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground space-y-2">
          <Smartphone className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p>Nenhuma instância WhatsApp configurada.</p>
          <p className="text-xs mt-1">Adicione uma instância para começar a enviar mensagens.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {instances.map((inst: any) => (
            <Card key={inst.id} className="border-0 shadow-sm">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {inst.status === "connected" ? (
                      <Wifi className="h-4 w-4 text-success" />
                    ) : inst.status === "pairing" ? (
                      <Loader2 className="h-4 w-4 text-warning animate-spin" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-semibold text-foreground">{inst.name}</span>
                  </div>
                  {statusBadge(inst.status)}
                </div>
                {inst.phone && <p className="text-sm text-muted-foreground font-mono">{inst.phone}</p>}
                {inst.api_url ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    <span className="text-success font-medium">API configurada</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="h-3 w-3 text-warning" />
                    <span className="text-warning font-medium">API não configurada</span>
                  </div>
                )}
                <div className="flex justify-end gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="h-8" onClick={() => handleCheckStatus(inst)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Status
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => handleEdit(inst)}>
                    Editar
                  </Button>
                  {inst.status === "connected" ? (
                    <Button variant="outline" size="sm" className="h-8" onClick={() => handleDisconnect(inst)}>
                      <WifiOff className="h-3.5 w-3.5 mr-1" /> Desconectar
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" className="h-8 text-success border-success/30 hover:bg-success/10" onClick={() => handleConnect(inst)}>
                        <QrCode className="h-3.5 w-3.5 mr-1" /> Conectar
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-warning border-warning/30 hover:bg-warning/10" onClick={() => handleResetSession(inst)}>
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Resetar sessão
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={() => {
                    if (window.confirm(`Remover a instância "${inst.name}"? Esta ação não pode ser desfeita.`)) {
                      deleteMutation.mutate(inst.id);
                    }
                  }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Instance Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Instância WhatsApp</DialogTitle>
            <DialogDescription>O sistema criará automaticamente a instância e exibirá o QR Code para pareamento.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nome da Instância *</Label>
              <Input placeholder="Ex: Chip Principal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <p className="text-xs text-muted-foreground">Será convertido automaticamente para letras, números, hífen e underline.</p>
              {form.name && sanitizeInstanceName(form.name) && (
                <p className="text-xs text-muted-foreground">Identificador gerado: <span className="font-mono text-foreground">{sanitizeInstanceName(form.name)}</span></p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Telefone (opcional)</Label>
              <Input placeholder="5511999999999" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-sm text-muted-foreground">
              <p><strong className="text-foreground">⚡ Automático:</strong> A URL e chave da API serão preenchidas automaticamente usando as Configurações Globais do Funecob.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={createMutation.isPending}>
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Criando...</> : "Criar e Parear"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Instance Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Instância</DialogTitle>
            <DialogDescription>Atualize as configurações da instância.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nome da Instância *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input placeholder="5511999999999" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>URL da API</Label>
              <Input placeholder="Preenchido automaticamente" value={editForm.api_url} onChange={(e) => setEditForm({ ...editForm, api_url: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Chave da API</Label>
              <Input type="password" value={editForm.api_key} onChange={(e) => setEditForm({ ...editForm, api_key: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={(open) => { setQrDialogOpen(open); if (!open) { setSelectedInstance(null); setQrBase64(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular → Menu → Dispositivos conectados → Conectar dispositivo → Escaneie o QR Code abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrLoading ? (
              <div className="h-52 w-52 flex items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : qrBase64 ? (
              <>
                <div className="p-3 bg-white rounded-xl shadow-sm">
                  {isQrImageData(qrBase64) ? (
                    <img
                      src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                      alt="QR Code WhatsApp"
                      className="w-52 h-52 object-contain"
                    />
                  ) : (
                    <QRCodeSVG value={qrBase64} size={208} level="M" />
                  )}
                </div>
                <div className="w-full space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Atualiza em <span className="font-mono font-medium text-foreground">{countdown}s</span>
                    </span>
                    <span className="text-[10px]">Verificando conexão...</span>
                  </div>
                  <Progress value={(countdown / 30) * 100} className="h-1.5" />
                </div>
              </>
            ) : (
              <div className="h-52 w-52 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/20 text-center p-4">
                <AlertTriangle className="h-8 w-8 text-warning mb-2" />
                <p className="text-xs text-muted-foreground">Não foi possível obter o QR Code. Verifique as Configurações Globais.</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              {selectedInstance?.name && <span className="font-medium text-foreground">{selectedInstance.name}</span>}
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => selectedInstance && fetchQr(selectedInstance.id)} disabled={qrLoading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Gerar Novo QR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Configurações Anti-Ban ────────────────────────
function AntiBanTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState({
    send_window_start: "08:00",
    send_window_end: "18:00",
    max_per_minute: 3,
    max_per_hour: 60,
    max_per_day: 500,
    min_delay: 30,
    max_delay: 60,
    randomness_level: "medium",
    auto_pause_enabled: true,
    shuffle_order: true,
  });

  const { data: existing } = useQuery({
    queryKey: ["whatsapp-send-config", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_send_config")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (existing) {
      const e = existing as any;
      setConfig({
        send_window_start: (e.send_window_start || "08:00:00").substring(0, 5),
        send_window_end: (e.send_window_end || "18:00:00").substring(0, 5),
        max_per_minute: e.max_per_minute || 3,
        max_per_hour: e.max_per_hour || 60,
        max_per_day: e.max_per_day || 500,
        min_delay: e.min_delay || 30,
        max_delay: e.max_delay || 60,
        randomness_level: e.randomness_level || "medium",
        auto_pause_enabled: e.auto_pause_enabled ?? true,
        shuffle_order: e.shuffle_order ?? true,
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { organization_id: organizationId, ...config } as any;
      if (existing) {
        const { error } = await supabase.from("whatsapp_send_config").update(payload).eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("whatsapp_send_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-send-config"] });
      toast({ title: "Configurações anti-ban salvas!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Proteção Anti-Ban
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Horário início</Label>
              <Select value={config.send_window_start} onValueChange={(v) => setConfig({ ...config, send_window_start: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {Array.from({ length: 48 }, (_, i) => {
                    const h = String(Math.floor(i / 2)).padStart(2, "0");
                    const m = i % 2 === 0 ? "00" : "30";
                    return `${h}:${m}`;
                  }).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Horário fim</Label>
              <Select value={config.send_window_end} onValueChange={(v) => setConfig({ ...config, send_window_end: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {Array.from({ length: 48 }, (_, i) => {
                    const h = String(Math.floor(i / 2)).padStart(2, "0");
                    const m = i % 2 === 0 ? "00" : "30";
                    return `${h}:${m}`;
                  }).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Máx/minuto</Label>
              <Select value={String(config.max_per_minute)} onValueChange={(v) => setConfig({ ...config, max_per_minute: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Máx/hora</Label>
              <Select value={String(config.max_per_hour)} onValueChange={(v) => setConfig({ ...config, max_per_hour: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {[10,20,30,40,50,60,80,100,120,150,200].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Máx/dia</Label>
              <Select value={String(config.max_per_day)} onValueChange={(v) => setConfig({ ...config, max_per_day: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {[50,100,200,300,500,700,1000,1500,2000].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Delay mínimo (seg)</Label>
              <Select value={String(config.min_delay)} onValueChange={(v) => setConfig({ ...config, min_delay: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5,10,15,20,25,30,45,60,90,120].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}s</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Delay máximo (seg)</Label>
              <Select value={String(config.max_delay)} onValueChange={(v) => setConfig({ ...config, max_delay: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10,20,30,45,60,90,120,180,240,300].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}s</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nível de Aleatoriedade</Label>
            <Select value={config.randomness_level} onValueChange={(v) => setConfig({ ...config, randomness_level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixo (mensagens iguais)</SelectItem>
                <SelectItem value="medium">Médio (variação sutil)</SelectItem>
                <SelectItem value="high">Alto (variação completa + emojis)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Pausa automática</p>
                <p className="text-xs text-muted-foreground">Pausar envios se detectar risco de ban</p>
              </div>
              <input type="checkbox" checked={config.auto_pause_enabled} onChange={(e) => setConfig({ ...config, auto_pause_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Embaralhar ordem</p>
                <p className="text-xs text-muted-foreground">Ordem aleatória de envio (anti-padrão)</p>
              </div>
              <input type="checkbox" checked={config.shuffle_order} onChange={(e) => setConfig({ ...config, shuffle_order: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary" />
            </div>
          </div>

          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              Quanto maior o delay e menor o limite, menor o risco de bloqueio do chip. Recomendamos delay mínimo de 30s e máximo de 3 msgs/minuto.
            </p>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gradient-primary text-primary-foreground w-full">
            {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Monitoramento ─────────────────────────────────
function MonitorTab({ organizationId }: { organizationId: string }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["robot-monitor", organizationId],
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [sentToday, failedToday, queuePending, sentWeek, failedWeek, retryCount] = await Promise.all([
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "sent").gte("sent_at", todayStart),
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "failed").gte("created_at", todayStart),
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["queued", "sending", "retry"]),
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "sent").gte("sent_at", weekAgo),
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "failed").gte("created_at", weekAgo),
        supabase.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "retry"),
      ]);

      const totalWeek = (sentWeek.count || 0) + (failedWeek.count || 0);
      const successRate = totalWeek > 0 ? Math.round(((sentWeek.count || 0) / totalWeek) * 100) : 100;

      return {
        sentToday: sentToday.count || 0,
        failedToday: failedToday.count || 0,
        queuePending: queuePending.count || 0,
        sentWeek: sentWeek.count || 0,
        failedWeek: failedWeek.count || 0,
        retryCount: retryCount.count || 0,
        successRate,
      };
    },
    enabled: !!organizationId,
    refetchInterval: 30000,
  });

  // Robot status inference
  const robotStatus = !stats ? "loading" : stats.queuePending > 0 ? "active" : "idle";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`h-3 w-3 rounded-full ${robotStatus === "active" ? "bg-success animate-pulse" : robotStatus === "idle" ? "bg-muted-foreground" : "bg-warning animate-pulse"}`} />
        <span className="text-sm font-medium text-foreground">
          Robô: {robotStatus === "active" ? "Ativo — processando fila" : robotStatus === "idle" ? "Ocioso — fila vazia" : "Carregando..."}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-success">{stats.sentToday}</p>
                <p className="text-xs text-muted-foreground">Enviadas Hoje</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{stats.failedToday}</p>
                <p className="text-xs text-muted-foreground">Falhas Hoje</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-warning">{stats.queuePending}</p>
                <p className="text-xs text-muted-foreground">Na Fila</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{stats.successRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa Sucesso (7d)</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Resumo Semanal</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Enviadas (7 dias)</span>
                <span className="font-medium text-foreground">{stats.sentWeek}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Falhas (7 dias)</span>
                <span className="font-medium text-destructive">{stats.failedWeek}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Em retry</span>
                <span className="font-medium text-warning">{stats.retryCount}</span>
              </div>
              <div className="pt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Taxa de sucesso</span>
                  <span>{stats.successRate}%</span>
                </div>
                <Progress value={stats.successRate} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────
export default function WhatsApp() {
  const { organizationId } = useOrganization();
  const [tab, setTab] = useState("mensagens");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Gerencie mensagens, campanhas e instâncias</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="mensagens" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Msgs</span>
            </TabsTrigger>
            <TabsTrigger value="fila" className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Fila</span>
            </TabsTrigger>
            <TabsTrigger value="massa" className="gap-1.5">
              <Radio className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Massa</span>
            </TabsTrigger>
            <TabsTrigger value="campanhas" className="gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Camp.</span>
            </TabsTrigger>
            <TabsTrigger value="parear" className="gap-1.5">
              <Smartphone className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Parear</span>
            </TabsTrigger>
            <TabsTrigger value="antiban" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Anti-Ban</span>
            </TabsTrigger>
            <TabsTrigger value="monitor" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Monitor</span>
            </TabsTrigger>
          </TabsList>

          {organizationId && (
            <>
              <TabsContent value="mensagens"><MessagesTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="fila"><QueueTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="massa"><BulkTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="campanhas"><CampaignsTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="parear"><PairTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="antiban"><AntiBanTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="monitor"><MonitorTab organizationId={organizationId} /></TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
