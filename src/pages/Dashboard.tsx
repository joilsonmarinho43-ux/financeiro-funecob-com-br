import { Users, UserX, UserMinus, Eye, EyeOff, DollarSign, Send, MessageSquare, Loader2, Bell, CheckCircle2, PlusCircle, CalendarIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { buildPortalLink } from "@/lib/portalUrl";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Parse date string "YYYY-MM-DD" without timezone shift
const parseDateLocal = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
};

export default function Dashboard() {
  const [showValues, setShowValues] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch WhatsApp instance for sending
  const { data: whatsappInstance } = useQuery({
    queryKey: ["whatsapp-instance", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id, api_url, api_key, status")
        .eq("organization_id", organizationId)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch billing settings for message template
  const { data: billingSettings } = useQuery({
    queryKey: ["billing-settings", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("billing_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      return data;
    },
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
  });

  const [payingId, setPayingId] = useState<string | null>(null);

  const sendWhatsAppMessage = async (inv: any) => {
    const client = inv.clients as any;
    const phone = client?.phone;
    if (!phone) {
      toast({ title: "Erro", description: "Cliente sem telefone cadastrado.", variant: "destructive" });
      return;
    }

    setSendingId(inv.id);
    try {
      const amount = Number(inv.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const dueFormatted = parseDateLocal(inv.due_date).toLocaleDateString("pt-BR");

      // Build Pix/Link info
      let pixOrLink = "Entre em contato para informações de pagamento.";
      if (billingSettings?.billing_mode === "gateway" && billingSettings?.gateway_provider) {
        pixOrLink = "💳 *Pagamento automático:* Seu link/boleto de pagamento foi gerado automaticamente pelo sistema.";
      } else if (billingSettings?.pix_key) {
        const typeMap: Record<string, string> = { cpf: "CPF/CNPJ", email: "E-mail", telefone: "Telefone", aleatoria: "Chave Aleatória" };
        const holderLine = billingSettings.pix_holder_name ? `\nTitular: ${billingSettings.pix_holder_name}` : "";
        pixOrLink = `📲 *Pix Manual:*\nTipo: ${typeMap[billingSettings.pix_key_type || "aleatoria"] || billingSettings.pix_key_type}\nChave: \`${billingSettings.pix_key}\`${holderLine}\n\n_Após o pagamento, envie o comprovante para confirmação._`;
      }

      // Generate portal link (FIXED domain)
      let portalLink = "";
      try {
        const clientId = inv.client_id;
        if (clientId) {
          const { data: existingToken } = await supabase
            .from("client_portal_tokens")
            .select("token")
            .eq("client_id", clientId)
            .maybeSingle();
          if (existingToken?.token) {
            portalLink = buildPortalLink(existingToken.token);
          } else {
            const { data: newToken } = await supabase
              .from("client_portal_tokens")
              .insert({ client_id: clientId, organization_id: organizationId! })
              .select("token")
              .single();
            if (newToken?.token) portalLink = buildPortalLink(newToken.token);
          }
        }
      } catch { /* silent */ }

      const portalSection = portalLink || "";

      const template = billingSettings?.template_overdue ||
        "Olá {nome}! Sua fatura no valor de {valor} com vencimento em {vencimento} está em atraso. Por favor, regularize o pagamento. {link_ou_chave_pix}";
      const message = template
        .replace(/{nome}/g, client?.name || "Cliente")
        .replace(/{valor}/g, amount)
        .replace(/{vencimento}/g, dueFormatted)
        .replace(/{link_ou_chave_pix}/g, pixOrLink)
        .replace(/{link_portal}/g, portalSection)
        .replace(/{titular_pix}/g, billingSettings?.pix_holder_name || "");

      const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-now", {
        body: { phone: phone.replace(/\D/g, ""), message, organization_id: organizationId },
      });

      if (sendError) throw new Error(sendError.message);
      if (sendResult?.error) throw new Error(sendResult.error);

      toast({ title: "Mensagem enviada! ✅", description: `Cobrança enviada para ${client?.name}.` });
    } catch (e: any) {
      toast({ title: "Falha no envio", description: "Não foi possível enviar a mensagem. Tente novamente.", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleBaixa = async (inv: any) => {
    const client = inv.clients as any;
    if (!window.confirm(`Confirmar pagamento de ${client?.name}?`)) return;
    
    setPayingId(inv.id);
    try {
      const paidDate = new Date().toISOString().split("T")[0];
      const { data: result, error: fnError } = await supabase.functions.invoke("baixa-manual", {
        body: {
          invoice_id: inv.id,
          paid_date: paidDate,
          organization_id: organizationId,
        },
      });

      if (fnError) throw new Error("Falha na comunicação");
      if (result?.error) throw new Error(result.error);

      queryClient.invalidateQueries({ queryKey: ["dashboard-overdue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financial"] });
      toast({ title: result?.already_paid ? "Fatura já estava paga." : "Pagamento confirmado! ✅" });
    } catch {
      toast({ title: "Erro ao confirmar pagamento", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setPayingId(null);
    }
  };

  const openWhatsAppDirect = (inv: any) => {
    const client = inv.clients as any;
    const phone = client?.phone?.replace(/\D/g, "");
    if (!phone) {
      toast({ title: "Erro", description: "Cliente sem telefone cadastrado.", variant: "destructive" });
      return;
    }
    let message = `Olá ${client?.name}! Sua fatura no valor de ${inv.amount?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} venceu em ${parseDateLocal(inv.due_date).toLocaleDateString("pt-BR")}. Por favor, regularize o pagamento.`;
    if (billingSettings?.pix_key) message += ` Chave PIX: ${billingSettings.pix_key}`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  // Generate invoice dialog state
  const [generateDialog, setGenerateDialog] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");

  const openGenerateDialog = (inv: any) => {
    const now = new Date();
    const existingDueDay = parseDateLocal(inv.due_date).getDate();
    let defaultMonth = now.getMonth();
    let defaultYear = now.getFullYear();
    if (now.getDate() > existingDueDay) {
      defaultMonth++;
      if (defaultMonth > 11) { defaultMonth = 0; defaultYear++; }
    }
    setSelectedMonth(String(defaultMonth));
    setSelectedYear(String(defaultYear));
    setGenerateDialog(inv);
  };

  const confirmGenerateInvoice = async () => {
    const inv = generateDialog;
    if (!inv || !organizationId) return;
    const client = inv.clients as any;
    setGeneratingId(inv.id);
    try {
      const plan = inv.plans as any;
      const invoiceAmount = plan?.price || Number(inv.amount);
      if (!invoiceAmount || invoiceAmount <= 0) throw new Error("Valor da fatura inválido");

      const existingDueDay = parseDateLocal(inv.due_date).getDate();
      const month = parseInt(selectedMonth);
      const year = parseInt(selectedYear);
      const dueDate = new Date(year, month, existingDueDay);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      // Idempotency check
      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("client_id", (inv as any).client_id || client?.id)
        .eq("organization_id", organizationId)
        .eq("due_date", dueDateStr)
        .eq("status", "aberto")
        .maybeSingle();

      if (existing) {
        toast({ title: "Fatura já existe", description: "Já existe uma fatura aberta para este período.", variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("invoices").insert({
        client_id: (inv as any).client_id || client?.id,
        organization_id: organizationId,
        plan_id: (inv as any).plan_id || null,
        amount: invoiceAmount,
        due_date: dueDateStr,
        status: "aberto",
        description: `${plan?.name || "Mensalidade"} — ${dueDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["dashboard-overdue"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Fatura gerada com sucesso! ✅" });
      setGenerateDialog(null);
    } catch (e: any) {
      toast({ title: "Erro ao gerar fatura", description: e.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  };

  const { data: clientStats, isLoading: loadingClients } = useQuery({
    queryKey: ["dashboard-clients", organizationId],
    queryFn: async () => {
      if (!organizationId) return { active: 0, expired: 0, inactive: 0 };
      const { data, error } = await supabase
        .from("clients")
        .select("status")
        .eq("organization_id", organizationId);
      if (error) throw error;
      const active = data.filter((c) => c.status === "ativo").length;
      const inactive = data.filter((c) => c.status === "inativo" || c.status === "desativado").length;

      // Count distinct clients with overdue invoices (real metric)
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: overdueInvoices } = await supabase
        .from("invoices")
        .select("client_id")
        .eq("organization_id", organizationId)
        .eq("status", "aberto")
        .lt("due_date", todayStr);
      const uniqueOverdueClients = new Set((overdueInvoices || []).map((i) => i.client_id));
      const expired = uniqueOverdueClients.size;

      return { active, expired, inactive };
    },
    enabled: !!organizationId,
  });

  const { data: financialStats, isLoading: loadingFinancial } = useQuery({
    queryKey: ["dashboard-financial", organizationId],
    queryFn: async () => {
      if (!organizationId) return { monthBalance: 0, yearBalance: 0 };
      const now = new Date();
      const startOfYear = `${now.getFullYear()}-01-01`;
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("amount, paid_date")
        .eq("organization_id", organizationId)
        .eq("status", "pago")
        .gte("paid_date", startOfYear);
      if (error) throw error;
      let monthBalance = 0;
      let yearBalance = 0;
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      for (const inv of invoices) {
        if (inv.paid_date) {
          yearBalance += Number(inv.amount);
          if (inv.paid_date >= startOfMonth) monthBalance += Number(inv.amount);
        }
      }
      return { monthBalance, yearBalance };
    },
    enabled: !!organizationId,
  });




  // Overdue clients
  const { data: overdueClients } = useQuery({
    queryKey: ["dashboard-overdue", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const todayStr = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("invoices")
        .select("id, amount, due_date, status, client_id, plan_id, clients(name, phone), plans(name, price)")
        .eq("organization_id", organizationId)
        .eq("status", "aberto")
        .lt("due_date", todayStr)
        .order("due_date", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Active reminders (clients notified 10 days before due date)
  const { data: activeReminders } = useQuery({
    queryKey: ["dashboard-active-reminders", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const now = new Date();
      const tenDaysFromNow = new Date(now);
      tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
      const todayStr = now.toISOString().split("T")[0];
      const futureStr = tenDaysFromNow.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("invoices")
        .select("id, amount, due_date, clients(name, phone), plans(name)")
        .eq("organization_id", organizationId)
        .eq("status", "aberto")
        .gt("due_date", todayStr)
        .lte("due_date", futureStr)
        .order("due_date", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });




  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const now = new Date();
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-4">
      {/* Metric Cards - 2 columns on mobile */}
      <div className="grid grid-cols-2 gap-3">
        {/* Clientes Ativos */}
        <Card className="border-0 shadow-sm overflow-hidden bg-primary">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary-foreground/80 shrink-0" />
            <div>
              <p className="text-xs text-primary-foreground/80">Clientes Ativos</p>
              {loadingClients ? (
                <Skeleton className="h-7 w-12 mt-0.5 bg-primary-foreground/20" />
              ) : (
                <p className="text-2xl font-bold text-primary-foreground">{clientStats?.active ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Clientes Vencidos */}
        <Card className="border-0 shadow-sm overflow-hidden bg-destructive">
          <CardContent className="p-4 flex items-center gap-3">
            <UserX className="h-8 w-8 text-destructive-foreground/80 shrink-0" />
            <div>
              <p className="text-xs text-destructive-foreground/80">Clientes Vencidos</p>
              {loadingClients ? (
                <Skeleton className="h-7 w-12 mt-0.5 bg-destructive-foreground/20" />
              ) : (
                <p className="text-2xl font-bold text-destructive-foreground">{clientStats?.expired ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Clientes Desativados */}
        <Card className="border-0 shadow-sm overflow-hidden" style={{ background: "hsl(var(--sidebar-background))" }}>
          <CardContent className="p-4 flex items-center gap-3">
            <UserMinus className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Clientes Desativados</p>
              {loadingClients ? (
                <Skeleton className="h-7 w-12 mt-0.5" />
              ) : (
                <p className="text-2xl font-bold text-sidebar-foreground">{clientStats?.inactive ?? 0}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Saldo do Mês */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Saldo Líquido do Mês</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {monthNames[now.getMonth()].slice(0, 3)}
              </Badge>
            </div>
            <div className="flex items-center justify-between mt-2">
              <DollarSign className="h-6 w-6 text-primary shrink-0" />
              {loadingFinancial ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <button onClick={() => setShowValues(!showValues)} className="flex items-center gap-1.5 text-foreground">
                  <span className="text-sm font-bold">
                    {showValues ? formatCurrency(financialStats?.monthBalance ?? 0) : "****** "}
                  </span>
                  {showValues ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Saldo do Ano - full width */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Saldo Líquido do Ano</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive">
                {now.getFullYear()}
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <DollarSign className="h-6 w-6 text-primary shrink-0" />
            {loadingFinancial ? (
              <Skeleton className="h-6 w-28" />
            ) : (
              <button onClick={() => setShowValues(!showValues)} className="flex items-center gap-1.5 text-foreground">
                <span className="text-sm font-bold">
                  {showValues ? formatCurrency(financialStats?.yearBalance ?? 0) : "****** "}
                </span>
                {showValues ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Lembretes Ativos — clientes com vencimento nos próximos 10 dias */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="bg-warning px-4 py-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-warning-foreground" />
          <div>
            <h3 className="font-semibold text-sm text-warning-foreground">Lembretes Ativos</h3>
            <p className="text-xs text-warning-foreground/80">Clientes com vencimento nos próximos 10 dias</p>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Vencimento</TableHead>
                  <TableHead className="text-xs">Valor</TableHead>
                  <TableHead className="text-xs">Plano</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!activeReminders || activeReminders.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum vencimento nos próximos 10 dias
                    </TableCell>
                  </TableRow>
                ) : (
                  activeReminders.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-xs font-medium text-foreground">
                        {(inv.clients as any)?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] border-warning/50 text-warning">
                          {parseDateLocal(inv.due_date).toLocaleDateString("pt-BR")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {Number(inv.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {(inv.plans as any)?.name ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Clientes com Plano Vencido */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="bg-destructive px-4 py-3">
          <h3 className="font-semibold text-sm text-destructive-foreground">Meus Clientes Com Plano Vencido</h3>
          <p className="text-xs text-destructive-foreground/80">Informe aos seus clientes sobre o vencimento</p>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Vencimento</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Plano</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!overdueClients || overdueClients.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum cliente com plano vencido
                    </TableCell>
                  </TableRow>
                ) : (
                  overdueClients.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-xs font-medium text-primary">
                        {(inv.clients as any)?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">
                          {parseDateLocal(inv.due_date).toLocaleDateString("pt-BR")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="text-[10px] bg-destructive/10 text-destructive border-0">
                          Vencido
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {(inv.plans as any)?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-success hover:text-success"
                            onClick={() => handleBaixa(inv)}
                            disabled={payingId === inv.id}
                            title="Confirmar pagamento"
                          >
                            {payingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-primary hover:text-primary"
                            onClick={() => sendWhatsAppMessage(inv)}
                            disabled={sendingId === inv.id}
                            title="Enviar cobrança via WhatsApp"
                          >
                            {sendingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openWhatsAppDirect(inv)}
                            title="Abrir WhatsApp Web"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-primary hover:text-primary"
                            onClick={() => openGenerateDialog(inv)}
                            disabled={generatingId === inv.id}
                            title="Gerar nova mensalidade"
                          >
                            {generatingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Generate Invoice Dialog with Month/Year picker */}
      <Dialog open={!!generateDialog} onOpenChange={(o) => !o && setGenerateDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Gerar Mensalidade</DialogTitle>
            <DialogDescription>
              Escolha o mês e ano para a nova fatura. O dia de vencimento será mantido conforme o cadastro do cliente.
            </DialogDescription>
          </DialogHeader>
          {generateDialog && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
                <p><span className="font-medium">Cliente:</span> {(generateDialog.clients as any)?.name}</p>
                <p><span className="font-medium">Plano:</span> {(generateDialog.plans as any)?.name || "—"}</p>
                <p><span className="font-medium">Valor:</span> {Number((generateDialog.plans as any)?.price || generateDialog.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                <p><span className="font-medium">Dia de vencimento:</span> {parseDateLocal(generateDialog.due_date).getDate()}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Mês</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
                        <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Ano</label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i).map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm text-center">
                <CalendarIcon className="h-4 w-4 inline mr-1.5 text-primary" />
                <span className="font-medium">
                  Vencimento: {parseDateLocal(generateDialog.due_date).getDate()}/{String(parseInt(selectedMonth) + 1).padStart(2, "0")}/{selectedYear}
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setGenerateDialog(null)}>Cancelar</Button>
                <Button
                  className="gradient-primary text-primary-foreground"
                  disabled={generatingId === generateDialog.id}
                  onClick={confirmGenerateInvoice}
                >
                  {generatingId === generateDialog.id ? "Gerando..." : "Gerar Fatura"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
