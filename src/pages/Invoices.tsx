import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tables } from "@/integrations/supabase/types";
import { AppLayout } from "@/components/AppLayout";
import { auditLog } from "@/lib/auditLog";
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
  AlertTriangle, Clock, Download, FileSpreadsheet, FileText, Send,
} from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/exportInvoices";

type Invoice = Tables<"invoices"> & { clients?: { name: string } | null };

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Invoices() {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
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
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*, clients(name)")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!organizationId,
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, paid_date, invoice }: { id: string; paid_date: string; invoice: Invoice }) => {
      // 1. Idempotency check — if already paid, skip
      const { data: current } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", id)
        .single();
      if (current?.status === "pago") {
        return { alreadyPaid: true };
      }

      // 2. Atomic update — mark as paid
      const { error } = await supabase
        .from("invoices")
        .update({ status: "pago", paid_date })
        .eq("id", id)
        .eq("status", "aberto"); // optimistic lock
      if (error) throw error;

      // 3. Cancel pending reminders for this invoice
      await supabase
        .from("billing_reminders")
        .update({ status: "cancelled" } as any)
        .eq("invoice_id", id)
        .eq("status", "pending");

      // 4. Cancel queued WhatsApp messages for this invoice's client phone
      // (best effort)

      // 5. Send baixa confirmation via WhatsApp (async, resilient)
      try {
        if (organizationId) {
          const { data: client } = await supabase
            .from("clients")
            .select("name, phone")
            .eq("id", invoice.client_id)
            .single();

          if (client?.phone) {
            const { data: settings } = await supabase
              .from("billing_settings")
              .select("template_baixa")
              .eq("organization_id", organizationId)
              .maybeSingle();

            const amount = Number(invoice.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const template = settings?.template_baixa || "Pagamento confirmado! ✅\nCliente: {nome}\nValor: {valor}";
            const message = template
              .replace(/{nome}/g, client.name || "Cliente")
              .replace(/{valor}/g, amount)
              .replace(/{data_pagamento}/g, paid_date.split("-").reverse().join("/"));

            await supabase.functions.invoke("send-now", {
              body: { phone: client.phone, message, organization_id: organizationId },
            });
          }
        }
      } catch {
        // WhatsApp send failure must not block payment confirmation
      }

      // 6. Audit log
      auditLog({
        action: "baixa_manual",
        organizationId,
        details: { invoice_id: id, paid_date, amount: invoice.amount, client: invoice.clients?.name },
      });

      return { alreadyPaid: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financial"] });
      toast({ title: result?.alreadyPaid ? "Fatura já estava paga." : "Fatura marcada como paga! ✅" });
      setPayDialog(null);
    },
    onError: () => {
      toast({ title: "Erro ao confirmar pagamento", description: "Tente novamente em instantes.", variant: "destructive" });
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

  const notifyMutation = useMutation({
    mutationFn: async (inv: Invoice) => {
      if (!organizationId) throw new Error("Organização não encontrada");
      const { data: client } = await supabase
        .from("clients")
        .select("name, phone")
        .eq("id", inv.client_id)
        .single();
      if (!client?.phone) throw new Error("Cliente sem telefone cadastrado");

      const { data: settings } = await supabase
        .from("billing_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      const amount = Number(inv.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const dueFormatted = inv.due_date.split("-").reverse().join("/");

      // Build Pix/Link info
      let pixOrLink = "Entre em contato para informações de pagamento.";
      if (settings?.billing_mode === "gateway" && settings?.gateway_provider) {
        pixOrLink = "💳 *Pagamento automático:* Seu link/boleto de pagamento foi gerado automaticamente pelo sistema. Caso não tenha recebido, entre em contato.";
      } else if (settings?.pix_key) {
        const typeMap: Record<string, string> = {
          cpf: "CPF/CNPJ", email: "E-mail", telefone: "Telefone", aleatoria: "Chave Aleatória",
        };
        pixOrLink = `📲 *Pix Manual:*\nTipo: ${typeMap[settings.pix_key_type || "aleatoria"] || settings.pix_key_type}\nChave: \`${settings.pix_key}\`\n\n_Após o pagamento, envie o comprovante para confirmação._`;
      }

      // Generate portal link
      const PORTAL_BASE = window.location.origin;
      let portalLink = "";
      try {
        const { data: existingToken } = await supabase
          .from("client_portal_tokens")
          .select("token")
          .eq("client_id", inv.client_id)
          .maybeSingle();
        if (existingToken?.token) {
          portalLink = `${PORTAL_BASE}/portal/${existingToken.token}`;
        } else {
          const { data: newToken } = await supabase
            .from("client_portal_tokens")
            .insert({ client_id: inv.client_id, organization_id: organizationId })
            .select("token")
            .single();
          if (newToken?.token) portalLink = `${PORTAL_BASE}/portal/${newToken.token}`;
        }
      } catch (e) {
        console.warn("Portal token error");
      }

      const template = settings?.template_reminder || "Olá {nome}! Sua fatura de {valor} vence em {vencimento}. {link_ou_chave_pix}";
      const message = template
        .replace(/{nome}/g, client.name || "Cliente")
        .replace(/{valor}/g, amount)
        .replace(/{vencimento}/g, dueFormatted)
        .replace(/{link_ou_chave_pix}/g, pixOrLink)
        .replace(/{link_portal}/g, portalLink || "");

      // Send immediately via Edge Function proxy (avoids mixed content)
      const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-now", {
        body: {
          phone: client.phone,
          message,
          organization_id: organizationId,
        },
      });

      if (sendError) throw new Error(sendError.message || "Erro ao enviar mensagem");
      if (sendResult?.error) throw new Error(sendResult.error);

      return "sent";
    },
    onSuccess: (result) => {
      toast({ title: result === "sent" ? "Mensagem enviada com sucesso! ✅" : "Mensagem adicionada à fila de envio!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao notificar", description: err.message, variant: "destructive" });
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
             <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente ou descrição..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
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
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[130px] justify-start text-left font-normal text-xs", !dateFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {dateFrom ? format(dateFrom, "dd/MM/yy") : "De"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" locale={ptBR} />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[130px] justify-start text-left font-normal text-xs", !dateTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {dateTo ? format(dateTo, "dd/MM/yy") : "Até"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" locale={ptBR} />
                  </PopoverContent>
                </Popover>

                {(dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                    Limpar
                  </Button>
                )}

                <div className="flex gap-1 sm:ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => exportToExcel(filtered)}
                    disabled={filtered.length === 0}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => exportToPDF(filtered)}
                    disabled={filtered.length === 0}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    PDF
                  </Button>
                </div>
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
                                  className="h-8 text-primary border-primary/30 hover:bg-primary/10"
                                  disabled={notifyMutation.isPending}
                                  onClick={() => notifyMutation.mutate(inv)}
                                  title="Enviar notificação manual via WhatsApp"
                                >
                                  <Send className="h-3.5 w-3.5 mr-1" /> Enviar Agora
                                </Button>
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
                                  onClick={() => {
                                    if (window.confirm("Cancelar esta fatura?")) cancelMutation.mutate(inv.id);
                                  }}
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
