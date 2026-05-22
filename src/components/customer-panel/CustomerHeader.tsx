import { Badge } from "@/components/ui/badge";
import { formatPhone, formatDateBR } from "@/lib/format";
import { User, Phone, IdCard } from "lucide-react";

export function CustomerHeader({ client }: { client: any }) {
  const statusMap: Record<string, { label: string; cls: string }> = {
    ativo: { label: "Ativo", cls: "bg-success/10 text-success border-success/30" },
    inativo: { label: "Inativo", cls: "bg-muted text-muted-foreground" },
    desativado: { label: "Desativado", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  };
  const st = statusMap[client?.status] || { label: client?.status || "—", cls: "bg-muted" };

  return (
    <div className="px-4 py-4 bg-muted/30 border-b">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-base text-foreground truncate">{client?.name}</h2>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.label}</Badge>
            {client?.temperature && (
              <Badge variant="outline" className="text-[10px]">{client.temperature}</Badge>
            )}
            {client?.client_code && (
              <Badge variant="outline" className="text-[10px]">#{client.client_code}</Badge>
            )}
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {client?.phone && (
              <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {formatPhone(client.phone)}</div>
            )}
            {client?.document && (
              <div className="flex items-center gap-1.5"><IdCard className="h-3 w-3" /> {client.document}</div>
            )}
            <div className="text-[10px] opacity-70">Cadastrado em {formatDateBR(client?.created_at)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
