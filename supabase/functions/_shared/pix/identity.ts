export function normalizeBrazilianPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return (digits.length === 12 || digits.length === 13) && digits.startsWith("55")
    ? digits.slice(2) : digits;
}

export function phoneVariants(phone: string): string[] {
  const digits = normalizeBrazilianPhone(phone);
  if (digits.length !== 10 && digits.length !== 11) return [];
  const variants = new Set([digits]);
  if (digits.length === 11 && digits[2] === "9") variants.add(digits.slice(0, 2) + digits.slice(3));
  if (digits.length === 10) variants.add(digits.slice(0, 2) + "9" + digits.slice(2));
  return [...variants];
}

export function uniquePhoneMatch<T extends { phone?: string | null }>(
  phone: string, clients: T[], verified: boolean,
): { matches: T[]; client: T | null } {
  const variants = verified ? phoneVariants(phone) : [];
  const matches = clients.filter((client) =>
    variants.some((candidate) => phoneVariants(client.phone || "").includes(candidate))
  );
  return { matches, client: matches.length === 1 ? matches[0] : null };
}

function normalizedName(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function autoIdentityVerified(source: string, clientName: string, uniqueVerifiedPhone: boolean): boolean {
  return uniqueVerifiedPhone && !!source.trim() &&
    normalizedName(source) === normalizedName(clientName);
}
