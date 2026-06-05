import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { Plus, Search, Pencil, Trash2, Users, CalendarDays, Repeat, BookOpen, Link2, Copy, Check, Send, MessageSquare, CreditCard, Eye, Receipt, CalendarIcon, Zap, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import { auditLog } from "@/lib/auditLog";
import { StickyFilterBar } from "@/components/ui/sticky-filter-bar";
import { StatusPill } from "@/components/ui/status-pill";
import { DataCard } from "@/components/ui/data-card";
import { Fab } from "@/components/ui/fab";
import { maskPhone, maskCPFCNPJ, formatPhone, formatCPFCNPJ } from "@/lib/masks";
import { z } from "zod";

// === P0 Validação: Zod schema para cadastro/edição de clientes ===
const clientSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120, "Nome muito longo"),
  email: z.string().trim().email("E-mail inválido").max(160).optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || v.replace(/\D/g, "").length >= 10, "Telefone deve ter DDD + número (10 ou 11 dígitos)")
    .refine((v) => !v || v.replace(/\D/g, "").length <= 13, "Telefone inválido")
    .optional()
    .or(z.literal("")),
  document: z
    .string()
    .trim()
    .refine((v) => {
      if (!v) return true;
      const d = v.replace(/\D/g, "");
      return d.length === 11 || d.length === 14;
    }, "CPF deve ter 11 dígitos ou CNPJ 14 dígitos")
    .optional()
    .or(z.literal("")),
  due_day: z
    .string()
    .refine((v) => {
      const n = parseInt(v, 10);
      return n >= 1 && n <= 31;
    }, "Dia de vencimento deve estar entre 1 e 31"),
});

type Client = Tables<"clients">;
type Plan = Tables<"plans">;

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  document: "",
  address: "",
  client_code: "",
  plan_id: "",
  custom_value: "",
  due_day: "5",
  due_date_full: "",
  billing_type: "recorrencia" as "recorrencia" | "carne",
  carne_installments: "12",
  status: "ativo",
  observations: "",
  send_invoice_whatsapp: true,
  consent_given: false,
};

