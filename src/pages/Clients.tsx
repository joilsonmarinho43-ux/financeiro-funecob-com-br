import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Plus, Search, Pencil, Trash2, Users, CalendarDays, Repeat, BookOpen, Link2, Copy, Check } from "lucide-react";
import { format } from "date-fns";

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
  billing_type: "recorrencia" as "recorrencia" | "carne",
  carne_installments: "12",
};

export default function Clients() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["plans", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Plan[];
    },
    enabled: !!organizationId,
  });

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

        if (form.billing_type === "recorrencia") {
          // Generate 12 months of recurring invoices
          for (let i = 0; i < 12; i++) {
            const dueDate = new Date(now.getFullYear(), now.getMonth() + i, dueDay);
            invoices.push({
              client_id: clientId,
              organization_id: organizationId,
              plan_id: form.plan_id || null,
              amount: invoiceAmount,
              due_date: format(dueDate, "yyyy-MM-dd"),
              description: selectedPlan
                ? `${selectedPlan.name} - Parcela ${i + 1}/12`
                : `Mensalidade - Parcela ${i + 1}/12`,
              status: "aberto",
            });
          }
        } else {
          // Carnê with custom number of installments
          const totalInstallments = parseInt(form.carne_installments) || 12;
          for (let i = 0; i < totalInstallments; i++) {
            const dueDate = new Date(now.getFullYear(), now.getMonth() + i, dueDay);
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
      toast({
        title: editingClient ? "Cliente atualizado!" : "Cliente cadastrado com faturas geradas!",
      });
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
      case "ativo":
        return "bg-success/10 text-success border-0";
      case "inativo":
        return "bg-destructive/10 text-destructive border-0";
      default:
        return "bg-muted text-muted-foreground border-0";
    }
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie seus clientes cadastrados
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Novo Cliente
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
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="document">CPF/CNPJ</Label>
                      <Input id="document" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Endereço</Label>
                      <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                    </div>
                  </div>
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
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um plano" />
                            </SelectTrigger>
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
                          <Input
                            id="custom_value"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={selectedPlan ? formatCurrency(Number(selectedPlan.price)) : "0,00"}
                            value={form.custom_value}
                            onChange={(e) => setForm({ ...form, custom_value: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="due_day">Dia de Vencimento</Label>
                          <Select value={form.due_day} onValueChange={(v) => setForm({ ...form, due_day: v })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 5, 10, 15, 20, 25].map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                  Dia {d}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Tipo de Cobrança */}
                    <div className="border-t border-border pt-4 space-y-3">
                      <p className="text-sm font-semibold text-foreground">Tipo de Cobrança</p>
                      <RadioGroup
                        value={form.billing_type}
                        onValueChange={(v: "recorrencia" | "carne") => setForm({ ...form, billing_type: v })}
                        className="grid grid-cols-2 gap-4"
                      >
                        <label
                          className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                            form.billing_type === "recorrencia" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          <RadioGroupItem value="recorrencia" className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm text-foreground flex items-center gap-1.5">
                              <Repeat className="h-3.5 w-3.5 text-primary" /> Recorrência
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Gera 12 faturas mensais automáticas
                            </p>
                          </div>
                        </label>
                        <label
                          className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                            form.billing_type === "carne" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          <RadioGroupItem value="carne" className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm text-foreground flex items-center gap-1.5">
                              <BookOpen className="h-3.5 w-3.5 text-primary" /> Carnê
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Defina o número de parcelas
                            </p>
                          </div>
                        </label>
                      </RadioGroup>

                      {form.billing_type === "carne" && (
                        <div className="space-y-2 max-w-[200px]">
                          <Label htmlFor="installments">Nº de Parcelas</Label>
                          <Input
                            id="installments"
                            type="number"
                            min="1"
                            max="120"
                            value={form.carne_installments}
                            onChange={(e) => setForm({ ...form, carne_installments: e.target.value })}
                          />
                        </div>
                      )}

                      {/* Summary */}
                      {invoiceAmount > 0 && (
                        <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
                          <p className="font-medium text-foreground">Resumo da cobrança:</p>
                          <p className="text-muted-foreground">
                            {form.billing_type === "recorrencia"
                              ? `12× de ${formatCurrency(invoiceAmount)} (mensal)`
                              : `${form.carne_installments}× de ${formatCurrency(invoiceAmount)}`}
                          </p>
                          <p className="text-muted-foreground">
                            Total: {formatCurrency(
                              invoiceAmount * (form.billing_type === "recorrencia" ? 12 : parseInt(form.carne_installments) || 12)
                            )}
                          </p>
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
              <Input
                placeholder="Buscar por nome, e-mail ou documento..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
                      <TableHead>E-mail</TableHead>
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
                        <TableCell>{client.email || "—"}</TableCell>
                        <TableCell>{client.phone || "—"}</TableCell>
                        <TableCell>{client.document || "—"}</TableCell>
                        <TableCell>
                          <Badge className={statusColor(client.status)}>{client.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <PortalLinkButton clientId={client.id} organizationId={organizationId} />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(client)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (window.confirm(`Tem certeza que deseja remover "${client.name}"? Esta ação não pode ser desfeita.`)) {
                                  deleteMutation.mutate(client.id);
                                }
                              }}
                            >
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
      // Check if token already exists
      const { data: existing } = await supabase
        .from("client_portal_tokens" as any)
        .select("token")
        .eq("client_id", clientId)
        .maybeSingle();

      let token = (existing as any)?.token;

      if (!token) {
        const { data: created, error } = await supabase
          .from("client_portal_tokens" as any)
          .insert({ client_id: clientId, organization_id: organizationId } as any)
          .select("token")
          .single();
        if (error) throw error;
        token = (created as any).token;
      }

      const link = `${window.location.origin}/portal/${token}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Link copiado!", description: "O link do portal do cliente foi copiado." });
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={generateAndCopy}
      disabled={loading}
      title="Copiar link do portal"
    >
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
    </Button>
  );
}
