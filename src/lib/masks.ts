// Display-only masks for sensitive fields (LGPD).
// Never alters stored values — only used for rendering.

const onlyDigits = (v?: string | null) => (v || "").replace(/\D/g, "");

export function maskCPF(value?: string | null) {
  const d = onlyDigits(value);
  if (d.length !== 11) return value || "";
  return `${d.slice(0, 3)}.***.${d.slice(6, 9)}-**`;
}

export function maskCNPJ(value?: string | null) {
  const d = onlyDigits(value);
  if (d.length !== 14) return value || "";
  return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-**`;
}

export function maskCPFCNPJ(value?: string | null) {
  const d = onlyDigits(value);
  if (d.length === 11) return maskCPF(value);
  if (d.length === 14) return maskCNPJ(value);
  if (!d) return "";
  // Generic fallback
  return d.slice(0, 3) + "•".repeat(Math.max(0, d.length - 5)) + d.slice(-2);
}

export function maskPhone(value?: string | null) {
  const d = onlyDigits(value);
  if (d.length < 8) return value || "";
  // Brazilian (with optional country): keep DDD + last 2
  if (d.length >= 11) {
    const ddd = d.slice(d.length - 11, d.length - 9);
    const last2 = d.slice(-2);
    return `(${ddd}) *****-**${last2}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ****-**${d.slice(-2)}`;
  }
  return d.replace(/.(?=.{2})/g, "*");
}

export function formatPhone(value?: string | null) {
  const d = onlyDigits(value);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return value || "";
}

export function formatCPFCNPJ(value?: string | null) {
  const d = onlyDigits(value);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value || "";
}

export function maskApiKey(value?: string | null, visible = 4) {
  if (!value) return "";
  if (value.length <= visible * 2) return "•".repeat(value.length);
  return value.slice(0, visible) + "•".repeat(Math.max(8, value.length - visible * 2)) + value.slice(-visible);
}
