import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Shield, Users, Calendar, Search, Edit2, Plus, Building2, Ban, CheckCircle } from "lucide-react";
import { NichePreview } from "@/components/NichePreview";

const PLAN_DURATIONS: Record<string, number> = {
  "3_dias": 3, "30_dias": 30, "90_dias": 90, "180_dias": 180, "365_dias": 365,
};
const PLAN_LABELS: Record<string, string> = {
  "3_dias": "3 dias (Trial)", "30_dias": "30 dias", "90_dias": "90 dias", "180_dias": "6 meses", "365_dias": "1 ano",
};

export default function AdminPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editSub, setEditSub] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState("30_dias");
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgNiche, setNewOrgNiche] = useState("funeraria");

  const { data: isAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      return !!data;
    },
    enabled: !!user,
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*, subscriptions(*), organization_members(user_id, role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!isAdmin,
  });

  const updateSubMutation = useMutation({
    mutationFn: async ({ orgId, planType }: { orgId: string; planType: string }) => {
      const days = PLAN_DURATIONS[planType] || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      const { data: existing } = await supabase.from("subscriptions").select("id").eq("organization_id", orgId).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("subscriptions").update({ plan_type: planType, starts_at: new Date().toISOString(), expires_at: expiresAt.toISOString(), status: "active" }).eq("organization_id", orgId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").insert({ organization_id: orgId, plan_type: planType, starts_at: new Date().toISOString(), expires_at: expiresAt.toISOString(), status: "active" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
      setEditSub(null);
      toast({ title: "Licença atualizada com sucesso!" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleOrgMutation = useMutation({
    mutationFn: async ({ orgId, active }: { orgId: string; active: boolean }) => {
      const { error } = await supabase.from("organizations").update({ active }).eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
      toast({ title: "Status da organização atualizado!" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createOrgMutation = useMutation({
    mutationFn: async () => {
      if (!newOrgName.trim()) throw new Error("Nome é obrigatório");
      const slug = newOrgName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
      const { data: org, error } = await supabase.from("organizations").insert({ name: newOrgName, slug, niche: newOrgNiche } as any).select().single();
      if (error) throw error;
      // Create trial subscription
      await supabase.from("subscriptions").insert({ organization_id: org.id, plan_type: "trial", expires_at: new Date(Date.now() + 3 * 86400000).toISOString(), status: "active" });
      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
      setShowNewOrg(false);
      setNewOrgName("");
      toast({ title: "Organização criada com sucesso!" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (checkingAdmin) {
    return <AppLayout><div className="flex items-center justify-center min-h-[50vh]"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></AppLayout>;
  }
  if (!isAdmin) {
    return <AppLayout><div className="flex flex-col items-center justify-center min-h-[50vh] text-center"><Shield className="h-16 w-16 text-muted-foreground mb-4" /><h2 className="text-xl font-bold text-foreground">Acesso Restrito</h2><p className="text-muted-foreground mt-2">Você não tem permissão para acessar esta área.</p></div></AppLayout>;
  }

  const filtered = orgs.filter((o: any) =>
    o.name.toLowerCase().includes(search.toLowerCase()) || o.slug.toLowerCase().includes(search.toLowerCase())
  );

  const getSubStatus = (sub: any) => {
    if (!sub) return { label: "Sem licença", variant: "destructive" as const };
    const expires = new Date(sub.expires_at);
    if (expires < new Date()) return { label: "Expirado", variant: "destructive" as const };
    const daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86400000);
    if (daysLeft <= 3) return { label: `${daysLeft}d`, variant: "secondary" as const };
    return { label: "Ativo", variant: "default" as const };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" /> Super Admin
            </h1>
            <p className="text-muted-foreground text-sm">Gerenciamento de Clientes (Empresas)</p>
          </div>
          <Button onClick={() => setShowNewOrg(true)} className="gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" /> Nova Empresa
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-bold text-foreground">{orgs.length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center"><Calendar className="h-5 w-5 text-accent" /></div>
            <div><p className="text-xs text-muted-foreground">Ativas</p><p className="text-lg font-bold text-foreground">{orgs.filter((o: any) => { const s = Array.isArray(o.subscriptions) ? o.subscriptions[0] : o.subscriptions; return s && new Date(s.expires_at) > new Date(); }).length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center"><Ban className="h-5 w-5 text-destructive" /></div>
            <div><p className="text-xs text-muted-foreground">Expiradas</p><p className="text-lg font-bold text-foreground">{orgs.filter((o: any) => { const s = Array.isArray(o.subscriptions) ? o.subscriptions[0] : o.subscriptions; return !s || new Date(s.expires_at) <= new Date(); }).length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center"><Building2 className="h-5 w-5 text-muted-foreground" /></div>
            <div><p className="text-xs text-muted-foreground">Suspensas</p><p className="text-lg font-bold text-foreground">{orgs.filter((o: any) => !o.active).length}</p></div>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base">Empresas & Licenças</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Nicho</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((org: any) => {
                    const sub = Array.isArray(org.subscriptions) ? org.subscriptions[0] : org.subscriptions;
                    const status = getSubStatus(sub);
                    return (
                      <TableRow key={org.id} className={!org.active ? "opacity-50" : ""}>
                        <TableCell>
                          <p className="text-sm font-medium">{org.name}</p>
                          {org.cnpj && <p className="text-xs text-muted-foreground">{org.cnpj}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{org.niche}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{sub?.plan_type || "-"}</TableCell>
                        <TableCell className="text-sm">
                          {sub ? format(new Date(sub.expires_at), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                            {!org.active && <Badge variant="destructive" className="text-xs">Suspensa</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setEditSub(org); setSelectedPlan("30_dias"); }}>
                              <Edit2 className="h-3 w-3 mr-1" /> Licença
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (window.confirm(org.active ? `Suspender "${org.name}"?` : `Reativar "${org.name}"?`)) {
                                  toggleOrgMutation.mutate({ orgId: org.id, active: !org.active });
                                }
                              }}
                            >
                              {org.active ? <Ban className="h-3 w-3 mr-1 text-destructive" /> : <CheckCircle className="h-3 w-3 mr-1 text-primary" />}
                              {org.active ? "Suspender" : "Reativar"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit License Dialog */}
      <Dialog open={!!editSub} onOpenChange={() => setEditSub(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Licença — {editSub?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">Altere o nicho e a duração do plano desta empresa.</p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nicho</Label>
              <Select value={editSub?.niche || "funeraria"} onValueChange={(v) => {
                if (editSub) {
                  supabase.from("organizations").update({ niche: v }).eq("id", editSub.id).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
                    toast({ title: "Nicho atualizado!" });
                  });
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="funeraria">Funerária</SelectItem>
                  <SelectItem value="crediario">Crediário</SelectItem>
                  <SelectItem value="loja">Loja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duração do Plano</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAN_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Validade: {PLAN_DURATIONS[selectedPlan]} dias a partir de hoje.</p>
            </div>
            <Button className="w-full" onClick={() => editSub && updateSubMutation.mutate({ orgId: editSub.id, planType: selectedPlan })} disabled={updateSubMutation.isPending}>
              {updateSubMutation.isPending ? "Salvando..." : "Atualizar Licença"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Org Dialog */}
      <Dialog open={showNewOrg} onOpenChange={setShowNewOrg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Nova Empresa</DialogTitle>
            <p className="text-sm text-muted-foreground">A empresa receberá automaticamente um período de teste.</p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Ex: Funerária Paz Eterna" />
            </div>
            <div className="space-y-2">
              <Label>Nicho</Label>
              <Select value={newOrgNiche} onValueChange={setNewOrgNiche}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="funeraria">Funerária</SelectItem>
                  <SelectItem value="crediario">Crediário</SelectItem>
                  <SelectItem value="loja">Loja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">A empresa receberá automaticamente um trial de 3 dias.</p>
            <Button className="w-full" onClick={() => createOrgMutation.mutate()} disabled={createOrgMutation.isPending}>
              {createOrgMutation.isPending ? "Criando..." : "Criar Empresa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
