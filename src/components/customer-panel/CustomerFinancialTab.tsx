import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { formatCurrency, formatDateBR } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export function CustomerFinancialTab({ client }: { client: any }) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [payingId, setPayingId] = useState<string | null>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["customer-financial", client?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, amount, due_date, paid_date, status, description")
        .eq("client_id", client.id)
        .eq("organization_id", organizationId!)
        .order("due_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!client?.id && !!organizationId,
    staleTime: 30 * 1000,
  });

  const totalPaid = (invoices || []).filter(i => i.status === "pago").reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = (invoices || []).filter(i => i.status === "aberto").reduce((s, i) => s + Number(i.amount), 0);

  const handlePay = async (invId: string) => {
    if (!window.confirm("Confirmar pagamento desta fatura?")) return;
    setPayingId(invId);
    try {
      const paidDate = new Date().toISOString().split("T")[0];
      const { data: result, error } = await supabase.functions.invoke("baixa-manual", {
        body: { invoice_id: invId, paid_date: paidDate, organization_id: organizationId },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      queryClient.invalidateQueries({ queryKey: ["customer-financial", client.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overdue"] });
      toast({ title: "Pagamento confirmado! ✅" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha", variant: "destructive" });
    } finally {
      setPayingId(null);
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-success/5 p-3">
          <div className="text-[10px] text-muted-foreground">Total pago</div>
          <div className="text-sm font-semibold text-success">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="rounded-lg border bg-warning/5 p-3">
          <div className="text-[10px] text-muted-foreground">Total pendente</div>
          <div className="text-sm font-semibold text-warning">{formatCurrency(totalPending)}</div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground">Faturas</div>
        {(invoices || []).length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">Sem faturas</div>
        )}
        {(invoices || []).map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-xs">
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{inv.description || "Fatura"}</div>
              <div className="text-[10px] text-muted-foreground">
                Venc.: {formatDateBR(inv.due_date)}
                {inv.paid_date && ` • Pago: ${formatDateBR(inv.paid_date)}`}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-semibold">{formatCurrency(inv.amount)}</div>
              <Badge variant="outline" className="text-[9px] mt-0.5">{inv.status}</Badge>
            </div>
            {inv.status === "aberto" && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-success"
                onClick={() => handlePay(inv.id)}
                disabled={payingId === inv.id}
                title="Marcar como pago"
              >
                {payingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
