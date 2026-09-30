export function normalizeDeliveryStatus(value: any): "pending" | "sent" | "delivered" | "read" | "failed" | null {
  const raw = String(value ?? "").toLowerCase().replace(/[-\s]/g, "_");
  if (!raw) return null;
  if (raw.includes("error") || ["failed", "failure"].includes(raw)) return "failed";
  if (raw.includes("read") || ["played", "read_by_recipient"].includes(raw)) return "read";
  if (raw.includes("deliver") || ["delivery_ack", "deliveryack"].includes(raw)) return "delivered";
  if (raw.includes("server_ack") || ["sent", "ack", "serverack"].includes(raw)) return "sent";
  if (["pending", "queued"].includes(raw)) return "pending";
  // Baileys WebMessageInfo.Status: ERROR=0, PENDING=1, SERVER_ACK=2,
  // DELIVERY_ACK=3, READ=4, PLAYED=5. Unknown values prove no delivery.
  const n = Number(value);
  if (n === 0) return "failed";
  if (n === 1) return "pending";
  if (n === 2) return "sent";
  if (n === 3) return "delivered";
  if (n === 4 || n === 5) return "read";
  return null;
}

