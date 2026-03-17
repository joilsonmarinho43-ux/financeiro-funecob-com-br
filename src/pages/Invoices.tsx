import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { format, parseISO, isAfter, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Search, CalendarIcon, CheckCircle2, Receipt, DollarSign,
  AlertTriangle, Clock, Download, FileSpreadsheet, FileText,
} from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/exportInvoices";

type Invoice = Tables<"invoices"> & { clients?: { name: string } | null };

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Invoices() {
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [payDialog, setPayDialog] = useState<Invoice | null>(null);
  const [paidDate, setPaidDate] = useState<Date | undefined>(new Date());

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, clients(name)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!organizationId,
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, paid_date }: { id: string; paid_date: string }) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "pago", paid_date })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financial"] });
      toast({ title: "Fatura marcada como paga!" });
      setPayDialog(null);
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "cancelado" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Fatura cancelada!" });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "aberto", paid_date: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Fatura reaberta!" });
    },
  });

  // Filtering
  const today = startOfDay(new Date());
  const filtered = invoices.filter((inv) => {
    if (statusFilter === "aberto" && inv.status !== "aberto") return false;
    if (statusFilter === "pago" && inv.status !== "pago") return false;
    if (statusFilter === "vencido") {
      if (inv.status !== "aberto") return false;
      if (!isBefore(parseISO(inv.due_date), today)) return false;
    }
    if (statusFilter === "cancelado" && inv.status !== "cancelado") return false;

    if (search) {
      const s = search.toLowerCase();
      const clientName = (inv.clients?.name || "").toLowerCase();
      const desc = (inv.description || "").toLowerCase();
      if (!clientName.includes(s) && !desc.includes(s)) return false;
    }

    if (dateFrom && isBefore(parseISO(inv.due_date), startOfDay(dateFrom))) return false;
    if (dateTo && isAfter(parseISO(inv.due_date), startOfDay(dateTo))) return false;

    return true;
  });

  const totalAberto = invoices.filter((i) => i.status === "aberto").reduce((s, i) => s + Number(i.amount), 0);
  const totalPago = invoices.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.amount), 0);
  const totalVencido = invoices
    .filter((i) => i.status === "aberto" && isBefore(parseISO(i.due_date), today))
    .reduce((s, i) => s + Number(i.amount), 0);

  const statusBadge = (inv: Invoice) => {
    const isOverdue = inv.status === "aberto" && isBefore(parseISO(inv.due_date), today);
    if (isOverdue)
      return <Badge className="bg-destructive/10 text-destructive border-0">Vencida</Badge>;
    switch (inv.status) {
      case "pago":
        return <Badge className="bg-success/10 text-success border-0">Pago</Badge>;
      case "cancelado":
        return <Badge className="bg-muted text-muted-foreground border-0">Cancelado</Badge>;
      default:
        return <Badge className="bg-warning/10 text-warning border-0">Em aberto</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro — Faturas</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie todas as faturas da organização
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Em Aberto", value: totalAberto, icon: Clock, cls: "gradient-primary" },
            { label: "Recebido", value: totalPago, icon: CheckCircle2, cls: "gradient-success" },
            { label: "Vencido", value: totalVencido, icon: AlertTriangle, cls: "gradient-danger" },
          ].map((s) => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`h-10 w-10 rounded-xl ${s.cls} flex items-center justify-center`}>
                  <s.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(s.value)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente ou descrição..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="aberto">Em aberto</SelectItem>
                  <SelectItem value="vencido">Vencidas</SelectItem>
                  <SelectItem value="pago">Pagas</SelectItem>
                  <SelectItem value="cancelado">Canceladas</SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yy") : "De"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" locale={ptBR} />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yy") : "Até"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" locale={ptBR} />
                </PopoverContent>
              </Popover>

              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                  Limpar datas
                </Button>
              )}

              <div className="flex gap-1 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => exportToExcel(filtered)}
                  disabled={filtered.length === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => exportToPDF(filtered)}
                  disabled={filtered.length === 0}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma fatura encontrada.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pago em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.clients?.name || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{inv.description || "—"}</TableCell>
                        <TableCell>{format(parseISO(inv.due_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(inv.amount))}</TableCell>
                        <TableCell>{statusBadge(inv)}</TableCell>
                        <TableCell>{inv.paid_date ? format(parseISO(inv.paid_date), "dd/MM/yyyy") : "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {inv.status === "aberto" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-success border-success/30 hover:bg-success/10"
                                  onClick={() => { setPayDialog(inv); setPaidDate(new Date()); }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Baixa
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-destructive"
                                  onClick={() => cancelMutation.mutate(inv.id)}
                                >
                                  Cancelar
                                </Button>
                              </>
                            )}
                            {(inv.status === "pago" || inv.status === "cancelado") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8"
                                onClick={() => reopenMutation.mutate(inv.id)}
                              >
                                Reabrir
                              </Button>
                            )}
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
      </div>

      {/* Pay confirmation dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>
              Confirme a data de pagamento desta fatura.
            </DialogDescription>
          </DialogHeader>
          {payDialog && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
                <p><span className="font-medium">Cliente:</span> {payDialog.clients?.name}</p>
                <p><span className="font-medium">Valor:</span> {formatCurrency(Number(payDialog.amount))}</p>
                <p><span className="font-medium">Vencimento:</span> {format(parseISO(payDialog.due_date), "dd/MM/yyyy")}</p>
              </div>

              <div className="space-y-2">
                <Label>Data do Pagamento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !paidDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {paidDate ? format(paidDate, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={paidDate} onSelect={setPaidDate} className="p-3 pointer-events-auto" locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
                <Button
                  className="gradient-primary text-primary-foreground"
                  disabled={!paidDate || payMutation.isPending}
                  onClick={() => {
                    if (paidDate && payDialog) {
                      payMutation.mutate({
                        id: payDialog.id,
                        paid_date: format(paidDate, "yyyy-MM-dd"),
                      });
                    }
                  }}
                >
                  {payMutation.isPending ? "Salvando..." : "Confirmar Pagamento"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
