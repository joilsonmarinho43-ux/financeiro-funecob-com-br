import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { formatDateBR } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Ban, History, ScrollText } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function CustomerSystemTab({ client, onClose }: { client: any; onClose: () => void }) {
  const navigate = useNavigate();
  const { organizationId } = useOrganization();

  const { data: logs, isLoading } = useQuery({
    queryKey: ["customer-logs", client?.id],
    queryFn: async () => {
      // unified timeline: invoices + auto_settlement_events + whatsapp_messages
      const [{ data: invs }, { data: events }, { data: msgs }] = await Promise.all([
        supabase.from("invoices").select("id, status, due_date, paid_date, amount, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).limit(15),
        supabase.from("auto_settlement_events").select("id, status, amount_detected, created_at").eq("client_id", client.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("whatsapp_messages").select("id, direction, status, created_at, message").eq("client_id", client.id).order("created_at", { ascending: false }).limit(10),
      ]);
      const items: any[] = [];
      (invs || []).forEach(i => items.push({ kind: "invoice", at: i.created_at, label: `Fatura ${i.status} — venc ${formatDateBR(i.due_date)}` }));
      (events || []).forEach(e => items.push({ kind: "pix", at: e.created_at, label: `PIX OCR ${e.status}${e.amount_detected ? ` R$ ${e.amount_detected}` : ""}` }));
      (msgs || []).forEach(m => items.push({ kind: "msg", at: m.created_at, label: `WhatsApp ${m.direction} • ${m.status}` }));
      items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
      return items.slice(0, 30);
    },
    enabled: !!client?.id && !!organizationId,
    staleTime: 30 * 1000,
  });

  const toggleBlock = async () => {
    const newStatus = client.status === "ativo" ? "inativo" : "ativo";
    const verb = newStatus === "inativo" ? "bloquear" : "reativar";
    if (!window.confirm(`Deseja ${verb} este cliente?`)) return;
    const { error } = await supabase.from("clients").update({ status: newStatus }).eq("id", client.id).eq("organization_id", organizationId!);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: `Cliente ${newStatus === "inativo" ? "bloqueado" : "reativado"}` });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="justify-start gap-2 h-auto py-2.5" onClick={() => { navigate("/clients"); onClose(); }}>
          <Pencil className="h-4 w-4 text-primary" />
          <span className="text-xs">Editar cliente</span>
        </Button>
        <Button variant="outline" className="justify-start gap-2 h-auto py-2.5" onClick={toggleBlock}>
          <Ban className="h-4 w-4 text-destructive" />
          <span className="text-xs">{client.status === "ativo" ? "Bloquear" : "Reativar"}</span>
        </Button>
        <Button variant="outline" className="justify-start gap-2 h-auto py-2.5 col-span-2" onClick={() => { navigate("/system-logs"); onClose(); }}>
          <ScrollText className="h-4 w-4" />
          <span className="text-xs">Ver logs do sistema</span>
        </Button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <History className="h-3.5 w-3.5" /> Timeline do cliente
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (logs || []).length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Sem histórico</div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {logs!.map((l, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs border-l-2 border-primary/40 pl-2.5 py-1">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.label}</div>
                  <div className="text-[10px] text-muted-foreground">{formatDateBR(l.at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
