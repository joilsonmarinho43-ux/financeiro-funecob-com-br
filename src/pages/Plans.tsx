import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, FileText } from "lucide-react";

type Plan = Tables<"plans">;

const emptyForm = {
  name: "",
  price: "",
  billing_cycle: "mensal",
  description: "",
  active: true,
};

export default function Plans() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Plan[];
    },
    enabled: !!organizationId,
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organização não encontrada");

      const payload: TablesInsert<"plans"> = {
        name: form.name,
        price: parseFloat(form.price) || 0,
        billing_cycle: form.billing_cycle,
        description: form.description || null,
        active: form.active,
        organization_id: organizationId,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from("plans")
          .update(payload)
          .eq("id", editingPlan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast({ title: editingPlan ? "Plano atualizado!" : "Plano criado!" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast({ title: "Plano removido!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingPlan(null);
    setForm(emptyForm);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      price: String(plan.price),
      billing_cycle: plan.billing_cycle,
      description: plan.description || "",
      active: plan.active,
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

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Planos</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie os planos disponíveis para seus clientes
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Novo Plano
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Valor (R$) *</Label>
                    <Input id="price" type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Ciclo</Label>
                    <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="trimestral">Trimestral</SelectItem>
                        <SelectItem value="semestral">Semestral</SelectItem>
                        <SelectItem value="anual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                  <Label>Ativo</Label>
                </div>
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

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : plans.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Nenhum plano cadastrado ainda.</p>
                <p className="text-xs mt-1">Clique em "Novo Plano" para começar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Ciclo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>{formatCurrency(Number(plan.price))}</TableCell>
                        <TableCell className="capitalize">{plan.billing_cycle}</TableCell>
                        <TableCell>
                          <Badge className={plan.active ? "bg-success/10 text-success border-0" : "bg-destructive/10 text-destructive border-0"}>
                            {plan.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(plan)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => {
                              if (window.confirm(`Remover plano "${plan.name}"?`)) deleteMutation.mutate(plan.id);
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
    </AppLayout>
  );
}
