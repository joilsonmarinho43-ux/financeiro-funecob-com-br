import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useOrganization } from "@/hooks/useOrganization";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle, Search, Send, CheckCircle, XCircle } from "lucide-react";

export default function SMS() {
  const { organizationId } = useOrganization();
  const [search, setSearch] = useState("");

  const { data: messages = [] } = useQuery({
    queryKey: ["sms-messages", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("sms_messages")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const filtered = messages.filter((m: any) =>
    m.phone.includes(search) || m.message.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: messages.length,
    sent: messages.filter((m: any) => m.status === "sent").length,
    failed: messages.filter((m: any) => m.status === "failed").length,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SMS & Comunicação</h1>
          <p className="text-muted-foreground text-sm">Envie e monitore notificações via SMS</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Enviados</p>
                <p className="text-lg font-bold text-foreground">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Entregues</p>
                <p className="text-lg font-bold text-foreground">{stats.sent}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Falhas</p>
                <p className="text-lg font-bold text-foreground">{stats.failed}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-4 w-4" /> Mensagens SMS
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar telefone ou mensagem..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma mensagem SMS encontrada</TableCell></TableRow>
                  ) : filtered.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm font-mono">{m.phone}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{m.message}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === "sent" ? "default" : m.status === "failed" ? "destructive" : "secondary"} className="text-xs">
                          {m.status === "sent" ? "Enviado" : m.status === "failed" ? "Falha" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
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
