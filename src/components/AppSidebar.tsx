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
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
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
  items?: { title: string; url: string; icon: React.ElementType }[];
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
    url: "/clientes",
  },
  {
    title: "Planos",
    icon: FileText,
    url: "/clientes/planos",
  },
  {
    title: "Faturas",
    icon: DollarSign,
    url: "/financeiro",
  },
  {
    title: "Movimentações",
    icon: ArrowLeftRight,
    url: "/movimentacoes",
  },
  {
    title: "Relatórios",
    icon: BarChart3,
    url: "/relatorios",
  },
  {
    title: "Cobrança",
    icon: Receipt,
    url: "/cobranca",
  },
  {
    title: "WhatsApp",
    icon: MessageSquare,
    url: "/whatsapp",
  },
  {
    title: "Configurações",
    icon: Settings,
    url: "/configuracoes",
  },
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
  const { user, signOut } = useAuth();

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";
  const displayEmail = user?.email || "";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
