import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { format } from "date-fns";
import {
  ScanBarcode, CheckCircle2, CalendarClock, RotateCcw,
  User, DollarSign, Loader2, AlertTriangle, History
} from "lucide-react";

interface ParsedBarcode {
  clientCode: string;
  year: string;
  month: string;
}

function parseBarcode(raw: string, config: { client_id_length: number; year_length: number; month_length: number }): ParsedBarcode | null {
  const clean = raw.replace(/\D/g, "");
  const totalLen = config.client_id_length + config.year_length + config.month_length;
  if (clean.length < totalLen) return null;
  return {
    clientCode: clean.substring(0, config.client_id_length),
    year: clean.substring(config.client_id_length, config.client_id_length + config.year_length),
    month: clean.substring(config.client_id_length + config.year_length, totalLen),
  };
}

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Settlement() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [barcode, setBarcode] = useState("");
  const [foundClient, setFoundClient] = useState<any>(null);
  const [clientInvoices, setClientInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [remarcarOpen, setRemarcarOpen] = useState(false);
  const [remarcarDate, setRemarcarDate] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [bipsHistory, setBipsHistory] = useState<any[]>([]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load barcode config
  const { data: barcodeConfig } = useQuery({
    queryKey: ["barcode-config", organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("barcode_configs")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      return (data as any) || { client_id_length: 7, year_length: 4, month_length: 2 };
    },
    enabled: !!organizationId,
  });

  // Load recent bips
  const { data: recentBips = [] } = useQuery({
    queryKey: ["recent-bips", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data } = await supabase
        .from("bips")
        .select("*, clients(name, phone)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
    enabled: !!organizationId,
  });

  // Listen for realtime bips
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel("bips-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bips" }, () => {
        queryClient.invalidateQueries({ queryKey: ["recent-bips"] });
        toast({ title: "🔔 Novo bip recebido!" });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  const processBarcode = useCallback(async (raw: string) => {
    if (!organizationId || !barcodeConfig) return;
    setLoading(true);
    setFoundClient(null);
    setClientInvoices([]);

    try {
      const parsed = parseBarcode(raw, barcodeConfig);
      if (!parsed) {
        toast({ title: "Código inválido", description: "O código de barras não corresponde ao formato configurado.", variant: "destructive" });
        return;
      }

      // Find client by client_code
      const { data: client } = await supabase
        .from("clients")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_code", parsed.clientCode)
        .maybeSingle();

      if (!client) {
        toast({ title: "Cliente não encontrado", description: `Código: ${parsed.clientCode}`, variant: "destructive" });
        return;
      }

      setFoundClient(client);

      // Find invoices for this client (open ones first)
      const { data: invoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("client_id", client.id)
        .order("due_date", { ascending: true });

      setClientInvoices(invoices || []);

      // Try to find the specific invoice by year/month
      const targetDate = `${parsed.year}-${parsed.month}`;
      const matchingInvoice = (invoices || []).find((inv: any) => inv.due_date.startsWith(targetDate) && inv.status === "aberto");
      if (matchingInvoice) {
        setSelectedInvoice(matchingInvoice);
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [organizationId, barcodeConfig, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && barcode.trim()) {
      processBarcode(barcode.trim());
    }
  };

  // Action: BAIXAR PAGO
  const baixarMutation = useMutation({
    mutationFn: async (invoice: any) => {
      if (!organizationId || !user) throw new Error("Erro de contexto");

      // Mark invoice as paid
      await supabase.from("invoices").update({ status: "pago", paid_date: format(new Date(), "yyyy-MM-dd") }).eq("id", invoice.id);

      // Create transaction
      await supabase.from("transactions").insert({
        organization_id: organizationId,
        type: "entrada",
        amount: invoice.amount,
        description: `Baixa - ${foundClient?.name} - ${invoice.description || "Fatura"}`,
        invoice_id: invoice.id,
        created_by: user.id,
      });

      // Record bip
      await supabase.from("bips").insert({
        organization_id: organizationId,
        client_id: foundClient?.id,
        collector_id: user.id,
        barcode_raw: barcode,
        action: "baixa",
        amount: invoice.amount,
        invoice_id: invoice.id,
        status: "processed",
      } as any);

      // Send WhatsApp confirmation
      if (foundClient?.phone) {
        await supabase.from("whatsapp_queue").insert({
          organization_id: organizationId,
          phone: foundClient.phone,
          message: `✅ Pagamento confirmado!\n\nCliente: ${foundClient.name}\nValor: ${formatCurrency(Number(invoice.amount))}\nData: ${format(new Date(), "dd/MM/yyyy")}\n\nObrigado pelo pagamento!`,
          status: "queued",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-bips"] });
      toast({ title: "✅ Baixa realizada com sucesso!", description: "Fatura paga, transação registrada e WhatsApp enviado." });
      resetState();
    },
    onError: (err: Error) => toast({ title: "Erro na baixa", description: err.message, variant: "destructive" }),
  });

  // Action: REMARCAR
  const remarcarMutation = useMutation({
    mutationFn: async ({ invoice, newDate }: { invoice: any; newDate: string }) => {
      if (!organizationId || !user) throw new Error("Erro de contexto");

      await supabase.from("invoices").update({ due_date: newDate }).eq("id", invoice.id);

      await supabase.from("bips").insert({
        organization_id: organizationId,
        client_id: foundClient?.id,
        collector_id: user.id,
        barcode_raw: barcode,
        action: "remarcacao",
        invoice_id: invoice.id,
        new_due_date: newDate,
        status: "processed",
      } as any);

      if (foundClient?.phone) {
        await supabase.from("whatsapp_queue").insert({
          organization_id: organizationId,
          phone: foundClient.phone,
          message: `📅 Fatura remarcada!\n\nCliente: ${foundClient.name}\nValor: ${formatCurrency(Number(invoice.amount))}\nNova data: ${format(new Date(newDate + "T12:00:00"), "dd/MM/yyyy")}\n\nAguardamos o pagamento na nova data.`,
          status: "queued",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-bips"] });
      toast({ title: "📅 Fatura remarcada!", description: "Data atualizada e WhatsApp enviado." });
      setRemarcarOpen(false);
      resetState();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  // Action: RETORNO
  const retornoMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user || !foundClient) throw new Error("Erro de contexto");

      await supabase.from("bips").insert({
        organization_id: organizationId,
        client_id: foundClient.id,
        collector_id: user.id,
        barcode_raw: barcode,
        action: "retorno",
        status: "processed",
      } as any);

      if (foundClient.phone) {
        await supabase.from("whatsapp_queue").insert({
          organization_id: organizationId,
          phone: foundClient.phone,
          message: `🔔 Retorno registrado!\n\nCliente: ${foundClient.name}\nNosso cobrador esteve em seu endereço mas não encontrou ninguém.\n\nPor favor, entre em contato para regularizar.`,
          status: "queued",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-bips"] });
      toast({ title: "🔔 Retorno registrado!", description: "WhatsApp de retorno enviado." });
      resetState();
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const resetState = () => {
    setBarcode("");
    setFoundClient(null);
    setClientInvoices([]);
    setSelectedInvoice(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const openInvoices = clientInvoices.filter((i: any) => i.status === "aberto");
  const activeInvoice = selectedInvoice || openInvoices[0];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prestação de Contas</h1>
          <p className="text-sm text-muted-foreground">Escaneie o código de barras para identificar o cliente e processar a baixa</p>
        </div>

        {/* Scanner Input */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center shrink-0">
                <ScanBarcode className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <Label className="text-sm font-medium text-foreground mb-1 block">Código de Barras</Label>
                <Input
                  ref={inputRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escaneie ou digite o código (ex: 0022008202602)..."
                  className="text-lg font-mono h-12"
                  autoFocus
                />
              </div>
              <Button
                onClick={() => barcode.trim() && processBarcode(barcode.trim())}
                disabled={loading || !barcode.trim()}
                className="gradient-primary text-primary-foreground h-12 px-6"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Buscar"}
              </Button>
            </div>
            {barcodeConfig && (
              <p className="text-xs text-muted-foreground mt-2">
                Formato: [{barcodeConfig.client_id_length} dígitos cliente][{barcodeConfig.year_length} dígitos ano][{barcodeConfig.month_length} dígitos mês]
              </p>
            )}
          </CardContent>
        </Card>

        {/* Client Found */}
        {foundClient && (
          <div className="space-y-4">
            {/* Client Info */}
            <Card className="border-0 shadow-sm border-l-4 border-l-primary">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{foundClient.name}</h3>
                      <p className="text-sm text-muted-foreground">{foundClient.phone || "Sem telefone"}</p>
                      {foundClient.client_code && (
                        <Badge variant="outline" className="mt-1 font-mono">{foundClient.client_code}</Badge>
                      )}
                    </div>
                  </div>
                  <Badge className={foundClient.status === "ativo" ? "bg-success/10 text-success border-0" : "bg-destructive/10 text-destructive border-0"}>
                    {foundClient.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Active Invoice + Actions */}
            {activeInvoice && (
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Fatura Selecionada
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Valor</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(Number(activeInvoice.amount))}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Vencimento</p>
                      <p className="text-lg font-bold text-foreground">{format(new Date(activeInvoice.due_date + "T12:00:00"), "dd/MM/yyyy")}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Badge className={activeInvoice.status === "aberto" ? "bg-warning/10 text-warning border-0" : "bg-success/10 text-success border-0"}>
                        {activeInvoice.status}
                      </Badge>
                    </div>
                  </div>

                  {activeInvoice.status === "aberto" && (
                    <div className="grid grid-cols-3 gap-3">
                      <Button
                        onClick={() => baixarMutation.mutate(activeInvoice)}
                        disabled={baixarMutation.isPending}
                        className="h-14 bg-success hover:bg-success/90 text-white font-bold text-sm"
                      >
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                        {baixarMutation.isPending ? "..." : "BAIXAR PAGO"}
                      </Button>
                      <Button
                        onClick={() => { setSelectedInvoice(activeInvoice); setRemarcarOpen(true); }}
                        variant="outline"
                        className="h-14 border-warning text-warning hover:bg-warning/10 font-bold text-sm"
                      >
                        <CalendarClock className="h-5 w-5 mr-2" />
                        REMARCAR
                      </Button>
                      <Button
                        onClick={() => retornoMutation.mutate()}
                        disabled={retornoMutation.isPending}
                        variant="outline"
                        className="h-14 border-destructive text-destructive hover:bg-destructive/10 font-bold text-sm"
                      >
                        <RotateCcw className="h-5 w-5 mr-2" />
                        {retornoMutation.isPending ? "..." : "RETORNO"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* All Invoices */}
            {clientInvoices.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Histórico de Faturas ({clientInvoices.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientInvoices.map((inv: any) => (
                          <TableRow key={inv.id} className={inv.id === activeInvoice?.id ? "bg-primary/5" : ""}>
                            <TableCell className="text-sm">{inv.description || "—"}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(Number(inv.amount))}</TableCell>
                            <TableCell className="text-sm">{format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                            <TableCell>
                              <Badge className={
                                inv.status === "pago" ? "bg-success/10 text-success border-0" :
                                inv.status === "vencido" ? "bg-destructive/10 text-destructive border-0" :
                                "bg-warning/10 text-warning border-0"
                              }>{inv.status}</Badge>
                            </TableCell>
                            <TableCell>
                              {inv.status === "aberto" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => setSelectedInvoice(inv)}
                                >
                                  Selecionar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Recent Bips History */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Últimos Bips
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentBips.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Nenhum bip registrado ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentBips.map((bip: any) => (
                      <TableRow key={bip.id}>
                        <TableCell className="font-medium">{bip.clients?.name || "—"}</TableCell>
                        <TableCell>
                          <Badge className={
                            bip.action === "baixa" ? "bg-success/10 text-success border-0" :
                            bip.action === "remarcacao" ? "bg-warning/10 text-warning border-0" :
                            "bg-destructive/10 text-destructive border-0"
                          }>
                            {bip.action === "baixa" ? "Baixa" : bip.action === "remarcacao" ? "Remarcação" : "Retorno"}
                          </Badge>
                        </TableCell>
                        <TableCell>{bip.amount ? formatCurrency(Number(bip.amount)) : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{bip.barcode_raw}</TableCell>
                        <TableCell>
                          {bip.whatsapp_sent ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{format(new Date(bip.created_at), "dd/MM HH:mm")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remarcar Dialog */}
        <Dialog open={remarcarOpen} onOpenChange={setRemarcarOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Remarcar Fatura</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Nova Data de Vencimento</Label>
                <Input
                  type="date"
                  value={remarcarDate}
                  onChange={(e) => setRemarcarDate(e.target.value)}
                  min={format(new Date(), "yyyy-MM-dd")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRemarcarOpen(false)}>Cancelar</Button>
                <Button
                  onClick={() => selectedInvoice && remarcarDate && remarcarMutation.mutate({ invoice: selectedInvoice, newDate: remarcarDate })}
                  disabled={!remarcarDate || remarcarMutation.isPending}
                  className="gradient-primary text-primary-foreground"
                >
                  {remarcarMutation.isPending ? "Remarcando..." : "Confirmar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
