import { useOrganization } from "@/hooks/useOrganization";

const FUNERARIA_TERMS = {
  plan: "Plano Familiar",
  plans: "Planos Familiares",
  invoice: "Mensalidade",
  invoices: "Mensalidades",
  client: "Associado",
  clients: "Associados",
  dependent: "Dependente",
  dependents: "Dependentes",
  event: "Óbito",
  installment: "Mensalidade",
  creditLimit: "Cobertura",
  receipt: "Comprovante",
};

const CREDIARIO_TERMS = {
  plan: "Carnê",
  plans: "Carnês",
  invoice: "Parcela",
  invoices: "Parcelas",
  client: "Cliente",
  clients: "Clientes",
  dependent: "Fiador",
  dependents: "Fiadores",
  event: "Compra",
  installment: "Parcela",
  creditLimit: "Limite de Crédito",
  receipt: "Recibo",
};

const LOJA_TERMS = {
  plan: "Plano de Pagamento",
  plans: "Planos de Pagamento",
  invoice: "Cobrança",
  invoices: "Cobranças",
  client: "Cliente",
  clients: "Clientes",
  dependent: "Contato",
  dependents: "Contatos",
  event: "Venda",
  installment: "Parcela",
  creditLimit: "Limite de Crédito",
  receipt: "Recibo",
};

export type NicheTerms = typeof FUNERARIA_TERMS;

export function useNicheTerms(): NicheTerms {
  const { organization } = useOrganization();
  const niche = (organization as any)?.niche || "funeraria";
  if (niche === "crediario") return CREDIARIO_TERMS;
  if (niche === "loja") return LOJA_TERMS;
  return FUNERARIA_TERMS;
}
