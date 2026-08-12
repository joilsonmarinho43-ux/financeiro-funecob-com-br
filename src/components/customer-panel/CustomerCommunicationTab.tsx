import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { MessageSquare, Send, Bell, MessageCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "@/hooks/use-toast";

export function CustomerCommunicationTab({ client }: { client: any }) {
  const { organizationId } = useOrganization();
  const [customMsg, setCustomMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const phoneClean = (client?.phone || "").replace(/\D/g, "");

  const sendBackend = async (message: string, key: string) => {
    if (!phoneClean) {
      toast({ title: "Erro", description: "Cliente sem telefone", variant: "destructive" });
      return;
    }
    setBusy(key);
    try {
      const { data, error } = await supabase.functions.invoke("send-now", {
        body: { phone: phoneClean, message, organization_id: organizationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Mensagem enviada! ✅" });
    } catch (e: any) {
      toast({ title: "Falha no envio", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const openWhats = () => {
    if (!phoneClean) return;
    window.open(`https://wa.me/55${phoneClean}`, "_blank");
  };

  const sendCobranca = async () => {
    const { data: bs } = await supabase.from("billing_settings").select("template_overdue, pix_key").eq("organization_id", organizationId!).maybeSingle();
    const msg = (bs?.template_overdue || "Olá {nome}, regularize sua fatura.")
      .replace(/\*?\{nome\}\*?/g, `*${client.name}*`)
      .replace(/{link_ou_chave_pix}/g, bs?.pix_key ? `Chave PIX: ${bs.pix_key}` : "")
      .replace(/{valor}/g, "").replace(/{vencimento}/g, "").replace(/{link_portal}/g, "").replace(/{titular_pix}/g, "");
    sendBackend(msg, "cob");
  };

  const sendLembrete = async () => {
    const { data: bs } = await supabase.from("billing_settings").select("template_reminder").eq("organization_id", organizationId!).maybeSingle();
    const msg = (bs?.template_reminder || "Olá {nome}, lembrete de vencimento.")
      .replace(/\*?\{nome\}\*?/g, `*${client.name}*`)
      .replace(/{valor}/g, "").replace(/{vencimento}/g, "");
    sendBackend(msg, "lem");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={openWhats} className="justify-start gap-2 h-auto py-2.5">
          <MessageCircle className="h-4 w-4 text-success" />
          <span className="text-xs">WhatsApp</span>
        </Button>
        <Button variant="outline" onClick={sendCobranca} disabled={busy === "cob"} className="justify-start gap-2 h-auto py-2.5">
          {busy === "cob" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}
          <span className="text-xs">Cobrança</span>
        </Button>
        <Button variant="outline" onClick={sendLembrete} disabled={busy === "lem"} className="justify-start gap-2 h-auto py-2.5">
          {busy === "lem" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4 text-warning" />}
          <span className="text-xs">Lembrete</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => customMsg.trim() && sendBackend(customMsg, "custom")}
          disabled={busy === "custom" || !customMsg.trim()}
          className="justify-start gap-2 h-auto py-2.5"
        >
          {busy === "custom" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
          <span className="text-xs">Personalizada</span>
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Mensagem personalizada</label>
        <Textarea
          value={customMsg}
          onChange={(e) => setCustomMsg(e.target.value)}
          placeholder="Digite uma mensagem..."
          rows={4}
          className="text-sm"
        />
      </div>
    </div>
  );
}
