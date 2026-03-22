import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Shield, Users, Calendar, Search, Edit2 } from "lucide-react";

const PLAN_DURATIONS: Record<string, number> = {
  "3_dias": 3,
  "30_dias": 30,
  "90_dias": 90,
  "180_dias": 180,
  "365_dias": 365,
};

const PLAN_LABELS: Record<string, string> = {
  "3_dias": "3 dias (Trial)",
  "30_dias": "30 dias",
  "90_dias": "90 dias",
  "180_dias": "6 meses",
  "365_dias": "1 ano",
};

export default function AdminPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editSub, setEditSub] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState("30_dias");

  // Check if current user is admin
  const { data: isAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (error) return false;
      return data;
    },
    enabled: !!user,
  });

  // Fetch all organizations with their subscriptions (admin only)
  const { data: orgs = [] } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: async () => {
      const { data: allOrgs, error } = await supabase
        .from("organizations")
        .select("*, subscriptions(*), organization_members(user_id, role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return allOrgs;
    },
    enabled: !!isAdmin,
  });

  const updateSubMutation = useMutation({
    mutationFn: async ({ orgId, planType }: { orgId: string; planType: string }) => {
      const days = PLAN_DURATIONS[planType] || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      // Check if subscription exists
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            plan_type: planType,
            starts_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            status: "active",
          })
          .eq("organization_id", orgId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subscriptions")
          .insert({
            organization_id: orgId,
            plan_type: planType,
            starts_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            status: "active",
          });
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

  if (checkingAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <Shield className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground">Acesso Restrito</h2>
          <p className="text-muted-foreground mt-2">Você não tem permissão para acessar esta área.</p>
        </div>
      </AppLayout>
    );
  }

  const filtered = orgs.filter((o: any) =>
    o.name.toLowerCase().includes(search.toLowerCase()) || o.slug.toLowerCase().includes(search.toLowerCase())
  );

  const getSubStatus = (sub: any) => {
    if (!sub) return { label: "Sem licença", variant: "destructive" as const };
    const now = new Date();
    const expires = new Date(sub.expires_at);
    if (expires < now) return { label: "Expirado", variant: "destructive" as const };
    const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 3) return { label: `${daysLeft}d restante${daysLeft > 1 ? "s" : ""}`, variant: "secondary" as const };
    return { label: "Ativo", variant: "default" as const };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Painel Admin
          </h1>
          <p className="text-muted-foreground text-sm">Gerencie usuários e licenças</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Organizações</p>
                <p className="text-lg font-bold text-foreground">{orgs.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Licenças Ativas</p>
                <p className="text-lg font-bold text-foreground">
                  {orgs.filter((o: any) => {
                    const sub = Array.isArray(o.subscriptions) ? o.subscriptions[0] : o.subscriptions;
                    return sub && new Date(sub.expires_at) > new Date();
                  }).length}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expiradas</p>
                <p className="text-lg font-bold text-foreground">
                  {orgs.filter((o: any) => {
                    const sub = Array.isArray(o.subscriptions) ? o.subscriptions[0] : o.subscriptions;
                    return !sub || new Date(sub.expires_at) <= new Date();
                  }).length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base">Organizações & Licenças</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar organização..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organização</TableHead>
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
                      <TableRow key={org.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{org.name}</p>
                          <p className="text-xs text-muted-foreground">{org.niche}</p>
                        </TableCell>
                        <TableCell className="text-sm">{sub?.plan_type || "-"}</TableCell>
                        <TableCell className="text-sm">
                          {sub ? format(new Date(sub.expires_at), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setEditSub(org); setSelectedPlan("30_dias"); }}>
                            <Edit2 className="h-3 w-3 mr-1" /> Editar
                          </Button>
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

      <Dialog open={!!editSub} onOpenChange={() => setEditSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Licença — {editSub?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <p className="text-xs text-muted-foreground">
                A validade será definida para {PLAN_DURATIONS[selectedPlan]} dias a partir de hoje.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => editSub && updateSubMutation.mutate({ orgId: editSub.id, planType: selectedPlan })}
              disabled={updateSubMutation.isPending}
            >
              {updateSubMutation.isPending ? "Salvando..." : "Atualizar Licença"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
