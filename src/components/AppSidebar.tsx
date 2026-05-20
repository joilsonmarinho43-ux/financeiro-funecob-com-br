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
} from "lucide-react";
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
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  end={item.url === "/"}
                  className="hover:bg-sidebar-accent rounded-lg transition-colors"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <item.icon className="h-4 w-4 mr-3 shrink-0" />
                  {!collapsed && <span className="text-sm">{item.title}</span>}
                  {item.badge && !collapsed && (
                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                      {item.badge}
                    </span>
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

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const { organization } = useOrganization();

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
          { title: "Saúde do Sistema", icon: Activity, url: "/system-health", badge: "Novo!" },
          ...(isAdmin ? [
            { title: "Admin", icon: Shield, url: "/admin", badge: "" },
            { title: "Auditoria Recorrência", icon: CalendarCheck, url: "/admin/recurrence", badge: "" },
            { title: "Liquidação Auto", icon: Zap, url: "/admin/auto-settlement", badge: "Novo!" },
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
          {!collapsed && (
            <button
              onClick={signOut}
              className="text-sidebar-muted hover:text-sidebar-accent-foreground transition-colors shrink-0"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
