import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";

const parseDateLocal = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
};
import { ptBR } from "date-fns/locale";
import {
  FileText, CheckCircle, AlertTriangle, Clock, CreditCard,
  Building2, User, Phone, Mail, Copy, Check, XCircle,
  DollarSign, CalendarDays, TrendingUp, PlusCircle,
} from "lucide-react";

interface Invoice {
  id: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: string;
  description: string | null;
  created_at: string;
}

interface PortalData {
  client: { id: string; name: string; phone: string; email: string; document: string };
  organization: { name: string; logo_url: string | null; primary_color: string | null };
  invoices: Invoice[];
  billing: { pix_key: string | null; pix_key_type: string | null; pix_holder_name: string | null; billing_mode: string } | null;
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<"all" | "aberto" | "vencido" | "pago">("all");
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<{ dueDate: string; amount: number; description: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    loadPortalData();
  }, [token]);

  const loadPortalData = async () => {
    try {
      const { data: result, error: err } = await supabase.functions.invoke("client-portal", {
        body: { token },
      });
      if (err) throw err;
      if (result.error) {
        setError(result.error);
      } else {
        setData(result);
      }
    } catch {
      setError("Não foi possível carregar seus dados. Verifique o link.");
    } finally {
      setLoading(false);
    }
  };

  const copyPixKey = async () => {
    if (!data?.billing?.pix_key) return;
    await navigator.clipboard.writeText(data.billing.pix_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 text-sm">Carregando seu portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">Link Inválido</h1>
            <p className="text-slate-500 text-sm">
              {error || "Este link de acesso é inválido ou expirou. Solicite um novo link ao seu prestador de serviços."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredInvoices = data.invoices.filter((inv) => {
    if (filter === "all") return true;
    if (filter === "vencido") return inv.status === "vencido" || (inv.status === "aberto" && parseDateLocal(inv.due_date) < new Date());
    return inv.status === filter;
  });

  const totalPending = data.invoices
    .filter((i) => i.status !== "pago")
    .reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = data.invoices
    .filter((i) => i.status === "pago")
    .reduce((s, i) => s + Number(i.amount), 0);
  const overdueCount = data.invoices.filter(
    (i) => i.status !== "pago" && parseDateLocal(i.due_date) < new Date()
  ).length;

  const primaryColor = data.organization.primary_color || "#0ea5e9";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header
        className="py-5 px-4 shadow-sm"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {data.organization.logo_url ? (
            <img
              src={data.organization.logo_url}
              alt={data.organization.name}
              className="h-10 w-10 rounded-xl object-cover bg-white/20 p-0.5"
            />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-white font-bold text-lg">{data.organization.name}</h1>
            <p className="text-white/70 text-xs">Portal do Cliente</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-5 pb-12">
        {/* Client Info */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{data.client.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  {data.client.phone && (
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{data.client.phone}</span>
                  )}
                  {data.client.email && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{data.client.email}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-0 shadow-md">
            <CardContent className="p-3 text-center">
              <DollarSign className="h-5 w-5 mx-auto text-orange-500 mb-1" />
              <p className="text-xs text-slate-500">Em aberto</p>
              <p className="font-bold text-sm text-slate-800">{formatCurrency(totalPending)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-3 text-center">
              <CheckCircle className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-xs text-slate-500">Total pago</p>
              <p className="font-bold text-sm text-slate-800">{formatCurrency(totalPaid)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-3 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-1" />
              <p className="text-xs text-slate-500">Vencidas</p>
              <p className="font-bold text-sm text-red-600">{overdueCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Pix Key */}
        {data.billing?.pix_key && (
          <Card className="border-0 shadow-md border-l-4" style={{ borderLeftColor: primaryColor }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Chave Pix para pagamento
                  </p>
              <p className="font-mono text-sm text-slate-800 truncate">{data.billing.pix_key}</p>
                  {data.billing.pix_holder_name && (
                    <p className="text-xs text-slate-500 mt-0.5">Titular: {data.billing.pix_holder_name}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyPixKey}
                  className="flex-shrink-0"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generate Invoice Button */}
        <Button
          className="w-full"
          style={{ background: primaryColor }}
          disabled={generating}
          onClick={() => {
            if (!data) return;
            const referenceInvoice = data.invoices[0] || null;
            const dueDay = referenceInvoice
              ? parseDateLocal(referenceInvoice.due_date).getDate()
              : new Date().getDate();
            const now = new Date();
            let month = now.getMonth();
            let year = now.getFullYear();
            if (now.getDate() > dueDay) { month++; if (month > 11) { month = 0; year++; } }
            const dd = String(dueDay).padStart(2, "0");
            const mm = String(month + 1).padStart(2, "0");
            const dueDate = `${year}-${mm}-${dd}`;
            const amount = referenceInvoice ? Number(referenceInvoice.amount) : 0;
            const monthName = parseDateLocal(dueDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
            setPreview({ dueDate, amount, description: `Mensalidade — ${monthName}` });
            setPreviewOpen(true);
          }}
        >
          <PlusCircle className="h-4 w-4 mr-2" />
          Gerar Mensalidade
        </Button>

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={(o) => !generating && setPreviewOpen(o)}>
          <DialogContent className="max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <PlusCircle className="h-4 w-4" /> Confirmar nova mensalidade
              </DialogTitle>
            </DialogHeader>
            {preview && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  Confira os dados antes de confirmar a geração.
                </p>
                <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Descrição</span>
                    <span className="text-sm font-medium text-slate-800 text-right">{preview.description}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> Vencimento
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      {format(parseDateLocal(preview.dueDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-xs text-slate-500">Valor</span>
                    <span className="text-lg font-bold" style={{ color: primaryColor }}>
                      {formatCurrency(preview.amount)}
                    </span>
                  </div>
                </div>
                {preview.amount <= 0 && (
                  <p className="text-xs text-red-600">
                    Valor inválido. Não é possível gerar uma mensalidade com valor zero.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPreviewOpen(false)}
                    disabled={generating}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    style={{ background: primaryColor }}
                    disabled={generating || preview.amount <= 0}
                    onClick={async () => {
                      if (!token || !preview) return;
                      setGenerating(true);
                      try {
                        const { data: result, error: err } = await supabase.functions.invoke("client-portal", {
                          body: { token, action: "generate_invoice", due_date: preview.dueDate },
                        });
                        if (err) throw err;
                        if (result?.error) throw new Error(result.error);
                        setPreviewOpen(false);
                        setPreview(null);
                        await loadPortalData();
                      } catch (e: any) {
                        alert(e.message || "Erro ao gerar fatura. Tente novamente.");
                      } finally {
                        setGenerating(false);
                      }
                    }}
                  >
                    {generating ? "Gerando..." : "Confirmar"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Invoices */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Minhas Faturas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Filter tabs */}
            <div className="px-4 pb-2">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
                <TabsList className="w-full grid grid-cols-4 h-8">
                  <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
                  <TabsTrigger value="aberto" className="text-xs">Abertas</TabsTrigger>
                  <TabsTrigger value="vencido" className="text-xs">Vencidas</TabsTrigger>
                  <TabsTrigger value="pago" className="text-xs">Pagas</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Mobile-friendly invoice list */}
            <div className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Nenhuma fatura encontrada
                </div>
              ) : (
                filteredInvoices.map((inv) => {
                  const isOverdue = inv.status !== "pago" && parseDateLocal(inv.due_date) < new Date();
                  const statusLabel =
                    inv.status === "pago" ? "Pago" : isOverdue ? "Vencida" : "Em aberto";
                  const statusColor =
                    inv.status === "pago"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : isOverdue
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-yellow-50 text-yellow-700 border-yellow-200";

                  return (
                    <button
                      key={inv.id}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                      onClick={() => setSelectedInvoice(inv)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {inv.description || "Fatura"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {format(parseDateLocal(inv.due_date), "dd/MM/yyyy")}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        <p className="font-bold text-sm text-slate-800 flex-shrink-0">
                          {formatCurrency(Number(inv.amount))}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pt-4">
          Powered by <span className="font-semibold">FuneCob</span>
        </p>
      </main>

      {/* Invoice detail dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Detalhes da Fatura
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Valor</p>
                  <p className="font-bold text-lg">{formatCurrency(Number(selectedInvoice.amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <Badge
                    variant={
                      selectedInvoice.status === "pago"
                        ? "default"
                        : selectedInvoice.status === "vencido" ||
                         parseDateLocal(selectedInvoice.due_date) < new Date()
                        ? "destructive"
                        : "secondary"
                    }
                    className="mt-1"
                  >
                    {selectedInvoice.status === "pago"
                      ? "Pago"
                      : parseDateLocal(selectedInvoice.due_date) < new Date()
                      ? "Vencida"
                      : "Em aberto"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vencimento</p>
                  <p className="text-sm font-medium">
                    {format(parseDateLocal(selectedInvoice.due_date), "dd/MM/yyyy")}
                  </p>
                </div>
                {selectedInvoice.paid_date && (
                  <div>
                    <p className="text-xs text-slate-500">Data do Pagamento</p>
                    <p className="text-sm font-medium">
                      {format(parseDateLocal(selectedInvoice.paid_date), "dd/MM/yyyy")}
                    </p>
                  </div>
                )}
              </div>

              {selectedInvoice.description && (
                <div>
                  <p className="text-xs text-slate-500">Descrição</p>
                  <p className="text-sm">{selectedInvoice.description}</p>
                </div>
              )}

              {data?.billing?.pix_key && selectedInvoice.status !== "pago" && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-600">Pague via Pix</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white px-2 py-1 rounded border flex-1 truncate">
                      {data.billing.pix_key}
                    </code>
                    <Button size="sm" variant="outline" onClick={copyPixKey}>
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
