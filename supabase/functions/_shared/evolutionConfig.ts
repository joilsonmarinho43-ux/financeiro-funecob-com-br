// Camada final de resolução das credenciais da Evolution API.
//
// Ordem de precedência (mantida em todo o sistema):
//   1. whatsapp_instances.api_url / api_key  (por organização — prioridade máxima)
//   2. global_settings.api_host / global_api_key (configurável na UI)
//   3. Variáveis de ambiente EVOLUTION_API_URL / EVOLUTION_API_KEY (deploy/VPS)
//
// O nível 3 existe para que a aplicação funcione em uma VPS própria sem
// nenhum endereço ou chave fixa no código-fonte.

export function envEvolutionUrl(): string {
  return (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
}

export function envEvolutionKey(): string {
  return Deno.env.get("EVOLUTION_API_KEY") || "";
}
