import {
  LayoutDashboard,
  Users,
  Settings,
  FileText,
  DollarSign,
  Receipt,
  ArrowLeftRight,
  BarChart3,
  MessageSquare,
  LogOut,
  CreditCard,
  Settings2,
  Webhook,
  MessageCircle,
  ScrollText,
  Shield,
  ScanBarcode,
  Globe,
  CalendarCheck,
  Zap,
  Activity,
  FlaskConical,
  KeyRound,
  ChevronUp,
  Eye,
  EyeOff,
  PhoneCall,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";

interface MenuItem {
  title: string;
  icon: React.ElementType;
  url: string;
  badge?: string;
}

const mainItems: MenuItem[] = [
  { title: "Dashboard", icon: LayoutDashboard, url: "/" },
  { title: "Clientes", icon: Users, url: "/clientes" },
  { title: "Planos", icon: FileText, url: "/clientes/planos" },
  { title: "Faturas", icon: DollarSign, url: "/financeiro" },
  { title: "Movimentações", icon: ArrowLeftRight, url: "/movimentacoes" },
  { title: "Prestação", icon: ScanBarcode, url: "/prestacao", badge: "Novo!" },
  { title: "Relatórios", icon: BarChart3, url: "/relatorios" },
];

const billingItems: MenuItem[] = [
  { title: "V3Pay", icon: CreditCard, url: "/v3pay", badge: "Novo!" },
  { title: "Gateways", icon: Settings2, url: "/gateways" },
  { title: "WebHooks", icon: Webhook, url: "/webhooks" },
  { title: "Cobrança", icon: Receipt, url: "/cobranca" },
];

const communicationItems: MenuItem[] = [
  { title: "WhatsApp", icon: MessageSquare, url: "/whatsapp" },
  { title: "SMS", icon: MessageCircle, url: "/sms", badge: "Novo!" },
];

const systemItems: MenuItem[] = [
  { title: "Logs", icon: ScrollText, url: "/logs" },
  { title: "Configurações", icon: Settings, url: "/configuracoes" },
];

function MenuGroup({ label, items }: { label: string; items: MenuItem[] }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-muted font-semibold px-3">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild tooltip={item.title}>
                <NavLink
                  to={item.url}
                  end
                  className="hover:bg-sidebar-accent rounded-lg transition-colors"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  {({ isActive }: { isActive: boolean }) => (
                    <>
                      <item.icon className="h-4 w-4 mr-3 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                      {item.badge && !collapsed && (
                        <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                          {item.badge}
                        </span>
                      )}
                      {isActive && <span className="sr-only">(página atual)</span>}
                    </>
                  )}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const { updatePassword } = useAuth();
  const { user } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast({ title: "Senha atual obrigatória", description: "Informe sua senha atual para confirmar a alteração.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "A nova senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não conferem", description: "A confirmação deve ser igual à nova senha.", variant: "destructive" });
      return;
    }
    if (currentPassword === newPassword) {
      toast({ title: "Senha igual à atual", description: "Escolha uma nova senha diferente da atual.", variant: "destructive" });
      return;
    }
    setLoading(true);
    // Re-autenticar para confirmar identidade
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? "",
      password: currentPassword,
    });
    if (reauthError) {
      toast({ title: "Senha atual incorreta", description: "Não foi possível validar sua senha atual.", variant: "destructive" });
      setLoading(false);
      return;
    }
    const { error } = await updatePassword(newPassword);
    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha alterada com sucesso!", description: "Use sua nova senha no próximo login." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Alterar senha
          </DialogTitle>
          <DialogDescription>Digite sua nova senha abaixo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Senha atual</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova senha</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
            {loading ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const handleSignOut = () => {
    if (window.confirm("Tem certeza que deseja sair?")) {
      signOut();
    }
  };
  const { organization } = useOrganization();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin-sidebar", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      return !!data;
    },
    enabled: !!user,
  });

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";
  const displayEmail = user?.email || "";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const orgName = (organization as any)?.name || "FuneCob";
  const orgLogo = (organization as any)?.logo_url || null;
  const orgInitials = orgName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Sidebar collapsible="icon" className="gradient-sidebar border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {orgLogo ? (
            <img src={orgLogo} alt={orgName} className="h-8 w-8 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-sm">{orgInitials}</span>
            </div>
          )}
          {!collapsed && (
            <div>
              <h2 className="text-sm font-semibold text-sidebar-accent-foreground">{orgName}</h2>
              <p className="text-[11px] text-sidebar-muted">Sistema de Cobrança</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2 space-y-1">
        <MenuGroup label="Principal" items={mainItems} />
        <MenuGroup label="Pagamentos" items={billingItems} />
        <MenuGroup label="Comunicação" items={communicationItems} />
        <MenuGroup label="Sistema" items={[
          ...systemItems,
          ...(isAdmin ? [
            { title: "Saúde do Sistema", icon: Activity, url: "/system-health", badge: "" },
            { title: "Admin", icon: Shield, url: "/admin", badge: "" },
            { title: "Auditoria Recorrência", icon: CalendarCheck, url: "/admin/recurrence", badge: "" },
            { title: "Liquidação Auto", icon: Zap, url: "/admin/auto-settlement", badge: "Novo!" },
            { title: "Comprov. Não Baixados", icon: AlertTriangle, url: "/admin/missed-settlements", badge: "Novo!" },
            { title: "Analytics PIX", icon: Zap, url: "/admin/pix-analytics", badge: "Novo!" },
            { title: "Auditoria Telefones", icon: PhoneCall, url: "/admin/phone-audit", badge: "Novo!" },
            { title: "Sandbox Testes", icon: FlaskConical, url: "/sandbox-tests", badge: "Novo!" },
            { title: "Config Global", icon: Globe, url: "/admin/global-settings", badge: "" },
          ] : []),
        ]} />
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-sidebar-accent-foreground">{initials}</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">{displayName}</p>
              <p className="text-[11px] text-sidebar-muted truncate">{displayEmail}</p>
            </div>
          )}
          {!collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="text-sidebar-muted hover:text-sidebar-accent-foreground transition-colors shrink-0"
                  title="Opções do usuário"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-48">
                <DropdownMenuItem onClick={() => setChangePasswordOpen(true)} className="cursor-pointer">
                  <KeyRound className="h-4 w-4 mr-2" />
                  Alterar senha
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              onClick={handleSignOut}
              className="text-sidebar-muted hover:text-sidebar-accent-foreground transition-colors shrink-0"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarFooter>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </Sidebar>
  );
}
