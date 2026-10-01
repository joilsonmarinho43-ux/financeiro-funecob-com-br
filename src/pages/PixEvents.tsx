import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

const statuses = new Set(["conciliado", "pendente_revisao", "processando", "recebido"]);

export default function PixEvents() {
  const { organizationId, isLoading: loadingOrganization } = useOrganization();
  const [params] = useSearchParams();
  const status = params.get("status");
  const activeStatus = status && statuses.has(status) ? status : null;

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["pix-events", organizationId, activeStatus],
    enabled: !!organizationId,
    queryFn: async () => {
      let query = supabase.from("auto_settlement_events")
        .select("id, status, amount_detected, created_at, error_message, clients(name)")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false }).limit(100);
      if (activeStatus === "processando") query = query.in("status", ["processando", "recebido"]);
      else if (activeStatus) query = query.eq("status", activeStatus);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <AppLayout>
      <Card>
        <CardHeader>
          <CardTitle>Eventos PIX da organização</CardTitle>
          <p className="text-sm text-muted-foreground">Consulta de comprovantes recebidos. Eventos pendentes exigem conferência antes de qualquer baixa.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {error ? <p role="alert" className="text-destructive">Não foi possível carregar os eventos PIX.</p> :
            loadingOrganization || isLoading ? <p>Carregando eventos…</p> :
            !organizationId ? <p>Organização não identificada.</p> :
            events.length === 0 ? <p>Nenhum evento encontrado.</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead><TableHead>Observação</TableHead>
                </TableRow></TableHeader>
                <TableBody>{events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{format(new Date(event.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell><Badge variant={event.status === "conciliado" ? "default" : "secondary"}>{event.status}</Badge></TableCell>
                    <TableCell>{event.clients?.name || "Não identificado"}</TableCell>
                    <TableCell>{event.amount_detected == null ? "—" : Number(event.amount_detected).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{event.error_message || "—"}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
