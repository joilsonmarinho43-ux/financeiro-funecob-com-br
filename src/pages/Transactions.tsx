import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TablesInsert } from "@/integrations/supabase/types";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Trash2, TrendingUp, TrendingDown, CalendarIcon, DollarSign,
} from "lucide-react";

const CATEGORIES = [
  "Mensalidade", "Carnê", "Venda", "Serviço", "Comissão",
  "Aluguel", "Salário", "Fornecedor", "Servidor", "Marketing",
  "Manutenção", "Outros",
];

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const emptyForm = {
  description: "",
  amount: "",
  category: "",
  transaction_date: new Date(),
};

export default function Transactions() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("entrada");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"entrada" | "saida">("entrada");
  const [form, setForm] = useState(emptyForm);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user) throw new Error("Organização não encontrada");
      const payload: TablesInsert<"transactions"> = {
        type: dialogType,
        amount: parseFloat(form.amount),
        description: form.description || null,
        category: form.category || null,
        transaction_date: format(form.transaction_date, "yyyy-MM-dd"),
        organization_id: organizationId,
        created_by: user.id,
      };
      const { error } = await supabase.from("transactions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["report-transactions"] });
      toast({ title: dialogType === "entrada" ? "Entrada registrada!" : "Saída registrada!" });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Movimentação removida!" });
    },
  });

  const filtered = transactions.filter((t) => {
    if (t.type !== activeTab) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !(t.description || "").toLowerCase().includes(s) &&
        !(t.category || "").toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  const totalEntradas = transactions
    .filter((t) => t.type === "entrada")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalSaidas = transactions
    .filter((t) => t.type === "saida")
    .reduce((s, t) => s + Number(t.amount), 0);

  const openNew = (type: "entrada" | "saida") => {
    setDialogType(type);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Movimentações</h1>
            <p className="text-sm text-muted-foreground">Gerencie entradas e saídas financeiras</p>
          </div>
          <div className="flex gap-2">
            <Button className="gradient-success text-primary-foreground" onClick={() => openNew("entrada")}>
              <TrendingUp className="h-4 w-4 mr-2" /> Nova Entrada
            </Button>
            <Button className="gradient-danger text-primary-foreground" onClick={() => openNew("saida")}>
              <TrendingDown className="h-4 w-4 mr-2" /> Nova Saída
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Entradas", value: totalEntradas, icon: TrendingUp, cls: "gradient-success" },
            { label: "Total Saídas", value: totalSaidas, icon: TrendingDown, cls: "gradient-danger" },
            { label: "Saldo", value: totalEntradas - totalSaidas, icon: DollarSign, cls: "gradient-primary" },
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

        {/* Tabs + Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <TabsList>
                  <TabsTrigger value="entrada">Entradas</TabsTrigger>
                  <TabsTrigger value="saida">Saídas</TabsTrigger>
                </TabsList>
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por descrição ou categoria..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma movimentação encontrada.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{format(parseISO(tx.transaction_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="max-w-[250px] truncate">{tx.description || "—"}</TableCell>
                        <TableCell>
                          {tx.category ? (
                            <Badge variant="outline" className="text-xs">{tx.category}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className={cn("text-right font-semibold", tx.type === "entrada" ? "text-success" : "text-destructive")}>
                          {tx.type === "entrada" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (window.confirm("Tem certeza que deseja remover esta movimentação?")) {
                                deleteMutation.mutate(tx.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* New transaction dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogType === "entrada" ? "Nova Entrada" : "Nova Saída"}
            </DialogTitle>
            <DialogDescription>
              Registre uma {dialogType === "entrada" ? "entrada" : "saída"} financeira manual.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="tx-amount">Valor (R$) *</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-desc">Descrição</Label>
              <Textarea
                id="tx-desc"
                placeholder="Descreva a movimentação..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(form.transaction_date, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.transaction_date}
                      onSelect={(d) => d && setForm({ ...form, transaction_date: d })}
                      className="p-3 pointer-events-auto"
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button
                type="submit"
                className={dialogType === "entrada" ? "gradient-success text-primary-foreground" : "gradient-danger text-primary-foreground"}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Salvando..." : "Registrar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
