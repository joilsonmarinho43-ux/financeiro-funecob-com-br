import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreatePortalLink } from "../_shared/portalLink.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: allSettings, error: settingsErr } = await supabase
      .from("billing_settings")
      .select("*")
      .eq("reminder_enabled", true);

    if (settingsErr) throw settingsErr;
    if (!allSettings || allSettings.length === 0) {
      return new Response(JSON.stringify({ message: "No billing settings found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    let totalProcessed = 0;
    let totalQueued = 0;

    for (const settings of allSettings) {
      const orgId = settings.organization_id;

      // Calculate all reminder dates
      const reminder1Date = new Date(today);
      reminder1Date.setDate(reminder1Date.getDate() + settings.reminder_days_before);
      const reminder1Str = reminder1Date.toISOString().split("T")[0];

      const reminder2Date = new Date(today);
      reminder2Date.setDate(reminder2Date.getDate() + (settings.reminder_days_before_2 || 1));
      const reminder2Str = reminder2Date.toISOString().split("T")[0];

      const overdueDate = new Date(today);
      overdueDate.setDate(overdueDate.getDate() - (settings.reminder_days_after || 1));
      const overdueDateStr = overdueDate.toISOString().split("T")[0];

      // Get open invoices
      const { data: invoices, error: invErr } = await supabase
        .from("invoices")
        .select("*, clients(name, phone)")
        .eq("organization_id", orgId)
        .eq("status", "aberto");

      if (invErr) {
        console.error(`Error fetching invoices for org ${orgId}:`, invErr);
        continue;
      }
      if (!invoices || invoices.length === 0) continue;

      // Sent today dedup using reminder_date constraint
      const { data: sentToday } = await supabase
        .from("billing_reminders")
        .select("invoice_id, reminder_type")
        .eq("organization_id", orgId)
        .eq("reminder_date", todayStr);

      const sentSet = new Set(
        (sentToday || []).map((s: any) => `${s.invoice_id}:${s.reminder_type}`)
      );

      // Build pix/link info — gateway returns null so we generate per-invoice link below
      const buildPixOrLinkStatic = (): string | null => {
        if (settings.billing_mode === "gateway" && settings.gateway_provider) {
          return null; // gerado dinamicamente por fatura
        }
        if (settings.billing_mode === "pix_direto" && settings.pix_key) {
          const typeMap: Record<string, string> = {
            cpf: "CPF/CNPJ", email: "E-mail", telefone: "Telefone", aleatoria: "Chave Aleatória",
          };
          const holderLine = (settings as any).pix_holder_name ? `\nTitular: ${(settings as any).pix_holder_name}` : "";
          return `📲 *Pix Manual:*\nTipo: ${typeMap[settings.pix_key_type] || settings.pix_key_type}\nChave: \`${settings.pix_key}\`${holderLine}\n\n_Após o pagamento, envie o comprovante para confirmação._`;
        }
        return "Entre em contato para informações de pagamento.";
      };

      const staticPixOrLink = buildPixOrLinkStatic();

      // Generate real gateway payment link for an invoice (with cache)
      const getGatewayLink = async (invoiceId: string): Promise<string> => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/gateway-create-payment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ invoice_id: invoiceId, organization_id: orgId }),
          });
          const data = await res.json();
          if (data?.success && data?.payment_url) {
            return `💳 *Pague aqui:* ${data.payment_url}`;
          }
          console.error(`[billing-cron] gateway link failed for invoice ${invoiceId}:`, data?.error);
          return "💳 Link de pagamento será enviado em instantes. Em caso de urgência, entre em contato.";
        } catch (e) {
          console.error(`[billing-cron] gateway fetch error:`, e);
          return "💳 Link de pagamento indisponível no momento. Entre em contato.";
        }
      };

      for (const invoice of invoices) {
        const client = invoice.clients as any;
        if (!client?.phone) continue;

        const dueDate = invoice.due_date;
        const remindersToSend: Array<{ type: string; template: string }> = [];

        // 1st reminder
        if (dueDate === reminder1Str) {
          remindersToSend.push({ type: "reminder", template: settings.template_reminder });
        }
        // 2nd reminder (only if different day from 1st)
        if (dueDate === reminder2Str && reminder2Str !== reminder1Str) {
          remindersToSend.push({ type: "reminder_2", template: settings.template_reminder });
        }
        // Due date
        if (dueDate === todayStr) {
          remindersToSend.push({ type: "due_date", template: settings.template_due_date });
        }
        // Overdue — send if due_date matches the overdue threshold
        if (dueDate === overdueDateStr) {
          remindersToSend.push({ type: "overdue", template: settings.template_overdue });
        }

        for (const reminder of remindersToSend) {
          const key = `${invoice.id}:${reminder.type}`;
          if (sentSet.has(key)) continue;

          const amount = Number(invoice.amount).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
          const formattedDueDate = dueDate.split("-").reverse().join("/");

          const portalLink = await getOrCreatePortalLink(supabase, invoice.client_id, orgId);
          const portalSection = portalLink || "";

          const message = reminder.template
            .replace(/{nome}/g, client.name || "Cliente")
            .replace(/{valor}/g, amount)
            .replace(/{vencimento}/g, formattedDueDate)
            .replace(/{link_ou_chave_pix}/g, pixOrLink)
            .replace(/{link_portal}/g, portalSection)
            .replace(/{titular_pix}/g, (settings as any).pix_holder_name || "");

          // Use ON CONFLICT to enforce idempotency via unique index
          const { error: reminderErr } = await supabase.from("billing_reminders").insert({
            organization_id: orgId,
            invoice_id: invoice.id,
            reminder_type: reminder.type,
            reminder_date: todayStr,
            status: "pending",
          } as any);

          // Skip if duplicate (already sent today)
          if (reminderErr) {
            if (reminderErr.code === "23505") continue; // unique violation = already sent
            console.error(`[billing-cron] Reminder insert error:`, reminderErr.message);
            continue;
          }

          await supabase.from("whatsapp_queue").insert({
            organization_id: orgId,
            phone: client.phone,
            message,
            status: "queued",
          });

          totalQueued++;
          totalProcessed++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: totalProcessed, queued: totalQueued }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Billing cron error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
