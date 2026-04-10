import { supabase } from "@/integrations/supabase/client";

interface AuditLogParams {
  action: string;
  organizationId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Logs an audit event to system_logs.
 * Fire-and-forget — never throws.
 */
export async function auditLog({ action, organizationId, details }: AuditLogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("system_logs").insert({
      action,
      user_id: user.id,
      organization_id: organizationId || null,
      details: details || {},
      user_agent: navigator.userAgent,
    } as any);
  } catch {
    // Silent fail — audit logs must never break user flows
  }
}
