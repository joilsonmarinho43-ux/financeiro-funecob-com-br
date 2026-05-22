import { Suspense, lazy, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { CustomerHeader } from "./CustomerHeader";

const GeneralTab = lazy(() => import("./CustomerGeneralTab").then(m => ({ default: m.CustomerGeneralTab })));
const FinancialTab = lazy(() => import("./CustomerFinancialTab").then(m => ({ default: m.CustomerFinancialTab })));
const CommunicationTab = lazy(() => import("./CustomerCommunicationTab").then(m => ({ default: m.CustomerCommunicationTab })));
const SystemTab = lazy(() => import("./CustomerSystemTab").then(m => ({ default: m.CustomerSystemTab })));

interface Props {
  clientId: string | null;
  open: boolean;
  onClose: () => void;
}

export function CustomerOperationalPanel({ clientId, open, onClose }: Props) {
  const isMobile = useIsMobile();
  const { organizationId } = useOrganization();
  const [tab, setTab] = useState("geral");

  const { data: client, isLoading } = useQuery({
    queryKey: ["customer-panel", clientId, organizationId],
    queryFn: async () => {
      if (!clientId || !organizationId) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("*, plans:invoices(plan_id, plans(name, price))")
        .eq("id", clientId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId && !!organizationId && open,
    staleTime: 30 * 1000,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[95vh] w-full p-0 flex flex-col rounded-t-xl"
            : "w-full sm:max-w-xl p-0 flex flex-col"
        }
      >
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-base">Painel do Cliente</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading || !client ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <CustomerHeader client={client} />

              <Tabs value={tab} onValueChange={setTab} className="px-3 pb-6">
                <TabsList className="grid grid-cols-4 w-full sticky top-0 z-10">
                  <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
                  <TabsTrigger value="financeiro" className="text-xs">Financeiro</TabsTrigger>
                  <TabsTrigger value="comunicacao" className="text-xs">Comunicação</TabsTrigger>
                  <TabsTrigger value="sistema" className="text-xs">Sistema</TabsTrigger>
                </TabsList>

                <Suspense fallback={<div className="py-6"><Skeleton className="h-40 w-full" /></div>}>
                  <TabsContent value="geral" className="mt-4">
                    {tab === "geral" && <GeneralTab client={client} />}
                  </TabsContent>
                  <TabsContent value="financeiro" className="mt-4">
                    {tab === "financeiro" && <FinancialTab client={client} />}
                  </TabsContent>
                  <TabsContent value="comunicacao" className="mt-4">
                    {tab === "comunicacao" && <CommunicationTab client={client} />}
                  </TabsContent>
                  <TabsContent value="sistema" className="mt-4">
                    {tab === "sistema" && <SystemTab client={client} onClose={onClose} />}
                  </TabsContent>
                </Suspense>
              </Tabs>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
