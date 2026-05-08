/**
 * Utilitários de formatação compartilhados.
 * Centraliza parsing/formatação de datas (UTC-3) e valores monetários.
 */

/**
 * Faz parsing de data ISO ("YYYY-MM-DD") evitando deslocamento de timezone.
 * Datas vindas do banco (DATE) chegam como string sem timezone — usar `new Date(string)`
 * direto interpreta como UTC e pode subtrair 1 dia em UTC-3.
 */
export const parseDateLocal = (d: string | null | undefined): Date => {
  if (!d) return new Date(NaN);
  // Se já vier com timestamp (paid_date pode ser timestamptz), tenta parse direto
  if (d.includes("T")) return new Date(d);
  const [year, month, day] = d.split("-").map(Number);
  if (!year || !month || !day) return new Date(NaN);
  return new Date(year, month - 1, day, 12, 0, 0);
};

/**
 * Formata número como moeda BRL. Tolerante a null/undefined/NaN.
 */
export const formatCurrency = (value: number | string | null | undefined): string => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

/**
 * Formata data BR (dd/MM/yyyy) a partir de string DB.
 */
export const formatDateBR = (d: string | null | undefined): string => {
  if (!d) return "—";
  const date = parseDateLocal(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
};

/**
 * Formata telefone BR para exibição: (DD) 9XXXX-XXXX.
 */
export const formatPhone = (phone: string | null | undefined): string => {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return phone;
};
