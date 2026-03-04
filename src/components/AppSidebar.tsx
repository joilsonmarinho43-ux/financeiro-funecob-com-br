import {
  LayoutDashboard,
  Users,
  UserPlus,
  Settings,
  FileText,
  DollarSign,
  Receipt,
  CheckCircle,
  ShoppingCart,
  Server,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Building2,
  Download,
  Tag,
  Zap,
  Globe,
  Webhook,
  MessageSquare,
  Mail,
  Send,
  Radio,
  Megaphone,
  Smartphone,
  MessageCircle,
  Gift,
  MoreHorizontal,
  ScrollText,
  ChevronDown,
  Home,
  Grid3X3,
} from "lucide-react";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface MenuSection {
  title: string;
  icon: React.ElementType;
  items?: { title: string; url: string; icon: React.ElementType; badge?: string }[];
  url?: string;
  badge?: string;
}

const menuSections: MenuSection[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    url: "/",
  },
  {
    title: "Clientes",
    icon: Users,
    items: [
      { title: "Adicionar", url: "/clientes/adicionar", icon: UserPlus },
      { title: "Gerenciar", url: "/clientes/gerenciar", icon: Settings },
      { title: "Planos", url: "/clientes/planos", icon: FileText },
    ],
  },
  {
    title: "Financeiro",
    icon: DollarSign,
    items: [
      { title: "Faturas em Aberto", url: "/financeiro/aberto", icon: Receipt },
      { title: "Faturas Pagas", url: "/financeiro/pagas", icon: CheckCircle },
      { title: "Gerenciar Vendas", url: "/financeiro/vendas", icon: ShoppingCart },
      { title: "Gerenciar Custo Servidor", url: "/financeiro/servidor", icon: Server },
      { title: "Entradas e Saídas", url: "/financeiro/entradas-saidas", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Movimentações",
    icon: ArrowLeftRight,
    items: [
      { title: "Gerenciar Entradas", url: "/movimentacoes/entradas", icon: TrendingUp },
      { title: "Gerenciar Saídas", url: "/movimentacoes/saidas", icon: TrendingDown },
    ],
  },
  {
    title: "Relatórios",
    icon: BarChart3,
    items: [
      { title: "Gráfico/Detalhamento", url: "/relatorios/grafico", icon: BarChart3 },
      { title: "Detalhamento por Banco", url: "/relatorios/banco", icon: Building2 },
      { title: "Exportar Relatórios", url: "/relatorios/exportar", icon: Download },
    ],
  },
  { title: "Tags", icon: Tag, url: "/tags" },
  { title: "V3Pay", icon: Zap, url: "/v3pay", badge: "Novo!" },
  { title: "Gateways", icon: Globe, url: "/gateways" },
  { title: "WebHook", icon: Webhook, url: "/webhook" },
  {
    title: "WhatsApp",
    icon: MessageSquare,
    items: [
      { title: "Gerenciar Mensagens", url: "/whatsapp/mensagens", icon: Mail },
      { title: "Fila de Mensagens", url: "/whatsapp/fila", icon: Send },
      { title: "Envios em Massa", url: "/whatsapp/massa", icon: Radio },
      { title: "Gerenciar Campanhas", url: "/whatsapp/campanhas", icon: Megaphone },
      { title: "Parear WhatsApp", url: "/whatsapp/parear", icon: Smartphone },
    ],
  },
  { title: "SMS", icon: MessageCircle, url: "/sms" },
  { title: "Indicações", icon: Gift, url: "/indicacoes" },
  { title: "Outros", icon: MoreHorizontal, url: "/outros" },
  { title: "Logs", icon: ScrollText, url: "/logs" },
  { title: "Configurações", icon: Settings, url: "/configuracoes" },
];

function CollapsibleMenuItem({ section }: { section: MenuSection }) {
  const [open, setOpen] = useState(false);
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="w-full justify-between hover:bg-sidebar-accent cursor-pointer">
            <span className="flex items-center gap-3">
              <section.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{section.title}</span>}
            </span>
            {!collapsed && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            )}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 border-l border-sidebar-border pl-2 mt-1 space-y-0.5">
            {section.items?.map((item) => (
              <SidebarMenuButton key={item.url} asChild className="h-8">
                <NavLink
                  to={item.url}
                  className="hover:bg-sidebar-accent text-sidebar-foreground"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <item.icon className="h-3.5 w-3.5 mr-2 shrink-0" />
                  {!collapsed && <span className="text-sm">{item.title}</span>}
                  {item.badge && !collapsed && (
                    <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              </SidebarMenuButton>
            ))}
          </div>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="gradient-sidebar border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-sm">FC</span>
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-sm font-semibold text-sidebar-accent-foreground">FuneCob</h2>
              <p className="text-[11px] text-sidebar-muted">Sistema de Cobrança</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarMenu>
          {menuSections.map((section) => {
            if (section.items) {
              return <CollapsibleMenuItem key={section.title} section={section} />;
            }
            return (
              <SidebarMenuItem key={section.title}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={section.url!}
                    end={section.url === "/"}
                    className="hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <section.icon className="h-4 w-4 mr-3 shrink-0" />
                    {!collapsed && <span>{section.title}</span>}
                    {section.badge && !collapsed && (
                      <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                        {section.badge}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-sidebar-accent-foreground">AD</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">Administrador</p>
              <p className="text-[11px] text-sidebar-muted truncate">admin@funecob.com</p>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
