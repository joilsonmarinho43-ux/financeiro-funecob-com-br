import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Plus, Search, Pencil, Trash2, Users, CalendarDays, Repeat, BookOpen, Link2, Copy, Check, Send, MessageSquare, CreditCard, Eye, Receipt, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ptBR } from "date-fns/locale";
import { auditLog } from "@/lib/auditLog";

type Client = Tables<"clients">;
type Plan = Tables<"plans">;

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  document: "",
  address: "",
  client_code: "",
  plan_id: "",
  custom_value: "",
  due_day: "5",
  due_date_full: "",
  billing_type: "recorrencia" as "recorrencia" | "carne",
  carne_installments: "12",
  status: "ativo",
  observations: "",
};

export default function Clients() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [msgDialog, setMsgDialog] = useState<{ phone: string; name: string } | null>(null);
  const [manualMsg, setManualMsg] = useState("");
  const [invoiceDialog, setInvoiceDialog] = useState<Client | null>(null);
  const [invForm, setInvForm] = useState<{ description: string; amount: string; due_date: Date | undefined }>({ description: "Mensalidade", amount: "", due_date: new Date() });
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!organizationId,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["plans", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Plan[];
    },
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
  });

  // Client invoices for detail view
  const { data: clientInvoices = [] } = useQuery({
    queryKey: ["client-invoices", detailDialog?.id],
    queryFn: async () => {
      if (!detailDialog) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("client_id", detailDialog.id)
        .order("due_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!detailDialog,
  });

  // Fetch next pending invoice for editing client (to show due date)
  const { data: editNextInvoice } = useQuery({
    queryKey: ["edit-next-invoice", editingClient?.id],
    queryFn: async () => {
      if (!editingClient) return null;
      const { data, error } = await supabase
        .from("invoices")
        .select("id, due_date, amount, status, plan_id")
        .eq("client_id", editingClient.id)
        .in("status", ["pendente", "atrasada"])
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!editingClient,
  });

  // Pré-preenche o plano da próxima fatura ao editar
  useEffect(() => {
    if (editingClient && editNextInvoice && !form.plan_id) {
      const planId = (editNextInvoice as any).plan_id || "";
      if (planId) setForm((f) => ({ ...f, plan_id: planId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editNextInvoice?.id]);

  const selectedPlan = plans.find((p) => p.id === form.plan_id);
  const invoiceAmount = form.custom_value
    ? parseFloat(form.custom_value)
    : selectedPlan
    ? Number(selectedPlan.price)
    : 0;

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user) throw new Error("Organização não encontrada");

      const clientPayload: any = {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        document: form.document || null,
        address: form.address || null,
        client_code: form.client_code || null,
        status: form.status || "ativo",
        created_by: user.id,
        organization_id: organizationId,
        collector_id: user.id,
      };

      let clientId = editingClient?.id;

      if (editingClient) {
        const { error } = await supabase
          .from("clients")
          .update(clientPayload)
          .eq("id", editingClient.id);
        if (error) throw error;

        // Update next invoice (due date and/or plan/value) if changed
        if (editNextInvoice?.id) {
          const invUpdate: any = {};
          if (form.due_date_full) invUpdate.due_date = form.due_date_full;
          if (form.plan_id && form.plan_id !== editNextInvoice.plan_id) {
            const newPlan = plans.find((p) => p.id === form.plan_id);
            if (newPlan) {
              invUpdate.plan_id = form.plan_id;
              invUpdate.amount = Number(newPlan.price);
              invUpdate.description = `${newPlan.name} - Mensalidade`;
            }
          } else if (!form.plan_id && editNextInvoice.plan_id) {
            invUpdate.plan_id = null;
          }
          if (Object.keys(invUpdate).length > 0) {
            await supabase.from("invoices").update(invUpdate).eq("id", editNextInvoice.id);
          }
        }
      } else {
        const { data, error } = await supabase
          .from("clients")
          .insert(clientPayload)
          .select("id")
          .single();
        if (error) throw error;
        clientId = data.id;
      }

      // Generate invoices for new clients only
      if (!editingClient && clientId && invoiceAmount > 0) {
        const dueDay = parseInt(form.due_day) || 5;
        const now = new Date();
        const invoices: TablesInsert<"invoices">[] = [];

        // Use full date if provided, otherwise calculate from due_day
        const getFirstDueDate = () => {
          if (form.due_date_full) {
            return new Date(form.due_date_full + "T12:00:00");
          }
          const d = new Date(now.getFullYear(), now.getMonth(), dueDay);
          if (d <= now) d.setMonth(d.getMonth() + 1);
          return d;
        };

        if (form.billing_type === "recorrencia") {
          const dueDate = getFirstDueDate();
          invoices.push({
            client_id: clientId,
            organization_id: organizationId,
            plan_id: form.plan_id || null,
            amount: invoiceAmount,
            due_date: format(dueDate, "yyyy-MM-dd"),
            description: selectedPlan ? `${selectedPlan.name} - Mensalidade` : `Mensalidade`,
            status: "aberto",
          });
        } else {
          const totalInstallments = parseInt(form.carne_installments) || 12;
          const firstDue = getFirstDueDate();
          for (let i = 0; i < totalInstallments; i++) {
            const dueDate = new Date(firstDue.getFullYear(), firstDue.getMonth() + i, firstDue.getDate());
            invoices.push({
              client_id: clientId,
              organization_id: organizationId,
              plan_id: form.plan_id || null,
              amount: invoiceAmount,
              due_date: format(dueDate, "yyyy-MM-dd"),
              description: selectedPlan
                ? `${selectedPlan.name} - Carnê ${i + 1}/${totalInstallments}`
                : `Carnê - Parcela ${i + 1}/${totalInstallments}`,
              status: "aberto",
            });
          }
        }

        if (invoices.length > 0) {
          const { error: invError } = await supabase.from("invoices").insert(invoices);
          if (invError) throw invError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financial"] });
      toast({ title: editingClient ? "Cliente atualizado!" : "Cliente cadastrado com faturas geradas!" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente removido!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });

  const sendManualMsgMutation = useMutation({
    mutationFn: async () => {
      if (!msgDialog || !organizationId) throw new Error("Dados inválidos");

      // Send immediately via Edge Function proxy
      const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-now", {
        body: {
          phone: msgDialog.phone,
          message: manualMsg,
          organization_id: organizationId,
        },
      });

      if (sendError) throw new Error(sendError.message || "Erro ao enviar mensagem");
      if (sendResult?.error) throw new Error(sendResult.error);

      return "sent";
    },
    onSuccess: (result) => {
      toast({ title: result === "sent" ? "Mensagem enviada com sucesso! ✅" : "Mensagem adicionada à fila!" });
      setMsgDialog(null);
      setManualMsg("");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setForm(emptyForm);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      ...emptyForm,
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      document: client.document || "",
      address: client.address || "",
      client_code: (client as any).client_code || "",
      status: client.status || "ativo",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    upsertMutation.mutate();
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.document?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (status: string) => {
    switch (status) {
      case "ativo": return "bg-success/10 text-success border-0";
      case "inativo": return "bg-destructive/10 text-destructive border-0";
      default: return "bg-muted text-muted-foreground border-0";
    }
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus clientes cadastrados</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" /> Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingClient ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5 mt-2">
                {/* Dados Pessoais */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Dados Pessoais
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client_code">Código do Cliente</Label>
                      <Input id="client_code" value={form.client_code} onChange={(e) => setForm({ ...form, client_code: e.target.value })} placeholder="Ex: 0022008" className="font-mono" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="document">CPF/CNPJ</Label>
                      <Input id="document" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço</Label>
                    <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                  {/* Status - visible when editing */}
                  {editingClient && (
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="inativo">Inativo</SelectItem>
                          <SelectItem value="inadimplente">Inadimplente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Plano - visible when editing (atualiza próxima fatura em aberto) */}
                  {editingClient && (
                    <div className="space-y-2">
                      <Label>Plano</Label>
                      <Select
                        value={form.plan_id || "none"}
                        onValueChange={(v) => setForm({ ...form, plan_id: v === "none" ? "" : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Sem plano" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem plano</SelectItem>
                          {plans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — {formatCurrency(Number(p.price))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Atualiza a próxima fatura em aberto com o valor do plano selecionado.
                      </p>
                    </div>
                  )}
                  {/* Due date - visible when editing */}
                  {editingClient && (
                    <div className="space-y-2">
                      <Label>Próximo Vencimento</Label>
                      <Input
                        type="date"
                        value={form.due_date_full || editNextInvoice?.due_date || ""}
                        onChange={(e) => setForm({ ...form, due_date_full: e.target.value })}
                      />
                      {editNextInvoice && !form.due_date_full && (
                        <p className="text-xs text-muted-foreground">
                          Vencimento atual: {format(new Date(editNextInvoice.due_date + "T12:00:00"), "dd/MM/yyyy")} — {editNextInvoice.status}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Show dates when editing */}
                  {editingClient && (
                    <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
                      <p className="font-medium text-foreground">Informações</p>
                      <p className="text-muted-foreground">Cadastrado em: {format(new Date(editingClient.created_at), "dd/MM/yyyy HH:mm")}</p>
                      <p className="text-muted-foreground">Última atualização: {format(new Date(editingClient.updated_at), "dd/MM/yyyy HH:mm")}</p>
                    </div>
                  )}
                </div>

                {/* Plano e Cobrança - somente para novos */}
                {!editingClient && (
                  <>
                    <div className="border-t border-border pt-4 space-y-3">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary" /> Plano e Cobrança
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Plano</Label>
                          <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v, custom_value: "" })}>
                            <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                            <SelectContent>
                              {plans.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} — {formatCurrency(Number(p.price))}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custom_value">Valor Personalizado (R$)</Label>
                          <Input id="custom_value" type="number" step="0.01" min="0"
                            placeholder={selectedPlan ? formatCurrency(Number(selectedPlan.price)) : "0,00"}
                            value={form.custom_value} onChange={(e) => setForm({ ...form, custom_value: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Dia de Vencimento</Label>
                          <Select value={form.due_day} onValueChange={(v) => setForm({ ...form, due_day: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-60">
                              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                                <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Data do 1º Vencimento</Label>
                          <Input
                            type="date"
                            value={form.due_date_full}
                            onChange={(e) => setForm({ ...form, due_date_full: e.target.value })}
                          />
                          <p className="text-xs text-muted-foreground">Se preenchido, ignora o "Dia" acima</p>
                        </div>
                      </div>
                    </div>

                    {/* Tipo de Cobrança */}
                    <div className="border-t border-border pt-4 space-y-3">
                      <p className="text-sm font-semibold text-foreground">Tipo de Cobrança</p>
                      <RadioGroup value={form.billing_type} onValueChange={(v: "recorrencia" | "carne") => setForm({ ...form, billing_type: v })} className="grid grid-cols-2 gap-4">
                        <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${form.billing_type === "recorrencia" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                          <RadioGroupItem value="recorrencia" className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm text-foreground flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5 text-primary" /> Recorrência</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Cobrança mensal contínua</p>
                          </div>
                        </label>
                        <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${form.billing_type === "carne" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                          <RadioGroupItem value="carne" className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm text-foreground flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-primary" /> Carnê</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Defina o número de parcelas</p>
                          </div>
                        </label>
                      </RadioGroup>

                      {form.billing_type === "carne" && (
                        <div className="space-y-2 max-w-[200px]">
                          <Label htmlFor="installments">Nº de Parcelas</Label>
                          <Input id="installments" type="number" min="1" max="120" value={form.carne_installments} onChange={(e) => setForm({ ...form, carne_installments: e.target.value })} />
                        </div>
                      )}

                      {invoiceAmount > 0 && (
                        <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
                          <p className="font-medium text-foreground">Resumo da cobrança:</p>
                          <p className="text-muted-foreground">
                            {form.billing_type === "recorrencia"
                              ? `${formatCurrency(invoiceAmount)}/mês (primeira fatura gerada automaticamente)`
                              : `${form.carne_installments}× de ${formatCurrency(invoiceAmount)}`}
                          </p>
                          {form.billing_type === "carne" && (
                            <p className="text-muted-foreground">Total: {formatCurrency(invoiceAmount * (parseInt(form.carne_installments) || 12))}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
                  <Button type="submit" className="gradient-primary text-primary-foreground" disabled={upsertMutation.isPending}>
                    {upsertMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total", value: clients.length, className: "gradient-primary" },
            { label: "Ativos", value: clients.filter((c) => c.status === "ativo").length, className: "gradient-success" },
            { label: "Inativos", value: clients.filter((c) => c.status === "inativo").length, className: "gradient-danger" },
          ].map((s) => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`h-10 w-10 rounded-xl ${s.className} flex items-center justify-center`}>
                  <Users className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search + Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, e-mail ou documento..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {clients.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum resultado encontrado."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell>{client.phone || "—"}</TableCell>
                        <TableCell>{client.document || "—"}</TableCell>
                        <TableCell>
                          <Badge className={statusColor(client.status)}>{client.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {/* Detail view */}
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes" onClick={() => setDetailDialog(client)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {/* Send manual message */}
                            {client.phone && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Enviar mensagem" onClick={() => { setMsgDialog({ phone: client.phone!, name: client.name }); setManualMsg(""); }}>
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Open WhatsApp directly */}
                            {client.phone && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Abrir WhatsApp" asChild>
                                <a href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                                  <MessageSquare className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <PortalLinkButton clientId={client.id} organizationId={organizationId} />
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Gerar fatura" onClick={async () => {
                              setInvoiceDialog(client);
                              setInvForm({ description: "Mensalidade", amount: "", due_date: new Date() });
                              // Fetch last invoice for this client to pre-fill amount
                              const { data: lastInv } = await supabase
                                .from("invoices")
                                .select("amount, description, plan_id")
                                .eq("organization_id", organizationId!)
                                .eq("client_id", client.id)
                                .order("created_at", { ascending: false })
                                .limit(1)
                                .maybeSingle();
                              let amt = "";
                              let desc = "Mensalidade";
                              if (lastInv?.amount) {
                                amt = String(lastInv.amount);
                                if (lastInv.description) desc = lastInv.description;
                              } else {
                                // Fallback: try plan price from last invoice's plan_id (if any)
                                const planId = lastInv?.plan_id;
                                if (planId) {
                                  const p = plans.find((pl) => pl.id === planId);
                                  if (p?.price) amt = String(p.price);
                                }
                              }
                              setInvForm({ description: desc, amount: amt, due_date: new Date() });
                            }}>
                              <Receipt className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(client)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (window.confirm(`Tem certeza que deseja remover "${client.name}"? Esta ação não pode ser desfeita.`)) {
                                  deleteMutation.mutate(client.id);
                                }
                              }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      {/* Manual Message Dialog */}
      <Dialog open={!!msgDialog} onOpenChange={(open) => { if (!open) setMsgDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Mensagem Manual</DialogTitle>
            <DialogDescription>Para: {msgDialog?.name} ({msgDialog?.phone})</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); sendManualMsgMutation.mutate(); }} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea placeholder="Digite a mensagem..." value={manualMsg} onChange={(e) => setManualMsg(e.target.value)} rows={4} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMsgDialog(null)}>Cancelar</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={sendManualMsgMutation.isPending}>
                {sendManualMsgMutation.isPending ? "Enviando..." : "Enviar Agora"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Client Detail Dialog */}
      <Dialog open={!!detailDialog} onOpenChange={(open) => { if (!open) setDetailDialog(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes: {detailDialog?.name}</DialogTitle>
          </DialogHeader>
          {detailDialog && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Telefone:</span> <span className="font-medium">{detailDialog.phone || "—"}</span></div>
                <div><span className="text-muted-foreground">E-mail:</span> <span className="font-medium">{detailDialog.email || "—"}</span></div>
                <div><span className="text-muted-foreground">CPF/CNPJ:</span> <span className="font-medium">{detailDialog.document || "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColor(detailDialog.status)}>{detailDialog.status}</Badge></div>
                <div><span className="text-muted-foreground">Endereço:</span> <span className="font-medium">{detailDialog.address || "—"}</span></div>
                <div><span className="text-muted-foreground">Código:</span> <span className="font-mono font-medium">{(detailDialog as any).client_code || "—"}</span></div>
                <div><span className="text-muted-foreground">Cadastro:</span> <span className="font-medium">{format(new Date(detailDialog.created_at), "dd/MM/yyyy")}</span></div>
                <div><span className="text-muted-foreground">Atualização:</span> <span className="font-medium">{format(new Date(detailDialog.updated_at), "dd/MM/yyyy")}</span></div>
              </div>

              {/* Financial History */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" /> Histórico Financeiro
                  </p>
                  {clientInvoices.length > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={async () => {
                        if (!window.confirm("Tem certeza que deseja apagar TODAS as faturas deste cliente? Esta ação é irreversível.")) return;
                        if (!window.confirm("Confirme novamente: apagar todo o histórico financeiro?")) return;
                        const ids = clientInvoices.map((inv: any) => inv.id);
                        for (const id of ids) {
                          await supabase.from("invoices").delete().eq("id", id);
                        }
                        queryClient.invalidateQueries({ queryKey: ["client-invoices"] });
                        queryClient.invalidateQueries({ queryKey: ["invoices"] });
                        toast({ title: "Histórico financeiro apagado" });
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Apagar Tudo
                    </Button>
                  )}
                </div>
                {clientInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma fatura encontrada.</p>
                ) : (
                  <div className="overflow-x-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Pagamento</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientInvoices.map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-sm">{format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(Number(inv.amount))}</TableCell>
                            <TableCell>
                              <Badge className={inv.status === "pago" ? "bg-success/10 text-success border-0" : inv.status === "aberto" ? "bg-warning/10 text-warning border-0" : "bg-destructive/10 text-destructive border-0"}>
                                {inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{inv.paid_date ? format(new Date(inv.paid_date.includes("T") ? inv.paid_date : inv.paid_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={async () => {
                                  if (!window.confirm("Apagar esta fatura?")) return;
                                  await supabase.from("invoices").delete().eq("id", inv.id);
                                  queryClient.invalidateQueries({ queryKey: ["client-invoices"] });
                                  queryClient.invalidateQueries({ queryKey: ["invoices"] });
                                  toast({ title: "Fatura apagada" });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Delete Message History */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" /> Mensagens WhatsApp
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={async () => {
                      if (!detailDialog?.phone || !organizationId) return;
                      if (!window.confirm("Apagar todo o histórico de mensagens deste cliente?")) return;
                      const phone = detailDialog.phone.replace(/\D/g, "");
                      await supabase
                        .from("whatsapp_messages")
                        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id || null })
                        .eq("organization_id", organizationId)
                        .ilike("phone", `%${phone}%`);
                      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
                      toast({ title: "Histórico de mensagens apagado" });
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Apagar Histórico
                  </Button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-border pt-4 flex flex-wrap gap-2">
                {detailDialog.phone && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setDetailDialog(null); setMsgDialog({ phone: detailDialog.phone!, name: detailDialog.name }); setManualMsg(""); }}>
                      <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar Mensagem
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`https://wa.me/${detailDialog.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Abrir WhatsApp
                      </a>
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => { setDetailDialog(null); openEdit(detailDialog); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Invoice Dialog */}
      <Dialog open={!!invoiceDialog} onOpenChange={(open) => { if (!open) setInvoiceDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar fatura</DialogTitle>
            <DialogDescription>Cliente: {invoiceDialog?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={invForm.description} onChange={(e) => setInvForm({ ...invForm, description: e.target.value })} placeholder="Ex: Mensalidade" />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input inputMode="decimal" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Vencimento *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !invForm.due_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {invForm.due_date ? format(invForm.due_date, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={invForm.due_date} onSelect={(d) => setInvForm({ ...invForm, due_date: d })} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setInvoiceDialog(null)}>Cancelar</Button>
              <Button
                disabled={creatingInvoice}
                onClick={async () => {
                  if (!invoiceDialog || !organizationId) return;
                  const amountNum = parseFloat(invForm.amount.replace(",", "."));
                  if (!invForm.amount || isNaN(amountNum) || amountNum <= 0) {
                    toast({ title: "Valor inválido", variant: "destructive" });
                    return;
                  }
                  if (!invForm.due_date) {
                    toast({ title: "Selecione o vencimento", variant: "destructive" });
                    return;
                  }
                  setCreatingInvoice(true);
                  try {
                    const { error } = await supabase.from("invoices").insert({
                      organization_id: organizationId,
                      client_id: invoiceDialog.id,
                      description: invForm.description || "Mensalidade",
                      amount: amountNum,
                      due_date: format(invForm.due_date, "yyyy-MM-dd"),
                      status: "aberto",
                    } as any);
                    if (error) throw error;
                    await auditLog({ action: "invoice_created", organizationId, details: { client_id: invoiceDialog.id, amount: amountNum } });
                    toast({ title: "Fatura criada com sucesso" });
                    queryClient.invalidateQueries({ queryKey: ["invoices"] });
                    setInvoiceDialog(null);
                  } catch (e: any) {
                    toast({ title: "Erro ao criar fatura", description: e.message, variant: "destructive" });
                  } finally {
                    setCreatingInvoice(false);
                  }
                }}
              >
                {creatingInvoice ? "Criando..." : "Criar fatura"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function PortalLinkButton({ clientId, organizationId }: { clientId: string; organizationId: string | null }) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generateAndCopy = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("client_portal_tokens")
        .select("token")
        .eq("client_id", clientId)
        .maybeSingle();

      let token = (existing as any)?.token;

      if (!token) {
        const { data: created, error } = await supabase
          .from("client_portal_tokens")
          .insert({ client_id: clientId, organization_id: organizationId } as any)
          .select("token")
          .single();
        if (error) throw error;
        token = (created as any).token;
      }

      const link = `${window.location.origin}/portal/${token}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Link copiado!" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={generateAndCopy} disabled={loading} title="Copiar link do portal">
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
    </Button>
  );
}
