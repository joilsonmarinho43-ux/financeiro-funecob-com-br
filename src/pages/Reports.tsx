import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useOrganization } from "@/hooks/useOrganization";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { BarChart3, Download } from "lucide-react";
import { formatCurrency } from "@/lib/format";

const COLORS = [
  "hsl(199, 89%, 48%)",
  "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 65%, 60%)",
  "hsl(0, 72%, 51%)",
];

export default function Reports() {
  const { organizationId } = useOrganization();
  const [period, setPeriod] = useState("6");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["report-invoices", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*, clients(name)")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["report-transactions", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const months = useMemo(() => {
    const count = parseInt(period);
    const result: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      result.push({
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM/yy", { locale: ptBR }),
        start: startOfMonth(d),
        end: endOfMonth(d),
      });
    }
    return result;
  }, [period]);

  // Monthly bar chart data
  const barData = useMemo(() => {
    return months.map((m) => {
      const monthInvoices = invoices.filter((inv) => {
        const d = parseISO(inv.due_date);
        return d >= m.start && d <= m.end;
      });
      const recebido = monthInvoices
        .filter((i) => i.status === "pago")
        .reduce((s, i) => s + Number(i.amount), 0);
      const aberto = monthInvoices
        .filter((i) => i.status === "aberto")
        .reduce((s, i) => s + Number(i.amount), 0);
      return { name: m.label, Recebido: recebido, "Em Aberto": aberto };
    });
  }, [months, invoices]);

  // Pie chart: status breakdown
  const pieData = useMemo(() => {
    const pago = invoices.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.amount), 0);
    const aberto = invoices.filter((i) => i.status === "aberto").reduce((s, i) => s + Number(i.amount), 0);
    const cancelado = invoices.filter((i) => i.status === "cancelado").reduce((s, i) => s + Number(i.amount), 0);
    return [
      { name: "Pago", value: pago },
      { name: "Em Aberto", value: aberto },
      { name: "Cancelado", value: cancelado },
    ].filter((d) => d.value > 0);
  }, [invoices]);

  // Detailed table: per-month breakdown
  const detailRows = useMemo(() => {
    return months.map((m) => {
      const mInv = invoices.filter((inv) => {
        const d = parseISO(inv.due_date);
        return d >= m.start && d <= m.end;
      });
      const mTx = transactions.filter((tx) => {
        const d = parseISO(tx.transaction_date);
        return d >= m.start && d <= m.end;
      });
      const recebido = mInv.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.amount), 0);
      const aberto = mInv.filter((i) => i.status === "aberto").reduce((s, i) => s + Number(i.amount), 0);
      const entradas = mTx.filter((t) => t.type === "entrada" || t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
      const saidas = mTx.filter((t) => t.type === "saida" || t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
      return {
        label: m.label,
        recebido,
        aberto,
        entradas,
        saidas,
        saldo: recebido + entradas - saidas,
      };
    });
  }, [months, invoices, transactions]);

  const totals = useMemo(() => {
    return detailRows.reduce(
      (acc, r) => ({
        recebido: acc.recebido + r.recebido,
        aberto: acc.aberto + r.aberto,
        entradas: acc.entradas + r.entradas,
        saidas: acc.saidas + r.saidas,
        saldo: acc.saldo + r.saldo,
      }),
      { recebido: 0, aberto: 0, entradas: 0, saidas: 0, saldo: 0 }
    );
  }, [detailRows]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
            <p className="text-sm text-muted-foreground">Gráficos e detalhamento financeiro</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recebido vs Em Aberto</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-[280px]">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      width={70}
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v: number) => {
                        if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
                        if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(1).replace(".", ",")}k`;
                        return `R$${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
                      }}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Bar dataKey="Recebido" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Em Aberto" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Distribuição por Status</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                  Sem dados
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      labelLine={false}
                      label={({ percent }) =>
                        (percent ?? 0) >= 0.08 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ""
                      }
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detalhamento Mensal</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Em Aberto</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                    <TableHead className="text-right">Saídas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium capitalize">{row.label}</TableCell>
                      <TableCell className="text-right text-success">{formatCurrency(row.recebido)}</TableCell>
                      <TableCell className="text-right text-warning">{formatCurrency(row.aberto)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.entradas)}</TableCell>
                      <TableCell className="text-right text-destructive">{formatCurrency(row.saidas)}</TableCell>
                      <TableCell className={`text-right font-semibold ${row.saldo >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(row.saldo)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(totals.recebido)}</TableCell>
                    <TableCell className="text-right text-warning">{formatCurrency(totals.aberto)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.entradas)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(totals.saidas)}</TableCell>
                    <TableCell className={`text-right ${totals.saldo >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(totals.saldo)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
