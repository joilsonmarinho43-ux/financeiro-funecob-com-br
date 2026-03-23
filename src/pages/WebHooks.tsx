import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Webhook, Plus, Activity, Trash2 } from "lucide-react";

export default function WebHooks() {
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const { data: webhooks = [] } = useQuery({
    queryKey: ["webhooks", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("webhook_configs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["webhook-logs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Sem organização");
      const { error } = await supabase.from("webhook_configs").insert({
        organization_id: organizationId,
        name,
        url,
        events: ["payment.received", "invoice.created", "invoice.overdue"],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setOpen(false);
      setName("");
      setUrl("");
      toast({ title: "Webhook criado!" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast({ title: "Webhook removido!" });
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">WebHooks</h1>
            <p className="text-muted-foreground text-sm">Configure e monitore webhooks</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo Webhook</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Webhook</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input placeholder="Ex: Notificação de pagamento" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input placeholder="https://seu-site.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>
                <Button onClick={() => createMutation.mutate()} disabled={!name || !url || createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Salvando..." : "Criar Webhook"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {webhooks.map((wh: any) => (
            <Card key={wh.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Webhook className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{wh.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{wh.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={wh.active ? "default" : "secondary"}>{wh.active ? "Ativo" : "Inativo"}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => {
                      if (window.confirm(`Remover webhook "${wh.name}"?`)) deleteMutation.mutate(wh.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {webhooks.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="p-8 text-center text-muted-foreground">
                <Webhook className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum webhook configurado</p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Logs Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhum log registrado</TableCell></TableRow>
                  ) : logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">{log.event}</TableCell>
                      <TableCell>
                        <Badge variant={log.response_status && log.response_status < 400 ? "default" : "destructive"} className="text-xs">
                          {log.response_status || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
