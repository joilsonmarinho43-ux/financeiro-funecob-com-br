import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateBR, parseDateLocal } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function CustomerGeneralTab({ client }: { client: any }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-general", client?.id],
    queryFn: async () => {
      const [{ data: lastPaid }, { data: nextOpen }, { data: lastPlan }] = await Promise.all([
        supabase.from("invoices").select("paid_date, amount").eq("client_id", client.id).eq("status", "pago").order("paid_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("invoices").select("due_date, amount, plan_id, plans(name)").eq("client_id", client.id).eq("status", "aberto").order("due_date", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("invoices").select("plan_id, plans(name, price)").eq("client_id", client.id).not("plan_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { lastPaid, nextOpen, plan: (lastPlan?.plans as any) };
    },
    enabled: !!client?.id,
    staleTime: 60 * 1000,
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between items-start py-2 border-b border-border/50 last:border-0 gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right break-words">{value || "—"}</span>
    </div>
  );

  return (
    <div className="space-y-1">
      <Row label="Nome" value={client.name} />
      <Row label="Telefone" value={client.phone} />
      <Row label="CPF/Doc" value={client.document} />
      <Row label="E-mail" value={client.email} />
      <Row label="Endereço" value={client.address} />
      <Row label="Plano" value={data?.plan?.name} />
      <Row label="Valor do plano" value={data?.plan?.price ? formatCurrency(data.plan.price) : "—"} />
      <Row
        label="Status"
        value={<Badge variant="outline" className="text-[10px]">{client.status}</Badge>}
      />
      <Row label="Próximo vencimento" value={data?.nextOpen?.due_date ? formatDateBR(data.nextOpen.due_date) : "—"} />
      <Row label="Data de cadastro" value={formatDateBR(client.created_at)} />
      <Row label="Último pagamento" value={data?.lastPaid?.paid_date ? `${formatDateBR(data.lastPaid.paid_date)} • ${formatCurrency(data.lastPaid.amount)}` : "—"} />
    </div>
  );
}
