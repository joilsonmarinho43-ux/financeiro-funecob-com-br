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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrganization } from "@/hooks/useOrganization";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollText, Search, Filter } from "lucide-react";

export default function SystemLogs() {
  const { organizationId } = useOrganization();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const { data: logs = [] } = useQuery({
    queryKey: ["system-logs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("system_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const actions = [...new Set(logs.map((l: any) => l.action))];
  const filtered = logs.filter((l: any) => {
    const matchSearch = l.action.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(l.details || {}).toLowerCase().includes(search.toLowerCase());
    const matchAction = actionFilter === "all" || l.action === actionFilter;
    return matchSearch && matchAction;
  });

  const actionColors: Record<string, string> = {
    login: "default",
    logout: "secondary",
    create: "default",
    update: "secondary",
    delete: "destructive",
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs do Sistema</h1>
          <p className="text-muted-foreground text-sm">Registro de atividades para auditoria e segurança</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ScrollText className="h-4 w-4" /> Atividades Recentes
              </CardTitle>
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-32">
                    <Filter className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {actions.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ação</TableHead>
                    <TableHead>Detalhes</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Navegador</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum log registrado</TableCell></TableRow>
                  ) : filtered.map((log: any) => {
                    const variant = actionColors[log.action] || "secondary";
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant={variant as any} className="text-xs">{log.action}</Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[250px] truncate">
                          {typeof log.details === "object" ? JSON.stringify(log.details) : log.details || "-"}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{log.ip_address || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[150px] truncate" title={(log as any).user_agent || ""}>{(log as any).user_agent?.slice(0, 30) || "-"}</TableCell>
                        <TableCell className="text-sm">{format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
