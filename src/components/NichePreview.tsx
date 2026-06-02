import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, FileBarChart, Users, Receipt, ShoppingBag, Calendar } from "lucide-react";

const TERMS_BY_NICHE: Record<string, {
  plan: string; plans: string;
  invoice: string; invoices: string;
  client: string; clients: string;
  event: string; installment: string;
  receipt: string; creditLimit: string;
}> = {
  funeraria: {
    plan: "Plano Familiar", plans: "Planos Familiares",
    invoice: "Mensalidade", invoices: "Mensalidades",
    client: "Associado", clients: "Associados",
    event: "Óbito", installment: "Mensalidade",
    receipt: "Comprovante", creditLimit: "Cobertura",
  },
  crediario: {
    plan: "Carnê", plans: "Carnês",
    invoice: "Parcela", invoices: "Parcelas",
    client: "Cliente", clients: "Clientes",
    event: "Compra", installment: "Parcela",
    receipt: "Recibo", creditLimit: "Limite de Crédito",
  },
  loja: {
    plan: "Plano de Pagamento", plans: "Planos de Pagamento",
    invoice: "Cobrança", invoices: "Cobranças",
    client: "Cliente", clients: "Clientes",
    event: "Venda", installment: "Parcela",
    receipt: "Recibo", creditLimit: "Limite de Crédito",
  },
  oticas: {
    plan: "Plano de Pagamento", plans: "Planos de Pagamento",
    invoice: "Parcela", invoices: "Parcelas",
    client: "Cliente", clients: "Clientes",
    event: "Venda de Óculos", installment: "Parcela",
    receipt: "Recibo", creditLimit: "Limite de Crédito",
  },
};

interface NichePreviewProps {
  niche: string;
}

export function NichePreview({ niche }: NichePreviewProps) {
  const t = TERMS_BY_NICHE[niche] || TERMS_BY_NICHE.funeraria;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Pré-visualização dos termos</p>
        <Badge variant="outline" className="text-xs capitalize">{niche}</Badge>
      </div>

      {/* Mock Dashboard */}
      <Card className="border-dashed">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LayoutDashboard className="h-3 w-3" />
            <span className="font-medium uppercase tracking-wide">Dashboard</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted/40 p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" /> Total de {t.clients}
              </div>
              <p className="text-base font-bold text-foreground mt-0.5">128</p>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Receipt className="h-3 w-3" /> {t.invoices} em aberto
              </div>
              <p className="text-base font-bold text-foreground mt-0.5">42</p>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <ShoppingBag className="h-3 w-3" /> {t.event}s do mês
              </div>
              <p className="text-base font-bold text-foreground mt-0.5">17</p>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Calendar className="h-3 w-3" /> {t.plans} ativos
              </div>
              <p className="text-base font-bold text-foreground mt-0.5">31</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mock Reports */}
      <Card className="border-dashed">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileBarChart className="h-3 w-3" />
            <span className="font-medium uppercase tracking-wide">Relatórios</span>
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <div className="grid grid-cols-4 gap-1 px-2 py-1.5 bg-muted/40 text-[10px] font-medium text-muted-foreground">
              <span>{t.client}</span>
              <span>{t.invoice}</span>
              <span>{t.installment}</span>
              <span className="text-right">Status</span>
            </div>
            <div className="grid grid-cols-4 gap-1 px-2 py-1.5 text-[10px] text-foreground border-t border-border">
              <span>João S.</span>
              <span>#0001</span>
              <span>1/12</span>
              <span className="text-right text-primary">Pago</span>
            </div>
            <div className="grid grid-cols-4 gap-1 px-2 py-1.5 text-[10px] text-foreground border-t border-border">
              <span>Maria L.</span>
              <span>#0002</span>
              <span>3/6</span>
              <span className="text-right text-destructive">Vencido</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Glossary */}
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        {[
          ["Cobrança", t.invoice],
          ["Cliente", t.client],
          ["Venda", t.event],
          ["Parcela", t.installment],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
