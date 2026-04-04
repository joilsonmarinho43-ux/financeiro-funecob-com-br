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
import { format, parseISO } from "date-fns";
import {
  MessageSquare, Send, Radio, Megaphone, Smartphone,
  Plus, Trash2, Search, Wifi, WifiOff, Clock, CheckCircle2,
  XCircle, Loader2, AlertTriangle, QrCode, RefreshCw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ─── Helpers ────────────────────────────────────────────
const statusBadge = (status: string) => {
  const map: Record<string, { cls: string; label: string }> = {
    connected: { cls: "bg-success/10 text-success border-0", label: "Conectado" },
    disconnected: { cls: "bg-destructive/10 text-destructive border-0", label: "Desconectado" },
    pairing: { cls: "bg-warning/10 text-warning border-0", label: "Pareando" },
    pending: { cls: "bg-warning/10 text-warning border-0", label: "Pendente" },
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
  };
  const s = map[status] || { cls: "bg-muted text-muted-foreground border-0", label: status };
  return <Badge className={s.cls}>{s.label}</Badge>;
};

// ─── Tab: Mensagens ─────────────────────────────────────
function MessagesTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ phone: "", message: "" });

  const { data: queueItems = [] } = useQuery({
    queryKey: ["whatsapp-queue", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_queue")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
    refetchInterval: 10000,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["whatsapp-messages", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*, clients(name)")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
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
      toast({ title: "Mensagem enviada para a fila de processamento!" });
      setDialogOpen(false);
      setForm({ phone: "", message: "" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  // Delete history by client
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

  // Delete ALL history
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

  const filtered = messages.filter((m: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return m.phone.includes(s) || m.message.toLowerCase().includes(s) || (m.clients?.name || "").toLowerCase().includes(s);
  });

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
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhuma mensagem encontrada.</div>
      ) : (
        <div className="space-y-4">
          {queueItems.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Fila de Processamento ({queueItems.filter((q: any) => q.status === "queued" || q.status === "sending").length} pendentes)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Mensagem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Erro VPS</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueItems.slice(0, 20).map((q: any) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-mono text-sm">{q.phone}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{q.message}</TableCell>
                          <TableCell>{statusBadge(q.status)}</TableCell>
                          <TableCell className="max-w-[250px] text-xs text-destructive">{q.error_message || "—"}</TableCell>
                          <TableCell className="text-sm">{format(parseISO(q.created_at), "dd/MM/yy HH:mm")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

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
                {filtered.map((m: any) => (
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
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["whatsapp-queue", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_queue")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const stats = {
    queued: queue.filter((q: any) => q.status === "queued").length,
    sending: queue.filter((q: any) => q.status === "sending").length,
    sent: queue.filter((q: any) => q.status === "sent").length,
    failed: queue.filter((q: any) => q.status === "failed").length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Na Fila", value: stats.queued, icon: Clock, cls: "gradient-primary" },
          { label: "Enviando", value: stats.sending, icon: Loader2, cls: "gradient-warning" },
          { label: "Enviados", value: stats.sent, icon: CheckCircle2, cls: "gradient-success" },
          { label: "Falhas", value: stats.failed, icon: XCircle, cls: "gradient-danger" },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`h-9 w-9 rounded-lg ${s.cls} flex items-center justify-center`}>
                <s.icon className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : queue.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Fila vazia no momento.</div>
      ) : (
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
  });

  const sendBulk = useMutation({
    mutationFn: async () => {
      const phones = form.phones
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      if (phones.length === 0) throw new Error("Informe ao menos um telefone");

      const items = phones.map((phone, i) => ({
        organization_id: organizationId,
        phone,
        message: form.message,
        status: "queued" as const,
        campaign_id: null,
        scheduled_for: new Date(Date.now() + i * (Math.random() * (parseInt(form.maxDelay) - parseInt(form.minDelay)) + parseInt(form.minDelay)) * 1000).toISOString(),
      }));

      const { error } = await supabase.from("whatsapp_queue").insert(items);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-queue"] });
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
      toast({ title: "Campanha removida!" });
    },
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
                <TableHead>Contatos</TableHead>
                <TableHead>Enviados</TableHead>
                <TableHead>Falhas</TableHead>
                <TableHead>Delay</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.message}</TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell>{c.total_contacts}</TableCell>
                  <TableCell className="text-success">{c.sent_count}</TableCell>
                  <TableCell className="text-destructive">{c.failed_count}</TableCell>
                  <TableCell className="text-xs">{c.min_delay}-{c.max_delay}s</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                      <Trash2 className="h-4 w-4" />
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
              <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} required />
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
                {createMutation.isPending ? "Criando..." : "Criar Campanha"}
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
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const statusPollRef = useRef<NodeJS.Timeout | null>(null);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [editForm, setEditForm] = useState({ id: "", name: "", phone: "", api_url: "", api_key: "" });

  // Auto-refresh QR every 30s
  const fetchQr = useCallback(async (instId: string) => {
    setQrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-manager", {
        body: { action: "get_qr", instance_id: instId },
      });
      if (error) throw error;
      setQrBase64(data?.qr_code || null);
    } catch (e: any) {
      console.error("QR fetch error:", e);
      toast({ title: "Erro ao obter QR Code", description: e.message, variant: "destructive" });
    } finally {
      setQrLoading(false);
      setCountdown(30);
    }
  }, [toast]);

  // Poll status every 5s while QR dialog is open
  useEffect(() => {
    if (!qrDialogOpen || !selectedInstance) return;
    statusPollRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("whatsapp-manager", {
          body: { action: "check_status", instance_id: selectedInstance.id },
        });
        if (data?.status === "connected") {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
          toast({ title: "WhatsApp conectado com sucesso! ✅" });
          setQrDialogOpen(false);
          setSelectedInstance(null);
        }
      } catch {}
    }, 5000);
    return () => { if (statusPollRef.current) clearInterval(statusPollRef.current); };
  }, [qrDialogOpen, selectedInstance, queryClient, toast]);

  // Countdown timer
  useEffect(() => {
    if (!qrDialogOpen || qrLoading) return;
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (selectedInstance) fetchQr(selectedInstance.id);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [qrDialogOpen, qrLoading, selectedInstance, fetchQr]);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["whatsapp-instances", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_instances").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-manager", {
        body: {
          action: "create_instance",
          instance_name: form.name.replace(/\s+/g, "_").toLowerCase(),
          organization_id: organizationId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: "Instância criada! Escaneie o QR Code para conectar." });
      setDialogOpen(false);
      setForm({ name: "", phone: "" });
      // Open QR dialog immediately
      if (data?.instance_id) {
        setSelectedInstance({ id: data.instance_id, name: data.instance_name });
        setQrBase64(data.qr_code || null);
        setQrDialogOpen(true);
        setCountdown(30);
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
      toast({ title: "Instância removida!" });
    },
  });

  const handleEdit = (inst: any) => {
    setEditForm({
      id: inst.id,
      name: inst.name,
      phone: inst.phone || "",
      api_url: inst.api_url || "",
      api_key: inst.api_key || "",
    });
    setEditDialogOpen(true);
  };

  const handleConnect = async (inst: any) => {
    setSelectedInstance(inst);
    setQrBase64(null);
    setQrDialogOpen(true);
    await fetchQr(inst.id);
  };

  const handleDisconnect = async (inst: any) => {
    try {
      await supabase.functions.invoke("whatsapp-manager", {
        body: { action: "disconnect", instance_id: inst.id },
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: "WhatsApp desconectado." });
    } catch {
      await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", inst.id);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: "WhatsApp desconectado." });
    }
  };

  const handleCheckStatus = async (inst: any) => {
    try {
      const { data } = await supabase.functions.invoke("whatsapp-manager", {
        body: { action: "check_status", instance_id: inst.id },
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      toast({ title: `Status: ${data?.status === "connected" ? "Conectado ✅" : data?.status === "pairing" ? "Pareando..." : "Desconectado ❌"}` });
    } catch (e: any) {
      toast({ title: "Erro ao verificar", description: e.message, variant: "destructive" });
    }
  };

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
        <div className="text-center py-12 text-muted-foreground">
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
                    <Button variant="outline" size="sm" className="h-8 text-success border-success/30 hover:bg-success/10" onClick={() => handleConnect(inst)}>
                      <QrCode className="h-3.5 w-3.5 mr-1" /> Conectar
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={() => deleteMutation.mutate(inst.id)}>
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
              <p className="text-xs text-muted-foreground">Será usado como identificador na API. Sem espaços ou caracteres especiais.</p>
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
                  <img
                    src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                    alt="QR Code WhatsApp"
                    className="w-52 h-52 object-contain"
                  />
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
  });

  useState(() => {
    if (existing) {
      setConfig({
        send_window_start: (existing as any).send_window_start || "08:00",
        send_window_end: (existing as any).send_window_end || "18:00",
        max_per_minute: (existing as any).max_per_minute || 3,
        max_per_hour: (existing as any).max_per_hour || 60,
        max_per_day: (existing as any).max_per_day || 500,
        min_delay: (existing as any).min_delay || 30,
        max_delay: (existing as any).max_delay || 60,
        randomness_level: (existing as any).randomness_level || "medium",
        auto_pause_enabled: (existing as any).auto_pause_enabled ?? true,
        shuffle_order: (existing as any).shuffle_order ?? true,
      });
    }
  });

  // Sync existing data
  if (existing && config.send_window_start === "08:00" && (existing as any).send_window_start !== "08:00:00") {
    // will update on next effect
  }

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
          {/* Send Window */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Horário início</Label>
              <Input type="time" value={config.send_window_start} onChange={(e) => setConfig({ ...config, send_window_start: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Horário fim</Label>
              <Input type="time" value={config.send_window_end} onChange={(e) => setConfig({ ...config, send_window_end: e.target.value })} />
            </div>
          </div>

          {/* Rate Limits */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Máx/minuto</Label>
              <Input type="number" min="1" max="10" value={config.max_per_minute} onChange={(e) => setConfig({ ...config, max_per_minute: parseInt(e.target.value) || 3 })} />
            </div>
            <div className="space-y-2">
              <Label>Máx/hora</Label>
              <Input type="number" min="1" max="200" value={config.max_per_hour} onChange={(e) => setConfig({ ...config, max_per_hour: parseInt(e.target.value) || 60 })} />
            </div>
            <div className="space-y-2">
              <Label>Máx/dia</Label>
              <Input type="number" min="1" max="2000" value={config.max_per_day} onChange={(e) => setConfig({ ...config, max_per_day: parseInt(e.target.value) || 500 })} />
            </div>
          </div>

          {/* Delay */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Delay mínimo (seg)</Label>
              <Input type="number" min="5" max="120" value={config.min_delay} onChange={(e) => setConfig({ ...config, min_delay: parseInt(e.target.value) || 30 })} />
            </div>
            <div className="space-y-2">
              <Label>Delay máximo (seg)</Label>
              <Input type="number" min="10" max="300" value={config.max_delay} onChange={(e) => setConfig({ ...config, max_delay: parseInt(e.target.value) || 60 })} />
            </div>
          </div>

          {/* Randomness */}
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

          {/* Toggles */}
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
          <TabsList className="grid w-full grid-cols-6">
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
          </TabsList>

          {organizationId && (
            <>
              <TabsContent value="mensagens"><MessagesTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="fila"><QueueTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="massa"><BulkTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="campanhas"><CampaignsTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="parear"><PairTab organizationId={organizationId} /></TabsContent>
              <TabsContent value="antiban"><AntiBanTab organizationId={organizationId} /></TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
