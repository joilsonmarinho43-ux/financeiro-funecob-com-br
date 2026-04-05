/**
 * Centralized React Query cache configurations by data volatility.
 * 
 * STATIC: Data that rarely changes (plans, settings, org config)
 * SEMI_STATIC: Data that changes occasionally (clients, invoices)
 * DYNAMIC: Data that changes frequently (queue, messages, monitor)
 */

export const QUERY_CACHE = {
  /** Plans, billing settings, org config, global settings — rarely change */
  STATIC: {
    staleTime: 10 * 60 * 1000,  // 10 min
    gcTime: 30 * 60 * 1000,     // 30 min
    refetchOnWindowFocus: false,
  },
  /** Clients, invoices, transactions — change on user actions */
  SEMI_STATIC: {
    staleTime: 2 * 60 * 1000,   // 2 min
    gcTime: 10 * 60 * 1000,     // 10 min
    refetchOnWindowFocus: false,
  },
  /** WhatsApp queue, messages, robot monitor — need freshness */
  DYNAMIC: {
    staleTime: 30 * 1000,       // 30s
    gcTime: 5 * 60 * 1000,      // 5 min
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000, // auto-refresh every 60s
  },
} as const;

/** Map query key prefixes to their cache tier */
export function getCacheTier(queryKey: string): typeof QUERY_CACHE[keyof typeof QUERY_CACHE] {
  const staticKeys = [
    "plans", "billing-settings", "global-settings", "barcode-config",
    "org-api-key", "whatsapp-send-config", "webhooks", "is-admin",
    "organization-membership", "billing-settings-gw", "barcode-config-settings",
  ];
  const dynamicKeys = [
    "whatsapp-queue", "whatsapp-messages", "whatsapp-queue-stats",
    "robot-monitor", "robot-queue-stats", "robot-reminder-stats",
    "whatsapp-queue-count", "whatsapp-messages-count",
  ];

  if (staticKeys.includes(queryKey)) return QUERY_CACHE.STATIC;
  if (dynamicKeys.includes(queryKey)) return QUERY_CACHE.DYNAMIC;
  return QUERY_CACHE.SEMI_STATIC;
}