export default function Clients() {
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [msgDialog, setMsgDialog] = useState<{ phone: string; name: string } | null>(null);
  const [manualMsg, setManualMsg] = useState("");
  const [invoiceDialog, setInvoiceDialog] = useState<Client | null>(null);
  const [invForm, setInvForm] = useState<{ description: string; amount: string; due_date: Date | undefined }>({ description: "Mensalidade", amount: "", due_date: new Date() });
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [quickGenState, setQuickGenState] = useState<Record<string, "loading" | "success">>({});
  // P2: endereço estruturado (composto em string única ao salvar)
  const [addr, setAddr] = useState({ cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
  const [cepLoading, setCepLoading] = useState(false);
  const [collectorId, setCollectorId] = useState<string>("");

  // P2.3: admin check (admin pode atribuir collector_id manualmente)
  const { data: isAdmin = false } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      return !!data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  // P2.3: lista de cobradores da organização (para admin reatribuir)
  const { data: collectors = [] } = useQuery({
    queryKey: ["org-collectors", organizationId],
    queryFn: async () => {
      if (!organizationId || !isAdmin) return [];
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", organizationId);
      if (!members?.length) return [];
      const ids = members.map((m: any) => m.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      return (profs || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.id.slice(0, 8),
        role: members.find((m: any) => m.user_id === p.id)?.role || "user",
      }));
    },
    enabled: !!organizationId && isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  // P2.2: busca CEP via ViaCEP (gratuito, sem token)
  const lookupCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const j = await r.json();
      if (j && !j.erro) {
        setAddr((a) => ({
          ...a,
          cep: digits,
          street: j.logradouro || a.street,
          neighborhood: j.bairro || a.neighborhood,
          city: j.localidade || a.city,
          state: j.uf || a.state,
        }));
      } else {
        toast({ title: "CEP não encontrado", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao consultar CEP", variant: "destructive" });
    } finally {
      setCepLoading(false);
    }
  };

  const composeAddress = () => {
    const parts: string[] = [];
    if (addr.street) parts.push(addr.street + (addr.number ? `, ${addr.number}` : ""));
    if (addr.complement) parts.push(addr.complement);
    if (addr.neighborhood) parts.push(addr.neighborhood);
    if (addr.city || addr.state) parts.push(`${addr.city}${addr.state ? "/" + addr.state : ""}`);
    if (addr.cep) parts.push(`CEP ${addr.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}`);
    return parts.join(" — ");
  };

  const quickGenerateInvoice = async (client: Client) => {
    if (!organizationId) return;
    if (quickGenState[client.id]) return;
    setQuickGenState((s) => ({ ...s, [client.id]: "loading" }));
    try {
      // Pega última fatura do cliente para herdar dia/valor/plano
      const { data: lastInv, error: lastErr } = await supabase
        .from("invoices")
        .select("id, due_date, amount, description, plan_id")
        .eq("organization_id", organizationId)
        .eq("client_id", client.id)
        .order("due_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastErr) throw lastErr;

      const today = new Date();
      // Dia padrão: dia da última fatura, ou dia atual se nunca houve
      const dueDay = lastInv?.due_date
        ? parseInt(lastInv.due_date.split("-")[2], 10)
        : today.getDate();

      // Base: competência da última fatura + 1 mês; senão, mês atual
      let baseYear: number, baseMonth: number;
      if (lastInv?.due_date) {
        const [y, m] = lastInv.due_date.split("-").map(Number);
        baseYear = y;
        baseMonth = m; // próximo mês (1-12 -> usar como índice 0-based do próximo)
      } else {
        baseYear = today.getFullYear();
        baseMonth = today.getMonth(); // mês atual em 0-based já é "próximo" sem +1
      }
      // Normaliza
      const target = new Date(baseYear, baseMonth, 1);
      // Se a base ainda é anterior/igual ao mês atual, avança para o próximo
      while (
        target.getFullYear() < today.getFullYear() ||
        (target.getFullYear() === today.getFullYear() && target.getMonth() < today.getMonth())
      ) {
        target.setMonth(target.getMonth() + 1);
      }
      const targetYear = target.getFullYear();
      const targetMonth = target.getMonth(); // 0-based
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const finalDay = Math.min(dueDay, lastDayOfMonth);
      const dueDateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
      const monthStart = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`;
      const monthEnd = `${targetMonth === 11 ? targetYear + 1 : targetYear}-${String(targetMonth === 11 ? 1 : targetMonth + 2).padStart(2, "0")}-01`;

      // Verifica duplicidade: já existe fatura nesse mês para o cliente?
      const { data: existing, error: exErr } = await supabase
        .from("invoices")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("client_id", client.id)
        .gte("due_date", monthStart)
        .lt("due_date", monthEnd)
        .limit(1);
      if (exErr) throw exErr;
      if (existing && existing.length > 0) {
        toast({ title: "Mensalidade deste mês já existe", variant: "destructive" });
        setQuickGenState((s) => {
          const n = { ...s };
          delete n[client.id];
          return n;
        });
        return;
      }

      const amount = lastInv?.amount ? Number(lastInv.amount) : 0;
      if (!amount) {
        toast({ title: "Valor não encontrado", description: "Cliente sem fatura anterior — gere a primeira manualmente.", variant: "destructive" });
        setQuickGenState((s) => { const n = { ...s }; delete n[client.id]; return n; });
        return;
      }

      const { error: insErr } = await supabase.from("invoices").insert({
        client_id: client.id,
        organization_id: organizationId,
        plan_id: lastInv?.plan_id || null,
        amount,
        due_date: dueDateStr,
        description: lastInv?.description || "Mensalidade",
        status: "aberto",
      });
      if (insErr) throw insErr;

      auditLog({
        action: "invoice.quick_generate",
        organizationId,
        details: { client_id: client.id, due_date: dueDateStr, amount, source: "clients_quick_button" },
      });

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["client-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financial"] });

      setQuickGenState((s) => ({ ...s, [client.id]: "success" }));
      toast({ title: "Mensalidade gerada ✅", description: `Vencimento: ${finalDay}/${String(targetMonth + 1).padStart(2, "0")}/${targetYear}` });
      setTimeout(() => {
        setQuickGenState((s) => { const n = { ...s }; delete n[client.id]; return n; });
      }, 2000);
    } catch (err: any) {
      toast({ title: "Erro ao gerar mensalidade", description: err.message, variant: "destructive" });
      setQuickGenState((s) => { const n = { ...s }; delete n[client.id]; return n; });
    }
  };

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!organizationId,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["plans", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Plan[];
    },
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
  });

  // Client invoices for detail view
  const { data: clientInvoices = [] } = useQuery({
    queryKey: ["client-invoices", detailDialog?.id],
    queryFn: async () => {
      if (!detailDialog) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("client_id", detailDialog.id)
        .order("due_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!detailDialog,
  });

  // Fetch next pending invoice for editing client (to show due date)
  const { data: editNextInvoice } = useQuery({
    queryKey: ["edit-next-invoice", editingClient?.id],
    queryFn: async () => {
      if (!editingClient) return null;
      const { data, error } = await supabase
        .from("invoices")
        .select("id, due_date, amount, status, plan_id")
        .eq("client_id", editingClient.id)
        .in("status", ["pendente", "atrasada"])
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!editingClient,
  });

  // Pré-preenche o plano da próxima fatura ao editar
  useEffect(() => {
    if (editingClient && editNextInvoice && !form.plan_id) {
      const planId = (editNextInvoice as any).plan_id || "";
      if (planId) setForm((f) => ({ ...f, plan_id: planId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editNextInvoice?.id]);

  const selectedPlan = plans.find((p) => p.id === form.plan_id);
  const invoiceAmount = form.custom_value
    ? parseFloat(form.custom_value)
    : selectedPlan
    ? Number(selectedPlan.price)
    : 0;

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user) throw new Error("Organização não encontrada");

      let clientId = editingClient?.id;

      // P2: se usuário preencheu endereço estruturado, ele substitui o campo livre
      const composed = composeAddress();
      const finalAddress = composed || form.address || null;

      if (editingClient) {
        // === EDIT: only update mutable fields. Preserve created_by ===
        const updatePayload: any = {
          name: form.name,
          email: form.email || null,
          phone: (form.phone || "").replace(/\D/g, "") || null,
          document: (form.document || "").replace(/\D/g, "") || null,
          address: finalAddress,
          client_code: form.client_code || null,
          status: form.status || "ativo",
          updated_at: new Date().toISOString(),
        };
        // P2.3: admin pode reatribuir collector_id
        if (isAdmin) {
          updatePayload.collector_id = collectorId || null;
        }
        const { error } = await supabase
          .from("clients")
          .update(updatePayload)
          .eq("id", editingClient.id)
          .eq("organization_id", organizationId);
        if (error) throw error;

        // P1: auditLog do update com diff de campos alterados
        const diff: Record<string, { from: any; to: any }> = {};
        const trackFields: (keyof typeof updatePayload)[] = ["name", "email", "phone", "document", "address", "client_code", "status"];
        for (const f of trackFields) {
          const before = (editingClient as any)[f] ?? null;
          const after = updatePayload[f] ?? null;
          if (before !== after) diff[f as string] = { from: before, to: after };
        }
        if (Object.keys(diff).length > 0) {
          auditLog({
            action: "client.update",
            organizationId,
            details: { client_id: editingClient.id, diff },
          });
        }

        // Update next invoice due date (apenas a próxima)
        if (editNextInvoice?.id && form.due_date_full) {
          await supabase
            .from("invoices")
            .update({ due_date: form.due_date_full })
            .eq("id", editNextInvoice.id);
        }

        // P2: troca de plano propaga para TODAS faturas em aberto do cliente
        if (editNextInvoice?.id && form.plan_id && form.plan_id !== editNextInvoice.plan_id) {
          const newPlan = plans.find((p) => p.id === form.plan_id);
          if (newPlan) {
            const { error: bulkErr } = await supabase
              .from("invoices")
              .update({
                plan_id: form.plan_id,
                amount: Number(newPlan.price),
                description: `${newPlan.name} - Mensalidade`,
              })
              .eq("organization_id", organizationId)
              .eq("client_id", editingClient.id)
              .eq("status", "aberto");
            if (bulkErr) throw bulkErr;
            auditLog({
              action: "client.plan_change_bulk",
              organizationId,
              details: {
                client_id: editingClient.id,
                new_plan_id: form.plan_id,
                new_amount: Number(newPlan.price),
              },
            });
          }
        } else if (editNextInvoice?.id && !form.plan_id && editNextInvoice.plan_id) {
          await supabase
            .from("invoices")
            .update({ plan_id: null })
            .eq("id", editNextInvoice.id);
        }
      } else {
        // === INSERT: full payload with creator info ===
        const phoneDigits = (form.phone || "").replace(/\D/g, "");
        const docDigits = (form.document || "").replace(/\D/g, "");

        // P0: bloqueia duplicidade (phone/document/client_code) no mesmo organization_id
        // Crítico: evita baixa automática indo para cliente errado por telefone duplicado.
        const dupChecks: Array<{ field: string; value: string }> = [];
        if (phoneDigits) dupChecks.push({ field: "phone", value: phoneDigits });
        if (docDigits) dupChecks.push({ field: "document", value: docDigits });
        if (form.client_code) dupChecks.push({ field: "client_code", value: form.client_code });

        for (const check of dupChecks) {
          const query: any = supabase
            .from("clients")
            .select("id, name")
            .eq("organization_id", organizationId);
          const { data: existing, error: dupErr } = await query
            .eq(check.field, check.value)
            .limit(1);
          if (dupErr) throw dupErr;
          if (existing && existing.length > 0) {
            throw new Error(
              `Já existe cliente "${existing[0].name}" com este ${
                check.field === "phone" ? "telefone" : check.field === "document" ? "CPF/CNPJ" : "código"
              }.`
            );
          }
        }

        // P2.3: admin → collector_id escolhido (ou null para "não atribuído")
        //        cobrador → sempre o próprio user.id (preserva RLS)
        const finalCollector = isAdmin ? (collectorId || null) : user.id;
        const insertPayload: any = {
          name: form.name,
          email: form.email || null,
          phone: phoneDigits || null,
          document: docDigits || null,
          address: finalAddress,
          client_code: form.client_code || null,
          status: form.status || "ativo",
          created_by: user.id,
          organization_id: organizationId,
          collector_id: finalCollector,
        };
        const { data, error } = await supabase
          .from("clients")
          .insert(insertPayload)
          .select("id")
          .single();
        if (error) throw error;
        clientId = data.id;

        // Mensagem de boas-vindas — só quando há telefone
        if (insertPayload.phone && form.consent_given) {
          try {
            const { data: bs } = await supabase
              .from("billing_settings")
              .select("template_welcome, welcome_enabled")
              .eq("organization_id", organizationId)
              .maybeSingle();
            const enabled = (bs as any)?.welcome_enabled ?? true;
            const tpl = (bs as any)?.template_welcome ||
              "Olá {nome}! 👋\n\nSeja muito bem-vindo(a)! Seu cadastro foi realizado com sucesso. 🎉\n\nQualquer dúvida, estamos à disposição! 😊";
            if (enabled && tpl) {
              const msg = String(tpl)
                .replace(/\{nome\}/g, insertPayload.name || "")
                .replace(/\{empresa\}/g, organization?.name || "");
              const phoneClean = String(insertPayload.phone).replace(/\D/g, "");
              const { data: sendData, error: sendErr } = await supabase.functions.invoke("send-now", {
                body: { phone: phoneClean, message: msg, organization_id: organizationId },
              });
              if (sendErr || (sendData as any)?.error) {
                console.warn("[welcome] falha envio:", sendErr || (sendData as any)?.error);
              }
            }
          } catch (e) {
            console.warn("[welcome] erro:", e);
          }
        }
      }

      // Generate invoices for new clients only
      let firstInvoice: { amount: number; due_date: string; description: string } | null = null;
      if (!editingClient && clientId && invoiceAmount > 0) {
        const dueDay = parseInt(form.due_day) || 5;
        const now = new Date();
        const invoices: TablesInsert<"invoices">[] = [];

        const getFirstDueDate = () => {
          if (form.due_date_full) return new Date(form.due_date_full + "T12:00:00");
          const d = new Date(now.getFullYear(), now.getMonth(), dueDay);
          if (d <= now) d.setMonth(d.getMonth() + 1);
          return d;
        };

        if (form.billing_type === "recorrencia") {
          const dueDate = getFirstDueDate();
          const desc = selectedPlan ? `${selectedPlan.name} - Mensalidade` : `Mensalidade`;
          invoices.push({
            client_id: clientId,
            organization_id: organizationId,
            plan_id: form.plan_id || null,
            amount: invoiceAmount,
            due_date: format(dueDate, "yyyy-MM-dd"),
            description: desc,
            status: "aberto",
          });
          firstInvoice = { amount: invoiceAmount, due_date: format(dueDate, "yyyy-MM-dd"), description: desc };
        } else {
          const totalInstallments = parseInt(form.carne_installments) || 12;
          const firstDue = getFirstDueDate();
          for (let i = 0; i < totalInstallments; i++) {
            const dueDate = new Date(firstDue.getFullYear(), firstDue.getMonth() + i, firstDue.getDate());
            const desc = selectedPlan
              ? `${selectedPlan.name} - Carnê ${i + 1}/${totalInstallments}`
              : `Carnê - Parcela ${i + 1}/${totalInstallments}`;
            invoices.push({
              client_id: clientId,
              organization_id: organizationId,
              plan_id: form.plan_id || null,
              amount: invoiceAmount,
              due_date: format(dueDate, "yyyy-MM-dd"),
              description: desc,
              status: "aberto",
            });
            if (i === 0) firstInvoice = { amount: invoiceAmount, due_date: format(dueDate, "yyyy-MM-dd"), description: desc };
          }
        }

        if (invoices.length > 0) {
          const { error: invError } = await supabase.from("invoices").insert(invoices);
          if (invError) throw invError;
        }

        // === Send first invoice via WhatsApp (opt-in checkbox) ===
        if (form.send_invoice_whatsapp && firstInvoice && form.phone) {
          try {
            const { data: bs } = await supabase
              .from("billing_settings")
              .select("template_reminder, pix_key, pix_key_type, pix_holder_name")
              .eq("organization_id", organizationId)
              .maybeSingle();
            const valor = formatCurrency(firstInvoice.amount);
            const venc = firstInvoice.due_date.split("-").reverse().join("/");
            const pixLine = (bs as any)?.pix_key
              ? `\n\n💳 *PIX (${(bs as any).pix_key_type || "chave"}):* ${(bs as any).pix_key}${(bs as any).pix_holder_name ? `\n👤 ${(bs as any).pix_holder_name}` : ""}`
              : "";
            const tpl = (bs as any)?.template_reminder
              || "Olá {nome}! Sua fatura no valor de {valor} vence em {vencimento}.";
            const msg = String(tpl)
              .replace(/\{nome\}/g, form.name)
              .replace(/\{valor\}/g, valor)
              .replace(/\{vencimento\}/g, venc)
              .replace(/\{link_ou_chave_pix\}/g, pixLine.trim()) + pixLine;
            const phoneClean = String(form.phone).replace(/\D/g, "");
            await supabase.functions.invoke("send-now", {
              body: { phone: phoneClean, message: msg, organization_id: organizationId },
            });
          } catch (e) {
            console.warn("[send-invoice] erro:", e);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financial"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: editingClient ? "Cliente atualizado!" : "Cliente cadastrado com faturas geradas!" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não encontrada");

      // P0: bloqueia exclusão se houver faturas em aberto (preserva integridade financeira)
      const { data: openInvs, error: invErr } = await supabase
        .from("invoices")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("client_id", id)
        .eq("status", "aberto")
        .limit(1);
      if (invErr) throw invErr;
      if (openInvs && openInvs.length > 0) {
        throw new Error("Cliente possui faturas em aberto. Quite ou cancele antes de remover.");
      }

      // P0: org_id filter explícito (defesa em profundidade) + auditoria
      const { data: snapshot } = await supabase
        .from("clients")
        .select("id, name, phone, document")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .maybeSingle();

      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;

      auditLog({
        action: "client.delete",
        organizationId,
        details: { client_id: id, snapshot },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente removido!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });

  const sendManualMsgMutation = useMutation({
    mutationFn: async () => {
      if (!msgDialog || !organizationId) throw new Error("Dados inválidos");

      // Send immediately via Edge Function proxy
      const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-now", {
        body: {
          phone: msgDialog.phone,
          message: manualMsg,
          organization_id: organizationId,
        },
      });

      if (sendError) throw new Error(sendError.message || "Erro ao enviar mensagem");
      if (sendResult?.error) throw new Error(sendResult.error);

      return "sent";
    },
    onSuccess: (result) => {
      toast({ title: result === "sent" ? "Mensagem enviada com sucesso! ✅" : "Mensagem adicionada à fila!" });
      setMsgDialog(null);
      setManualMsg("");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setForm(emptyForm);
    setAddr({ cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
    setCollectorId("");
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      ...emptyForm,
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      document: client.document || "",
      address: client.address || "",
      client_code: (client as any).client_code || "",
      status: client.status || "ativo",
    });
    setAddr({ cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
    setCollectorId((client as any).collector_id || "");
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // P0: validação Zod completa (nome, email, telefone, CPF/CNPJ, dia de vencimento)
    const parsed = clientSchema.safeParse({
      name: form.name,
      email: form.email,
      phone: form.phone,
      document: form.document,
      due_day: form.due_day,
    });
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      toast({ title: "Dados inválidos", description: first.message, variant: "destructive" });
      return;
    }
    upsertMutation.mutate();
  };

  const filtered = clients.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    // P1: busca por dígitos (telefone/documento) quando termo é numérico
    const qDigits = q.replace(/\D/g, "");
    const phoneDigits = (c.phone || "").replace(/\D/g, "");
    const docDigits = (c.document || "").replace(/\D/g, "");
    return (
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.document?.toLowerCase().includes(q) ||
      (qDigits.length >= 3 && (phoneDigits.includes(qDigits) || docDigits.includes(qDigits)))
    );
  });
  const visible = filtered.slice(0, visibleCount);

  const statusColor = (status: string) => {
    switch (status) {
      case "ativo": return "bg-success/10 text-success border-0";
      case "inativo": return "bg-destructive/10 text-destructive border-0";
      default: return "bg-muted text-muted-foreground border-0";
    }
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus clientes cadastrados</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" /> Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingClient ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5 mt-2">
                {/* Dados Pessoais */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Dados Pessoais
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client_code">Código do Cliente</Label>
                      <Input id="client_code" value={form.client_code} onChange={(e) => setForm({ ...form, client_code: e.target.value })} placeholder="Ex: 0022008" className="font-mono" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" inputMode="tel" placeholder="(11) 91234-5678" value={formatPhone(form.phone) || form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 13) })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="document">CPF/CNPJ</Label>
                      <Input id="document" inputMode="numeric" placeholder="000.000.000-00" value={formatCPFCNPJ(form.document) || form.document} onChange={(e) => setForm({ ...form, document: e.target.value.replace(/\D/g, "").slice(0, 14) })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço completo (livre)</Label>
                    <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ou preencha os campos estruturados abaixo" />
                  </div>

                  {/* P2.2: Endereço estruturado com ViaCEP */}
                  <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Endereço estruturado (opcional — sobrescreve o campo acima)
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2 col-span-1">
                        <Label htmlFor="cep">CEP</Label>
                        <div className="flex gap-2">
                          <Input
                            id="cep"
                            inputMode="numeric"
                            placeholder="00000-000"
                            value={addr.cep ? addr.cep.replace(/(\d{5})(\d{0,3}).*/, "$1-$2").replace(/-$/, "") : ""}
                            onChange={(e) => {
                              const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                              setAddr((a) => ({ ...a, cep: d }));
                              if (d.length === 8) lookupCep(d);
                            }}
                          />
                          {cepLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-3" />}
                        </div>
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="street">Rua/Logradouro</Label>
                        <Input id="street" value={addr.street} onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="number">Número</Label>
                        <Input id="number" value={addr.number} onChange={(e) => setAddr((a) => ({ ...a, number: e.target.value }))} />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="complement">Complemento</Label>
                        <Input id="complement" value={addr.complement} onChange={(e) => setAddr((a) => ({ ...a, complement: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="neighborhood">Bairro</Label>
                        <Input id="neighborhood" value={addr.neighborhood} onChange={(e) => setAddr((a) => ({ ...a, neighborhood: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">Cidade</Label>
                        <Input id="city" value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">UF</Label>
                        <Input id="state" maxLength={2} value={addr.state} onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value.toUpperCase() }))} />
                      </div>
                    </div>
                  </div>

                  {/* P2.3: admin pode atribuir/reatribuir o cobrador responsável */}
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label>Cobrador responsável</Label>
                      <Select value={collectorId || "none"} onValueChange={(v) => setCollectorId(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não atribuído (visível para todos da org)</SelectItem>
                          {collectors.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} {c.role === "cobrador" ? "(cobrador)" : `(${c.role})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Apenas administradores. Deixe em branco para cliente atribuível depois.
                      </p>
                    </div>
                  )}
                  {/* Status - visible when editing */}
                  {editingClient && (
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="inativo">Inativo</SelectItem>
                          {/* "inadimplente" removido: status calculado em runtime via due_date + aberto */}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Plano - visible when editing (atualiza próxima fatura em aberto) */}
                  {editingClient && (
                    <div className="space-y-2">
                      <Label>Plano</Label>
                      <Select
                        value={form.plan_id || "none"}
                        onValueChange={(v) => setForm({ ...form, plan_id: v === "none" ? "" : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Sem plano" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem plano</SelectItem>
                          {plans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — {formatCurrency(Number(p.price))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Atualiza a próxima fatura em aberto com o valor do plano selecionado.
                      </p>
                    </div>
                  )}
                  {/* Due date - visible when editing */}
                  {editingClient && (
                    <div className="space-y-2">
                      <Label>Próximo Vencimento</Label>
                      <Input
                        type="date"
                        value={form.due_date_full || editNextInvoice?.due_date || ""}
                        onChange={(e) => setForm({ ...form, due_date_full: e.target.value })}
                      />
                      {editNextInvoice && !form.due_date_full && (
                        <p className="text-xs text-muted-foreground">
                          Vencimento atual: {format(new Date(editNextInvoice.due_date + "T12:00:00"), "dd/MM/yyyy")} — {editNextInvoice.status}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Show dates when editing */}
                  {editingClient && (
                    <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
                      <p className="font-medium text-foreground">Informações</p>
                      <p className="text-muted-foreground">Cadastrado em: {format(new Date(editingClient.created_at), "dd/MM/yyyy HH:mm")}</p>
                      <p className="text-muted-foreground">Última atualização: {format(new Date(editingClient.updated_at), "dd/MM/yyyy HH:mm")}</p>
                    </div>
                  )}
                </div>

                {/* Plano e Cobrança - somente para novos */}
                {!editingClient && (
                  <>
                    <div className="border-t border-border pt-4 space-y-3">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary" /> Plano e Cobrança
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Plano</Label>
                          <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v, custom_value: "" })}>
                            <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                            <SelectContent>
                              {plans.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} — {formatCurrency(Number(p.price))}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custom_value">Valor Personalizado (R$)</Label>
                          <Input id="custom_value" type="number" step="0.01" min="0"
                            placeholder={selectedPlan ? formatCurrency(Number(selectedPlan.price)) : "0,00"}
                            value={form.custom_value} onChange={(e) => setForm({ ...form, custom_value: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Dia de Vencimento</Label>
                          <Select value={form.due_day} onValueChange={(v) => setForm({ ...form, due_day: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-60">
                              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                                <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Data do 1º Vencimento</Label>
                          <Input
                            type="date"
                            value={form.due_date_full}
                            onChange={(e) => setForm({ ...form, due_date_full: e.target.value })}
                          />
                          <p className="text-xs text-muted-foreground">Se preenchido, ignora o "Dia" acima</p>
                        </div>
                      </div>
                    </div>

                    {/* Tipo de Cobrança */}
                    <div className="border-t border-border pt-4 space-y-3">
                      <p className="text-sm font-semibold text-foreground">Tipo de Cobrança</p>
                      <RadioGroup value={form.billing_type} onValueChange={(v: "recorrencia" | "carne") => setForm({ ...form, billing_type: v })} className="grid grid-cols-2 gap-4">
                        <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${form.billing_type === "recorrencia" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                          <RadioGroupItem value="recorrencia" className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm text-foreground flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5 text-primary" /> Recorrência</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Cobrança mensal contínua</p>
                          </div>
                        </label>
                        <label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${form.billing_type === "carne" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                          <RadioGroupItem value="carne" className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm text-foreground flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-primary" /> Carnê</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Defina o número de parcelas</p>
                          </div>
                        </label>
                      </RadioGroup>

                      {form.billing_type === "carne" && (
                        <div className="space-y-2 max-w-[200px]">
                          <Label htmlFor="installments">Nº de Parcelas</Label>
                          <Input id="installments" type="number" min="1" max="120" value={form.carne_installments} onChange={(e) => setForm({ ...form, carne_installments: e.target.value })} />
                        </div>
                      )}

                      {invoiceAmount > 0 && (
                        <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
                          <p className="font-medium text-foreground">Resumo da cobrança:</p>
                          <p className="text-muted-foreground">
                            {form.billing_type === "recorrencia"
                              ? `${formatCurrency(invoiceAmount)}/mês (primeira fatura gerada automaticamente)`
                              : `${form.carne_installments}× de ${formatCurrency(invoiceAmount)}`}
                          </p>
                          {form.billing_type === "carne" && (
                            <p className="text-muted-foreground">Total: {formatCurrency(invoiceAmount * (parseInt(form.carne_installments) || 12))}</p>
                          )}
                        </div>
                      )}

                      {invoiceAmount > 0 && form.phone && (
                        <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-primary"
                            checked={form.send_invoice_whatsapp}
                            onChange={(e) => setForm({ ...form, send_invoice_whatsapp: e.target.checked })}
                          />
                          <div className="text-sm">
                            <p className="font-medium text-foreground flex items-center gap-1.5">
                              <Send className="h-3.5 w-3.5 text-primary" /> Enviar 1ª fatura por WhatsApp
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Manda valor, vencimento e chave PIX para o cliente assim que o cadastro for salvo.
                            </p>
                          </div>
                        </label>
                      )}

                      {/* P1: Consentimento LGPD — obrigatório para envio automático de WhatsApp */}
                      {form.phone && (
                        <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-primary"
                            checked={form.consent_given}
                            onChange={(e) => setForm({ ...form, consent_given: e.target.checked })}
                          />
                          <div className="text-sm">
                            <p className="font-medium text-foreground">
                              Cliente autorizou contato por WhatsApp (LGPD)
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Sem este consentimento a mensagem de boas-vindas não é enviada. As cobranças seguem o fluxo normal.
                            </p>
                          </div>
                        </label>
                      )}
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
                  <Button type="submit" className="gradient-primary text-primary-foreground" disabled={upsertMutation.isPending}>
                    {upsertMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total", value: clients.length, className: "gradient-primary" },
            { label: "Ativos", value: clients.filter((c) => c.status === "ativo").length, className: "gradient-success" },
            { label: "Inativos", value: clients.filter((c) => c.status === "inativo").length, className: "gradient-danger" },
          ].map((s) => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`h-10 w-10 rounded-xl ${s.className} flex items-center justify-center`}>
                  <Users className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sticky filter bar */}
        <StickyFilterBar
          search={search}
          onSearch={(v) => { setSearch(v); setVisibleCount(25); }}
          placeholder="Buscar por nome, e-mail ou documento..."
          chips={[
            { key: "all", label: "Todos", count: clients.length },
            { key: "ativo", label: "Ativos", count: clients.filter((c) => c.status === "ativo").length },
            { key: "inativo", label: "Inativos", count: clients.filter((c) => c.status === "inativo").length },
          ]}
          activeChip={statusFilter}
          onChipChange={(k) => { setStatusFilter(k); setVisibleCount(25); }}
        />

        {/* List */}
        <Card className="border-0 shadow-card rounded-2xl">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {clients.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum resultado encontrado."}
              </div>
            ) : (
              <>
                {/* Mobile: cards */}
                <div className="md:hidden p-3 space-y-2.5">
                  {visible.map((client) => (
                    <DataCard
                      key={client.id}
                      title={client.name}
                      pill={
                        <StatusPill variant={client.status === "ativo" ? "paid" : "canceled"}>
                          {client.status}
                        </StatusPill>
                      }
                      subtitle={
                        <>
                          {client.phone && <span>{maskPhone(client.phone)}</span>}
                          {client.phone && client.document && <span> · </span>}
                          {client.document && <span>{maskCPFCNPJ(client.document)}</span>}
                        </>
                      }
                      actions={
                        <>
                          <Button variant="ghost" size="icon" className="tap text-muted-foreground" aria-label="Ver detalhes" onClick={() => setDetailDialog(client)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "tap",
                              quickGenState[client.id] === "success" ? "text-success" : "text-warning"
                            )}
                            aria-label="Gerar mensalidade do mês"
                            title="Gerar mensalidade do mês"
                            disabled={!!quickGenState[client.id]}
                            onClick={() => quickGenerateInvoice(client)}
                          >
                            {quickGenState[client.id] === "loading" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : quickGenState[client.id] === "success" ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Zap className="h-4 w-4" />
                            )}
                          </Button>
                          {client.phone && (
                            <Button variant="ghost" size="icon" className="tap text-muted-foreground" aria-label="Mensagem" onClick={() => { setMsgDialog({ phone: client.phone!, name: client.name }); setManualMsg(""); }}>
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {client.phone && (
                            <Button variant="ghost" size="icon" className="tap text-success" aria-label="WhatsApp" asChild>
                              <a href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                                <MessageSquare className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="tap text-primary" aria-label="Editar" onClick={() => openEdit(client)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="tap text-destructive" aria-label="Remover"
                            onClick={() => {
                              if (window.confirm(`Tem certeza que deseja remover "${client.name}"? Esta ação não pode ser desfeita.`)) {
                                deleteMutation.mutate(client.id);
                              }
                            }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      }
                    />
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>CPF/CNPJ</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((client) => (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium">{client.name}</TableCell>
                          <TableCell>{maskPhone(client.phone) || "—"}</TableCell>
                          <TableCell>{maskCPFCNPJ(client.document) || "—"}</TableCell>
                          <TableCell>
                            <StatusPill variant={client.status === "ativo" ? "paid" : "canceled"}>{client.status}</StatusPill>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-9 w-9" title="Ver detalhes" onClick={() => setDetailDialog(client)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-9 w-9",
                                  quickGenState[client.id] === "success" ? "text-success" : "text-warning"
                                )}
                                title="Gerar mensalidade do mês (1 clique)"
                                aria-label="Gerar mensalidade do mês"
                                disabled={!!quickGenState[client.id]}
                                onClick={() => quickGenerateInvoice(client)}
                              >
                                {quickGenState[client.id] === "loading" ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : quickGenState[client.id] === "success" ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Zap className="h-4 w-4" />
                                )}
                              </Button>
                              {client.phone && (
                                <Button variant="ghost" size="icon" className="h-9 w-9" title="Enviar mensagem" onClick={() => { setMsgDialog({ phone: client.phone!, name: client.name }); setManualMsg(""); }}>
                                  <Send className="h-4 w-4" />
                                </Button>
                              )}
                              {client.phone && (
                                <Button variant="ghost" size="icon" className="h-9 w-9" title="Abrir WhatsApp" asChild>
                                  <a href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                                    <MessageSquare className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              <PortalLinkButton clientId={client.id} organizationId={organizationId} />
                              <Button variant="ghost" size="icon" className="h-9 w-9" title="Gerar fatura" onClick={async () => {
                                setInvoiceDialog(client);
                                setInvForm({ description: "Mensalidade", amount: "", due_date: new Date() });
                                const { data: lastInv } = await supabase
                                  .from("invoices")
                                  .select("amount, description, plan_id")
                                  .eq("organization_id", organizationId!)
                                  .eq("client_id", client.id)
                                  .order("created_at", { ascending: false })
                                  .limit(1)
                                  .maybeSingle();
                                let amt = "";
                                let desc = "Mensalidade";
                                if (lastInv?.amount) {
                                  amt = String(lastInv.amount);
                                  if (lastInv.description) desc = lastInv.description;
                                } else {
                                  const planId = lastInv?.plan_id;
                                  if (planId) {
                                    const p = plans.find((pl) => pl.id === planId);
                                    if (p?.price) amt = String(p.price);
                                  }
                                }
                                setInvForm({ description: desc, amount: amt, due_date: new Date() });
                              }}>
                                <Receipt className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEdit(client)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (window.confirm(`Tem certeza que deseja remover "${client.name}"? Esta ação não pode ser desfeita.`)) {
                                    deleteMutation.mutate(client.id);
                                  }
                                }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {visible.length < filtered.length && (
                  <div className="p-4 flex justify-center">
                    <Button variant="outline" onClick={() => setVisibleCount((c) => c + 25)}>
                      Carregar mais ({filtered.length - visible.length} restantes)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FAB - mobile new client */}
      <Fab onClick={() => { setEditingClient(null); setForm(emptyForm); setDialogOpen(true); }} aria-label="Novo cliente" />

      {/* Manual Message Dialog */}
      <Dialog open={!!msgDialog} onOpenChange={(open) => { if (!open) setMsgDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Mensagem Manual</DialogTitle>
            <DialogDescription>Para: {msgDialog?.name} ({msgDialog?.phone})</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); sendManualMsgMutation.mutate(); }} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea placeholder="Digite a mensagem..." value={manualMsg} onChange={(e) => setManualMsg(e.target.value)} rows={4} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMsgDialog(null)}>Cancelar</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground" disabled={sendManualMsgMutation.isPending}>
                {sendManualMsgMutation.isPending ? "Enviando..." : "Enviar Agora"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Client Detail Dialog */}
      <Dialog open={!!detailDialog} onOpenChange={(open) => { if (!open) setDetailDialog(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes: {detailDialog?.name}</DialogTitle>
          </DialogHeader>
          {detailDialog && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Telefone:</span> <span className="font-medium">{detailDialog.phone || "—"}</span></div>
                <div><span className="text-muted-foreground">E-mail:</span> <span className="font-medium">{detailDialog.email || "—"}</span></div>
                <div><span className="text-muted-foreground">CPF/CNPJ:</span> <span className="font-medium">{detailDialog.document || "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColor(detailDialog.status)}>{detailDialog.status}</Badge></div>
                <div><span className="text-muted-foreground">Endereço:</span> <span className="font-medium">{detailDialog.address || "—"}</span></div>
                <div><span className="text-muted-foreground">Código:</span> <span className="font-mono font-medium">{(detailDialog as any).client_code || "—"}</span></div>
                <div><span className="text-muted-foreground">Cadastro:</span> <span className="font-medium">{format(new Date(detailDialog.created_at), "dd/MM/yyyy")}</span></div>
                <div><span className="text-muted-foreground">Atualização:</span> <span className="font-medium">{format(new Date(detailDialog.updated_at), "dd/MM/yyyy")}</span></div>
              </div>

              {/* Financial History */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" /> Histórico Financeiro
                  </p>
                  {clientInvoices.length > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={async () => {
                        if (!window.confirm("Tem certeza que deseja apagar TODAS as faturas deste cliente? Esta ação é irreversível.")) return;
                        if (!window.confirm("Confirme novamente: apagar todo o histórico financeiro?")) return;
                        const ids = clientInvoices.map((inv: any) => inv.id);
                        for (const id of ids) {
                          await supabase.from("invoices").delete().eq("id", id);
                        }
                        queryClient.invalidateQueries({ queryKey: ["client-invoices"] });
                        queryClient.invalidateQueries({ queryKey: ["invoices"] });
                        toast({ title: "Histórico financeiro apagado" });
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Apagar Tudo
                    </Button>
                  )}
                </div>
                {clientInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma fatura encontrada.</p>
                ) : (
                  <div className="overflow-x-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Pagamento</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientInvoices.map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-sm">{format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(Number(inv.amount))}</TableCell>
                            <TableCell>
                              <Badge className={inv.status === "pago" ? "bg-success/10 text-success border-0" : inv.status === "aberto" ? "bg-warning/10 text-warning border-0" : "bg-destructive/10 text-destructive border-0"}>
                                {inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{inv.paid_date ? format(new Date(inv.paid_date.includes("T") ? inv.paid_date : inv.paid_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={async () => {
                                  if (!window.confirm("Apagar esta fatura?")) return;
                                  await supabase.from("invoices").delete().eq("id", inv.id);
                                  queryClient.invalidateQueries({ queryKey: ["client-invoices"] });
                                  queryClient.invalidateQueries({ queryKey: ["invoices"] });
                                  toast({ title: "Fatura apagada" });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Delete Message History */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" /> Mensagens WhatsApp
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={async () => {
                      if (!detailDialog?.phone || !organizationId) return;
                      if (!window.confirm("Apagar todo o histórico de mensagens deste cliente?")) return;
                      const phone = detailDialog.phone.replace(/\D/g, "");
                      await supabase
                        .from("whatsapp_messages")
                        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id || null })
                        .eq("organization_id", organizationId)
                        .ilike("phone", `%${phone}%`);
                      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
                      toast({ title: "Histórico de mensagens apagado" });
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Apagar Histórico
                  </Button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-border pt-4 flex flex-wrap gap-2">
                {detailDialog.phone && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setDetailDialog(null); setMsgDialog({ phone: detailDialog.phone!, name: detailDialog.name }); setManualMsg(""); }}>
                      <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar Mensagem
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`https://wa.me/${detailDialog.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Abrir WhatsApp
                      </a>
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => { setDetailDialog(null); openEdit(detailDialog); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Invoice Dialog */}
      <Dialog open={!!invoiceDialog} onOpenChange={(open) => { if (!open) setInvoiceDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar fatura</DialogTitle>
            <DialogDescription>Cliente: {invoiceDialog?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={invForm.description} onChange={(e) => setInvForm({ ...invForm, description: e.target.value })} placeholder="Ex: Mensalidade" />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input inputMode="decimal" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Vencimento *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !invForm.due_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {invForm.due_date ? format(invForm.due_date, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={invForm.due_date} onSelect={(d) => setInvForm({ ...invForm, due_date: d })} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setInvoiceDialog(null)}>Cancelar</Button>
              <Button
                disabled={creatingInvoice}
                onClick={async () => {
                  if (!invoiceDialog || !organizationId) return;
                  const amountNum = parseFloat(invForm.amount.replace(",", "."));
                  if (!invForm.amount || isNaN(amountNum) || amountNum <= 0) {
                    toast({ title: "Valor inválido", variant: "destructive" });
                    return;
                  }
                  if (!invForm.due_date) {
                    toast({ title: "Selecione o vencimento", variant: "destructive" });
                    return;
                  }
                  setCreatingInvoice(true);
                  try {
                    const { error } = await supabase.from("invoices").insert({
                      organization_id: organizationId,
                      client_id: invoiceDialog.id,
                      description: invForm.description || "Mensalidade",
                      amount: amountNum,
                      due_date: format(invForm.due_date, "yyyy-MM-dd"),
                      status: "aberto",
                    } as any);
                    if (error) throw error;
                    await auditLog({ action: "invoice_created", organizationId, details: { client_id: invoiceDialog.id, amount: amountNum } });
                    toast({ title: "Fatura criada com sucesso" });
                    queryClient.invalidateQueries({ queryKey: ["invoices"] });
                    setInvoiceDialog(null);
                  } catch (e: any) {
                    toast({ title: "Erro ao criar fatura", description: e.message, variant: "destructive" });
                  } finally {
                    setCreatingInvoice(false);
                  }
                }}
              >
                {creatingInvoice ? "Criando..." : "Criar fatura"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function PortalLinkButton({ clientId, organizationId }: { clientId: string; organizationId: string | null }) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generateAndCopy = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("client_portal_tokens")
        .select("token")
        .eq("client_id", clientId)
        .maybeSingle();

      let token = (existing as any)?.token;

      if (!token) {
        const { data: created, error } = await supabase
          .from("client_portal_tokens")
          .insert({ client_id: clientId, organization_id: organizationId } as any)
          .select("token")
          .single();
        if (error) throw error;
        token = (created as any).token;
      }

      const link = `${window.location.origin}/portal/${token}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Link copiado!" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={generateAndCopy} disabled={loading} title="Copiar link do portal">
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
    </Button>
  );
}
