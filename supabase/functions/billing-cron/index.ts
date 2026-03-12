import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Get all organizations with billing settings enabled
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

      // Calculate reminder date
      const reminderDate = new Date(today);
      reminderDate.setDate(reminderDate.getDate() + settings.reminder_days_before);
      const reminderDateStr = reminderDate.toISOString().split("T")[0];

      // Get open invoices with client info for this org
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

      // Get already sent reminders for today to avoid duplicates
      const { data: sentToday } = await supabase
        .from("billing_reminders")
        .select("invoice_id, reminder_type")
        .eq("organization_id", orgId)
        .gte("created_at", `${todayStr}T00:00:00Z`)
        .lte("created_at", `${todayStr}T23:59:59Z`);

      const sentSet = new Set(
        (sentToday || []).map((s: any) => `${s.invoice_id}:${s.reminder_type}`)
      );

      for (const invoice of invoices) {
        const client = invoice.clients as any;
        if (!client?.phone) continue;

        const dueDate = invoice.due_date;
        let reminderType: string | null = null;
        let template = "";

        // Determine which reminder to send
        if (dueDate === reminderDateStr) {
          reminderType = "reminder";
          template = settings.template_reminder;
        } else if (dueDate === todayStr) {
          reminderType = "due_date";
          template = settings.template_due_date;
        } else if (dueDate < todayStr) {
          reminderType = "overdue";
          template = settings.template_overdue;
        }

        if (!reminderType) continue;

        // Check if already sent today
        const key = `${invoice.id}:${reminderType}`;
        if (sentSet.has(key)) continue;

        // Build message from template
        const pixOrLink =
          settings.billing_mode === "pix_direto" && settings.pix_key
            ? `Chave Pix (${settings.pix_key_type}): ${settings.pix_key}`
            : "Link de pagamento será enviado em breve.";

        const amount = Number(invoice.amount).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const formattedDueDate = dueDate.split("-").reverse().join("/");

        const message = template
          .replace(/{nome}/g, client.name || "Cliente")
          .replace(/{valor}/g, amount)
          .replace(/{vencimento}/g, formattedDueDate)
          .replace(/{link_ou_chave_pix}/g, pixOrLink);

        // Insert into billing_reminders
        await supabase.from("billing_reminders").insert({
          organization_id: orgId,
          invoice_id: invoice.id,
          reminder_type: reminderType,
          status: "pending",
        });

        // Insert into whatsapp_queue for actual sending
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

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        queued: totalQueued,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Billing cron error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
