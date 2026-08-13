# Segurança do repositório — varredura da Fase 1

Varredura feita em todo o repositório (exceto `node_modules`, lockfiles) por:
API keys, tokens, passwords, secrets, JWT secrets, credenciais, IPs privados e
URLs internas. Nenhum valor sensível é reproduzido aqui.

## Resultado

| Área | Situação |
|---|---|
| `src/` (frontend) | Limpo. Somente `import.meta.env.VITE_*`. Nenhuma chave, senha, IP ou URL privada. |
| `supabase/functions/` | Limpo. Todos os segredos via `Deno.env.get(...)`. Chaves da Evolution mascaradas nos logs (`ab***yz`); telefones truncados. |
| `extension/` | Limpo. A URL do `bip-receiver` é digitada pelo usuário e guardada em `chrome.storage`; no HTML há apenas um placeholder genérico. |
| `Dockerfile` / `docker-compose.yml` / `nginx.conf` | Limpos. Somente variáveis. |
| `.env.example` | Somente chaves vazias e o domínio público oficial. |
| `.gitignore` / `.dockerignore` | Bloqueiam `.env`, `.env.*`, `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`. |
| `extension-tests/` | Contém a URL pública do projeto Supabase em scripts de teste E2E (endpoint público, sem credencial). Não é segredo, mas o script real só roda com uma API key fornecida em runtime. |
| `.env` (arquivo real) | **Rastreado no histórico interno.** Contém apenas URL do projeto e chave *publishable/anon* (públicas por design, protegidas por RLS). Ainda assim, remova do versionamento ao publicar: `git rm --cached .env`. |

## Migrations com conteúdo sensível histórico

Duas migrations gravaram credenciais de infraestrutura diretamente em SQL:

- `20260805123133_...sql`
- `20260807014940_...sql`

Elas **não foram alteradas** (regra da Fase 1: não mexer em migrations).

> **Aviso operacional:** essas duas migrations contêm credenciais e endereços
> de infraestrutura reais e **não devem ser executadas às cegas em um banco
> novo**. Ao provisionar um ambiente limpo, revise-as antes e substitua os
> valores por variáveis/segredos do novo ambiente. Se as credenciais ali
> registradas ainda estiverem em uso, considere rotacioná-las.

## Boas práticas mantidas

- `SUPABASE_SERVICE_ROLE_KEY` nunca aparece em código de frontend.
- Segredos de servidor ficam em `supabase secrets`, não em arquivos versionados.
- Container roda como usuário não-root, sem capabilities e sem escalada de
  privilégios; porta publicada apenas em `127.0.0.1`.
