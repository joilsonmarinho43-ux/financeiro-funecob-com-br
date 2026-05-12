# Redesign Mobile-First Premium — FuneCob

Reconstrução completa da camada de UI mantendo toda a lógica de negócio, RLS e funções existentes intactas. Foco: aparência de fintech nativa em mobile, sem perder o desktop.

## 1. Design System (base)

Atualizar `src/index.css` e `tailwind.config.ts`:

- Paleta semântica (HSL):
  - `--background`: 210 40% 98% (#F8FAFC)
  - `--sidebar-background`: 222 47% 11% (#0F172A)
  - `--primary`: 199 89% 48% (#0EA5E9)
  - Tons pastel + bordas sólidas:
    - `--danger-soft` / `--danger` (vencidas)
    - `--warning-soft` / `--warning` (pendentes)
    - `--success-soft` / `--success` (pagas)
    - `--info-soft` / `--info`
- Tokens novos:
  - `--radius: 0.75rem` (12px global)
  - `--shadow-card`, `--shadow-elevated`, `--shadow-fab`
  - `--tap-target: 44px` (mínimo de toque)
- Tipografia: escala mobile com `text-financial` (24px/700) para valores no Dashboard.

## 2. App Shell mobile-first

- `AppLayout.tsx`:
  - Header fixo (sticky) com altura 56px, trigger do drawer à esquerda, logo central, ações à direita (notificações, perfil).
  - Em mobile (`<md`): Sidebar vira **Drawer** off-canvas (`collapsible="offcanvas"` do Shadcn sidebar) acionado por botão hamburger.
  - Em desktop: sidebar fixa colapsável (mantém comportamento atual).
- `AppSidebar.tsx`:
  - Itens com altura 48px, ícone 20px, label peso 500, agrupamentos com label discreta uppercase.
  - Indicador de rota ativa: barra vertical primária à esquerda + fundo `primary/10`.
  - Fundo `sidebar-background` (#0F172A), texto `sidebar-foreground`.

## 3. Componentes reutilizáveis novos

Criar em `src/components/ui/`:

- `data-card.tsx` — card de dado para listas mobile (título, badge pill, valor destacado à direita, ações).
- `status-pill.tsx` — badge arredondada (`rounded-full`) com variantes `paid|pending|overdue|canceled|info`, usando fundo pastel + texto sólido.
- `kpi-card.tsx` — card grande do dashboard com ícone, label, valor 24px, delta opcional.
- `fab.tsx` — Floating Action Button (56px, fixed bottom-right, sombra elevada, safe-area iOS).
- `sticky-filter-bar.tsx` — header sticky com input de busca + chips de filtro horizontais scrolláveis.
- `responsive-table.tsx` — wrapper que renderiza `<Table>` em `md+` e `DataCard[]` em mobile, recebendo um único schema de colunas.
- `masked-field.tsx` — exibe CPF/CNPJ/telefone mascarados, com helpers em `src/lib/masks.ts`.
- `secret-field.tsx` — input de chave com botão olho (revelar ao clicar, copy-to-clipboard).

## 4. Helpers

`src/lib/masks.ts`:
- `maskCPF`, `maskCNPJ`, `maskCPFCNPJ` (auto), `maskPhone`, `maskEmail`, `maskApiKey`.
- Apenas formatação de exibição; não altera dados no banco.

## 5. Telas a refatorar (somente UI/JSX/estilo)

Sem tocar em queries/mutations:

1. **Dashboard** (`src/pages/Dashboard.tsx`)
   - KPIs no topo em grid 1col mobile / 2col tablet / 4col desktop usando `KpiCard` (valores 24px+).
   - Lista "Inadimplentes" via `ResponsiveTable` → cards no mobile com pill de status e valor destacado à direita.
   - Sticky filter bar.

2. **Clients** (`src/pages/Clients.tsx`)
   - `StickyFilterBar` (busca + chips: todos/ativos/inadimplentes).
   - `ResponsiveTable` para listagem; cards com nome (título), CPF mascarado, telefone mascarado, status pill.
   - Botões de ação tap-target 44px.
   - **FAB "+"** para "Novo Cliente".
   - **Paginação Load More** (client-side sobre o resultado já carregado, em lotes de 25).

3. **Invoices** (`src/pages/Invoices.tsx`)
   - Sticky filter bar com chips: Todos / Pagos / Pendentes / Vencidos.
   - Cards com borda lateral sólida 4px conforme status (vencido = pastel rosa + borda vermelha, etc.).
   - Valor monetário alinhado à direita, peso 600.
   - FAB "+" para "Nova Fatura".
   - Load More 25 por página.

4. **WhatsApp** (`src/pages/WhatsApp.tsx`)
   - Lista de instâncias em cards.
   - Histórico com Load More.
   - Tap targets 44px nos botões.

5. **Settings / Gateways / GlobalSettings**
   - Substituir inputs de API key por `SecretField` (revelar/copiar).
   - Telefones e CPFs em `MaskedField`.

6. **Settlement, Reports, Transactions, BillingSettings, RecurrenceAudit, AdminPanel, Plans, SystemLogs, Webhooks, V3Pay, SMS**
   - Aplicar `ResponsiveTable`, `StatusPill`, sticky filter onde houver listagem; ajustes de spacing e radius. Sem mudança funcional.

7. **AppLayout / Header**
   - Notificações com badge.
   - Safe area inset para FAB (`env(safe-area-inset-bottom)`).

## 6. Acessibilidade & toque

- Classe utilitária `.tap` = `min-h-11 min-w-11 inline-flex items-center justify-center` para todos os ícone-botões.
- `aria-label` em todos os botões só com ícone.

## 7. Não faremos

- Não alteramos schema do banco, RLS, triggers, edge functions, lógica de cobrança/recorrência, autenticação.
- Não removemos rotas nem mudamos navegação além do shell.
- Sem dependências novas (usamos Shadcn já instalado).

## 8. Ordem de execução

1. Tokens em `index.css` + `tailwind.config.ts`.
2. Helpers (`masks.ts`) + componentes base (`StatusPill`, `KpiCard`, `Fab`, `StickyFilterBar`, `MaskedField`, `SecretField`, `DataCard`, `ResponsiveTable`).
3. `AppLayout` + `AppSidebar` (drawer mobile).
4. Dashboard → Clients → Invoices (telas críticas).
5. WhatsApp + Settings/Gateways/GlobalSettings (mascaramento).
6. Demais telas (passagem de polimento).
7. QA visual em 390px (mobile) e 1280px (desktop).

## Detalhes técnicos

- Drawer: usar o próprio `Sidebar` do Shadcn com `collapsible="offcanvas"` no breakpoint mobile via `useIsMobile`.
- Sticky: `sticky top-14 z-30 bg-background/80 backdrop-blur` (top-14 = abaixo do header).
- Cards de status (overdue):
  ```
  bg-danger-soft border-l-4 border-danger rounded-xl shadow-card
  ```
- FAB:
  ```
  fixed bottom-6 right-6 h-14 w-14 rounded-full
  bg-primary text-primary-foreground shadow-fab
  pb-[env(safe-area-inset-bottom)]
  ```
- Paginação Load More: estado local `visibleCount` + botão "Carregar mais" no fim da lista; mantém queries existentes.
- Mascaramento: aplicado no render; valor real preserved em forms via `react-hook-form` (sem mudar payloads).