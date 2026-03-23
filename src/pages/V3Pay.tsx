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
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditCard, Search, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

export default function V3Pay() {
  const { organizationId } = useOrganization();
  const [search, setSearch] = useState("");

  const { data: transactions = [] } = useQuery({
    queryKey: ["v3pay-transactions", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("*, invoices(clients(name))")
        .eq("organization_id", organizationId)
        .order("transaction_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const filtered = transactions.filter((t: any) =>
    (t.description || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.invoices?.clients?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalReceitas = transactions.filter((t: any) => t.type === "entrada" || t.type === "receita").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalDespesas = transactions.filter((t: any) => t.type === "saida" || t.type === "despesa").reduce((s: number, t: any) => s + Number(t.amount), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">V3Pay / Pagamentos</h1>
          <p className="text-muted-foreground text-sm">Gerencie transações integradas</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receitas</p>
                <p className="text-lg font-bold text-foreground">R$ {totalReceitas.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Despesas</p>
                <p className="text-lg font-bold text-foreground">R$ {totalDespesas.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className="text-lg font-bold text-foreground">R$ {(totalReceitas - totalDespesas).toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Transações Recentes
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma transação encontrada</TableCell></TableRow>
                  ) : filtered.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{format(parseISO(t.transaction_date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                      <TableCell className="text-sm">{t.description || "-"}</TableCell>
                      <TableCell className="text-sm">{t.invoices?.clients?.name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "entrada" || t.type === "receita" ? "default" : "destructive"} className="text-xs">
                          {t.type === "entrada" || t.type === "receita" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">R$ {Number(t.amount).toFixed(2)}</TableCell>
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
