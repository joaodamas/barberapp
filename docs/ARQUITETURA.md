# Arquitetura Técnica — O Siqueira Barbearia

> Referência técnica da plataforma. Estado do código em **2026-08-02**, commit `a881f59`.
> Para os defeitos encontrados e o plano de correção, ver [AUDITORIA-2026-08-02.md](./AUDITORIA-2026-08-02.md).

---

## 1. Visão geral

Aplicação **PWA única** que serve dois produtos distintos a partir do mesmo bundle:

| Produto | Rotas | Guard | Público |
|---|---|---|---|
| App do cliente | `/`, `/agendar`, `/planos`, `/reservas`, `/perfil` | `AuthGuard` | qualquer conta autenticada |
| Painel do dono | `/painel/**` | `AuthGuard requireOwner` | conta com claim `role: owner` |
| Login | `/login` | — | público |
| Offline | `/offline` | — | servido pelo service worker |

O que separa cliente de dono **não é a tela de entrada** — é a *permissão da conta*. Existe um único `/login`; o destino pós-autenticação é decidido pelo custom claim `role`.

### Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.2.12 |
| UI | React | 19.2.4 |
| Linguagem | TypeScript (`strict: true`) | ^5 |
| Estilo | Tailwind CSS v4 (`@theme inline`) | ^4 |
| Ícones | lucide-react | ^1.28.0 |
| Auth / BaaS | Firebase JS SDK (projeto `axon-barber`) | ^12.17.0 |
| Backend | Cloud Functions (Node 22, `southamerica-east1`) | firebase-functions ^6.6.0 |
| Hospedagem | Firebase Hosting → `osiqueira.jpproject.com.br` | — |

> ⚠️ `web/AGENTS.md` avisa: *"This is NOT the Next.js you know"*. A versão 16 tem breaking changes em relação a versões anteriores. Consultar `web/node_modules/next/dist/docs/` antes de escrever código de framework.

### Escala do código

```
web/src         ~5.900 linhas (23 rotas/componentes + 8 libs)
functions/src     453 linhas (apenas o catálogo de templates)
────────────────────────────────────────────────
total tipado    ~6.640 linhas TypeScript
```

Maiores arquivos: `lib/mock-data.ts` (722), `financeiro/dre/page.tsx` (497), `functions/.../templates.ts` (453), `agendar/page.tsx` (442), `reservas/page.tsx` (396).

---

## 2. Estrutura de diretórios

```
barberapp/
├── firebase.json              hosting + functions + firestore + storage
├── .firebaserc                projeto default: axon-barber
├── prd-app-barbearia.md       PRD (477 linhas) — fonte da verdade do produto
├── CHANGELOG.md               Keep a Changelog, pt-BR
├── functions/
│   ├── package.json           main: lib/index.js  ⚠️ (src/index.ts não existe)
│   └── src/whatsapp/templates.ts    catálogo dos 16 templates da Meta
└── web/
    ├── AGENTS.md → CLAUDE.md  aviso de breaking changes do Next 16
    ├── next.config.ts         apenas headers de cache do /sw.js
    ├── public/sw.js           service worker escrito à mão
    └── src/
        ├── app/
        │   ├── layout.tsx            root: fontes, metadata, AuthProvider, SW
        │   ├── manifest.ts           PWA manifest gerado por rota
        │   ├── login/page.tsx        telefone/SMS · e-mail/senha · Google
        │   ├── offline/page.tsx
        │   ├── (cliente)/            route group — layout do app do cliente
        │   │   ├── layout.tsx        AuthGuard + sidebar + bottom nav
        │   │   ├── page.tsx          Início   ⚠️ único Server Component de tela
        │   │   ├── agendar/          fluxo de 4 passos
        │   │   ├── planos/           catálogo + checkout + plano ativo
        │   │   ├── reservas/         futuras/histórico + reagendar + cancelar
        │   │   └── perfil/           identidade + 5 modais
        │   └── painel/(dashboard)/   route group — layout logado do dono
        │       ├── layout.tsx        AuthGuard requireOwner
        │       ├── page.tsx          Hoje: KPIs, caixa, encaixes, agenda
        │       ├── financeiro/       resumo · dre · fluxo-caixa · despesas · projecao
        │       ├── numeros/          KPIs por período, heatmap, recorrência
        │       ├── mensal/           mensalistas, MRR, régua de cobrança
        │       └── loja/             produtos, estoque, simulador de comissão
        ├── components/
        │   ├── ui/                   button · card · pill · modal · barber-pole-divider
        │   ├── auth-guard.tsx        porta de entrada das áreas logadas
        │   ├── bottom-nav.tsx        + wrappers cliente/painel
        │   ├── *-sidebar-nav.tsx     sidebars desktop
        │   ├── sidebar-user-footer.tsx / profile-identity.tsx / sign-out-button.tsx
        │   ├── owner-panel-link.tsx  atalho condicional ao claim owner
        │   └── coming-soon.tsx       ⚠️ componente órfão (nenhum import)
        └── lib/
            ├── firebase.ts           init + lazy loaders do SDK
            ├── auth-context.tsx      AuthProvider / useAuth
            ├── mock-data.ts          TODA a camada de dados (fictícia)
            ├── types.ts              Service · Booking · BookingStatus · TimeSlot
            ├── nav-items.ts / booking-status.ts / payment-method.ts
            ├── format.ts             formatBRL · formatDatePtBR
            └── cn.ts                 clsx + tailwind-merge
```

**Route groups.** `(cliente)` e `(dashboard)` não aparecem na URL — existem para separar o layout logado do `/login`, que não tem sidebar nem guard. Nenhuma URL mudou quando o agrupamento foi introduzido.

---

## 3. Autenticação e autorização

### 3.1 Fluxo

```
                      ┌──────────────────────────────┐
   /login  ──────────▶│ Firebase Auth                │
   (3 métodos)        │  · signInWithPhoneNumber     │
                      │  · signInWithEmailAndPassword│
                      │  · signInWithPopup (Google)  │
                      └──────────────┬───────────────┘
                                     │ onAuthStateChanged
                                     ▼
                      ┌──────────────────────────────┐
                      │ AuthProvider (layout raiz)   │
                      │  getIdTokenResult()          │
                      │  → { user, claims, loading } │  ← UM ÚNICO setState
                      └──────────────┬───────────────┘
                                     │ useAuth()
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
        AuthGuard (cliente)              AuthGuard requireOwner (painel)
        !!user                           !!user && claims.role === "owner"
                    │                                 │
      sem conta → /login          sem permissão → /  (app do cliente)
```

### 3.2 O invariante do estado único

`web/src/lib/auth-context.tsx:27` mantém `user`, `claims` e `loading` num **único objeto de estado**, deliberadamente:

> Se forem dois `setState` separados, existe uma renderização com *"logado, mas sem permissão ainda"* — e quem lê `role` nesse instante (o redirect do login, o `AuthGuard`) decide errado.

Esse era o bug que mandava o dono para o app do cliente. **Não separar esse estado.** Qualquer refatoração que introduza um `setState` só para `claims` reintroduz o defeito.

### 3.3 Claims

```ts
type Claims = { role?: string; workspaceId?: string }
```

- `role === "owner"` → único valor consumido (`auth-guard.tsx:20`, `login/page.tsx:42`, `owner-panel-link.tsx:14`).
- `workspaceId` → **lido e nunca usado**. É o gancho reservado para o multi-tenant da Fase 3 do PRD.

> ⚠️ **Não existe no repositório nenhum código que atribua o claim `role`.** Ele precisa ser gravado fora da aplicação (Admin SDK / `firebase auth:import` / console). Isso não está documentado em lugar nenhum — ver AUD-04.

### 3.4 Superfície de autorização

A autorização é **exclusivamente client-side**. Todas as 19 rotas são prerenderizadas estaticamente e servidas como arquivos públicos pelo Firebase Hosting. O `AuthGuard` só decide *o que renderizar depois da hidratação*. A proteção real dos dados terá de vir das **Firestore Security Rules** — que ainda não existem no repositório.

---

## 4. Camada de dados

### 4.1 Estado atual: `lib/mock-data.ts`

Toda a plataforma lê de um módulo estático de 722 linhas. **Nada persiste**: recarregar a página desfaz cancelamentos, assinaturas, despesas e produtos.

O módulo é dividido em:

| Bloco | Exports | Consumido por |
|---|---|---|
| Barbearia / catálogo | `barbershop`, `services`, `getServicesByIds` | Início, Agendar, Reservas, Perfil |
| Agenda | `nextBooking`, `bookingHistory`, `todayBookings`, `mockSlotsForDay`, `todayKpis`, `cashToday`, `needsYou` | Início, Reservas, Agendar, Hoje |
| Fidelidade | `loyalty` | Início, Reservas, Perfil |
| Regras de negócio | `businessRates` (comissão 15%, imposto 6%), `paymentGateways` | Loja, DRE |
| Loja | `products`, `productMovements` | Loja, DRE |
| Financeiro | `monthExpenses`, `expenseCategories`, `dre`, `breakEven`, `revenueBreakdown`, `dailyCashHistory`, `cashProjection` | Financeiro, DRE, Despesas, Fluxo, Projeção |
| Séries por período | `MONTH_REVENUE_FACTORS`, `monthRevenueFactor`, `monthLabelFor`, `PERIOD_MONTHS`, `periodFactor`, `MAX_MONTH_OFFSET` | DRE, Números |
| Números | `monthKpis`, `noShowStats`, `topServices`, `clientRecurrence`, `hourlyHeatmap` | Números |
| Mensalistas | `mrr`, `subscribers`, `plans` | Mensal, Planos |

**Exports órfãos** (definidos, nunca importados): `availableMonths`, `previousMonthKpis`, `operationalStats`, `sixMonthFlow`, `commissionRatePct`.

### 4.2 O motor de períodos

Em vez de manter um dataset por mês, o mock deriva meses anteriores de um vetor determinístico de fatores de receita:

```ts
const MONTH_REVENUE_FACTORS = [1, 0.89, 0.94, 1.07, 0.82, 0.91, 0.97, 1.12, 0.86, 0.93, 1.04, 0.88];
monthRevenueFactor(offset)  // offset 0 = julho/2026, 1 = junho, ... (módulo 12)
periodFactor(period, offset) // soma os fatores dos meses que compõem o período
```

Duas regras de agregação, deliberadas:

1. **Receita e custo variável acompanham o mês; custo fixo não.** É isso que faz o resultado variar de forma coerente ao navegar meses no DRE, em vez de escalar tudo junto e manter a margem sempre idêntica.
2. **Valores acumuláveis somam; taxas usam média mensal.** Sem isso, um trimestre exibiria 180% de ocupação. Em Números, o ticket médio é *derivado* (`receita ÷ atendimentos`) justamente para nunca ficar inconsistente.

> ⚠️ Como o índice é módulo 12, `periodFactor("ano", 0)` e `periodFactor("ano", 1)` somam exatamente o mesmo conjunto — ver AUD-19.

### 4.3 Modelo de domínio (`lib/types.ts`)

```ts
type BookingStatus =
  | "pending_payment" | "confirmed" | "confirmed_by_client" | "completed"
  | "no_show" | "cancelled_by_client" | "cancelled_by_shop" | "expired"
  | "fit_in_requested";

type PaymentMethod = "pix" | "cartao" | "local";

type Booking = { id, clientName, clientWhatsapp, serviceIds[], date, time,
                 status, value, isFitIn?, paymentMethod };
type Service  = { id, name, durationMin, price, priceFrom?, description? };
type TimeSlot = { time, available, isFitIn? };
```

Os 9 estados de `BookingStatus` batem exatamente com a seção 13 do PRD. `bookingStatusMeta` (`lib/booking-status.ts`) é o mapa único de rótulo + tom visual — **toda tela que exibe status deve ler daqui**, nunca escrever o rótulo à mão.

### 4.4 Entidades previstas e ainda inexistentes

O PRD (§13) prevê 20+ coleções. Hoje **nenhuma** existe. As mais estruturantes ausentes: `bookings`, `payments`, `refunds`, `client_occurrences`, `wallet_credits`, `subscriptions` + `subscription_invoices`, `loyalty_transactions`, `inventory_movements`, `commissions`, `cash_entries`, `whatsapp_messages`, `audit_log`.

---

## 5. Design system

### 5.1 Tokens (`app/globals.css`)

Tema **claro** — fundo branco, detalhes em dourado e preto:

```css
--color-bg: #ffffff;            --color-surface: #f8f5ee;
--color-surface-raised: #efe9dc; --color-border: #e1d8c5;
--color-gold: #b8863a;          --color-gold-light: #8c5f1e;
--color-ivory: #17140f;         --color-ivory-muted: #6b6355;
--color-success: #4f8542;       --color-danger: #ab4a3a;
```

> ⚠️ **A nomenclatura mente.** `--color-ivory` é o texto quase preto (#17140f), não um marfim. `--color-gold-light` (#8c5f1e) é *mais escuro* que `--color-gold` (#b8863a) — existe para ter contraste suficiente como texto sobre fundo claro. As sombras (`rgba(0,0,0,0.35–0.7)`) ainda são as de um tema escuro. Renomear é trabalho pendente; enquanto isso, **não presuma pelo nome**.

Os tokens são expostos ao Tailwind v4 via `@theme inline`, o que gera as utilitárias `bg-bg`, `text-ivory-muted`, `border-border`, `text-gold-light` etc.

### 5.2 Primitivos (`components/ui/`)

| Componente | API | Observação |
|---|---|---|
| `Button` | `variant: primary \| secondary \| ghost` | `min-h-11` (44px, alvo de toque) |
| `Card` | `interactive?: boolean` | `div` — não é focável nem clicável por teclado |
| `Pill` | `tone: gold \| success \| danger \| neutral` | rótulos de status |
| `Modal` | `open, onClose, title, description?, footer?, className?` | fecha por `Esc`, `role="dialog"`, `aria-modal` |
| `BarberPoleDivider` | — | assinatura visual (listra animada) |

`cn()` (clsx + tailwind-merge) é o utilitário obrigatório para compor classes — garante que a classe passada por prop vença a padrão.

### 5.3 Convenções visuais consolidadas

- **Mobile-first com `md:` como quebra para desktop.** O container do cliente é `max-w-md` no mobile e vira `md:max-w-none md:flex-row` com sidebar no desktop.
- **Duas navegações**: `BottomNav` (mobile, `md:hidden`) e sidebar (`hidden md:flex`), ambas alimentadas pelo mesmo `lib/nav-items.ts`.
- **Segunda coluna no desktop**: Início, Reservas, Agendar e Perfil usam `md:grid-cols-[1fr_NNNpx]` para não deixar o conteúdo preso numa coluna estreita. O mobile não é afetado.
- **Foco visível global**: `:where(button,a,input,select,textarea):focus-visible` recebe halo dourado.
- **`prefers-reduced-motion`** é respeitado na listra do barber pole e no hover dos cards.

---

## 6. PWA e service worker

### 6.1 Registro

`ServiceWorkerRegister` (montado no layout raiz) registra `/sw.js` **apenas em produção**. `next.config.ts` serve `/sw.js` com `Cache-Control: no-cache, no-store, must-revalidate` — sem isso o navegador serviria um SW velho indefinidamente.

### 6.2 Estratégias de cache (`public/sw.js`, cache `o-siqueira-v2`)

| Requisição | Estratégia | Motivo |
|---|---|---|
| `mode === "navigate"` | rede → fallback `/offline` | navegação sempre atual |
| `/_next/static/**` e app shell | **cache-first** | assets têm hash no nome: a mesma URL nunca muda de conteúdo |
| demais GET same-origin | rede-primeiro, cache como rede de segurança | dados podem mudar |

> **História relevante:** a estratégia "rede primeiro" já foi aplicada de forma ampla demais para resolver um bundle preso em cache. O efeito foi tela branca a cada troca de aba — esperar a rede por arquivos imutáveis adiciona uma ida ao servidor por navegação. A volta ao cache-first para `/_next/static/` foi a correção. **Não reverter sem entender esse histórico.**

### 6.3 Carregamento sob demanda do Firebase

`lib/firebase.ts` carrega **apenas o Auth** de imediato (o `AuthProvider` está no layout raiz, logo roda em toda página). Firestore, Storage, Functions e Analytics são importados dinamicamente:

```ts
export const auth = getAuth(firebaseApp);              // eager
export async function getDb()               { const { getFirestore } = await import("firebase/firestore"); ... }
export async function getAppStorage()        { ... }
export async function getAppFunctions()      { getFunctions(app, "southamerica-east1") }
export async function getFirebaseAnalytics() { ... isSupported() ... }
```

Isso tirou o chunk de ~558 KB do Firestore do carregamento inicial. **Manter esse padrão** ao integrar o banco: importe `getDb()` dentro do handler/efeito, nunca no topo de um módulo que o layout raiz alcança.

---

## 7. Build, execução e deploy

### 7.1 Comandos

```bash
# desenvolvimento
cd web && npm install && npm run dev     # http://localhost:3000

# verificações
npx tsc --noEmit                          # ✅ passa
npm run lint                              # ✅ passa (eslint-config-next)
npm run build                             # ⚠️ FALHA sem .env.local — ver AUD-01
```

### 7.2 Variáveis de ambiente

`web/.env.local` (não versionado; modelo em `web/.env.example`):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Nenhuma credencial no repositório. As chaves `NEXT_PUBLIC_*` do Firebase são públicas por design (vão para o bundle) — a proteção vem das Security Rules e dos domínios autorizados no console, **não do sigilo da apiKey**.

### 7.3 Saída do build

As 19 rotas são **estáticas** (`○ Static`). Como todo o conteúdo logado está atrás do `AuthGuard`, e `loading` é `true` durante o prerender, **o HTML estático de toda tela logada contém apenas o spinner**. Consequências:

- Não há vazamento de dados no HTML estático (hoje).
- Não há risco de *hydration mismatch* nas telas que usam `new Date()` em render — o conteúdo não é prerenderizado.
- Em compensação, o *first contentful paint* de qualquer rota logada é sempre um spinner, e o conteúdo só aparece após o SDK do Auth carregar e `onAuthStateChanged` disparar.

### 7.4 Deploy

```bash
firebase deploy --only hosting     # ✅ funciona
firebase deploy                    # ❌ falha: firestore.rules / storage.rules /
                                   #    firestore.indexes.json não existem
firebase deploy --only functions   # ❌ falha: functions/src/index.ts não existe
```

Após publicar, o service worker antigo continua instalado até a visita seguinte. Para ver a versão nova na hora: `Ctrl+Shift+R` ou janela anônima.

---

## 8. Integração WhatsApp (projetada, não implementada)

`functions/src/whatsapp/templates.ts` é a **fonte da verdade dos textos** submetidos à Meta. 16 templates cobrindo cinco réguas:

| Régua | Templates |
|---|---|
| Agendamento (cliente) | `confirmacao_reserva`, `lembrete_confirmacao` (com botões), `cancelamento_reserva`, `encaixe_alternativas`, `pos_atendimento` |
| Operacional (barbeiro) | `encaixe_solicitacao` (com botões), `resumo_do_dia`, `alerta_operacional` |
| Cobrança de mensalista | `mensalidade_aviso`, `mensalidade_hoje`, `mensalidade_atraso`, `mensalidade_suspensao` |
| Avisos de agenda | `agenda_alterada`, `comunicado_geral` |
| Reengajamento | `reativacao_cliente`, `aniversario` |

Tipos exportados: `TemplateCategory` (`UTILITY` \| `MARKETING`), `ButtonAction` (`CONFIRM_BOOKING`, `CANCEL_BOOKING`, `APPROVE_FITIN`, `DECLINE_FITIN`, `RESCHEDULE`), `TemplateDef`, `QuickReply`.

**Ainda faltam:** client da API, webhook de recebimento, gatilhos, log de mensagens e opt-in. Bloqueado nas credenciais da Meta (número, token permanente de system user, Phone Number ID, WABA ID). Os templates precisam ser submetidos e aprovados antes do go-live — **a aprovação leva dias**.

> 🔴 14 dos 16 templates violam a regra de placeholders documentada no próprio cabeçalho do arquivo e seriam rejeitados. Ver AUD-06.

---

## 9. Regras de negócio implementadas

Duas regras estão de fato codificadas (o resto é layout sobre dado fixo):

### 9.1 Política de cancelamento — `reservas/page.tsx:38` (`refundFor`)

```
pagamento === "local"        → devolve R$ 0 ("não havia valor pago")
horas até o atendimento ≥ 24 → devolve 100% do valor
horas até o atendimento ≥  6 → devolve 50% do valor
caso contrário               → devolve R$ 0
```

> ⚠️ O PRD (§6) especifica taxa de **20–30%**, ou seja, devolução de 70–80%. O código devolve 50%. Ver AUD-13.

### 9.2 Rateio de comissão e imposto — `loja/page.tsx` + `mock-data.ts:216`

```
lucro bruto     = preço de venda − custo
comissão        = lucro bruto × 15%   (businessRates.commissionRatePct)
imposto         = lucro bruto × 6%    (businessRates.taxRatePct)
lucro líquido   = lucro bruto − comissão − imposto
preço sugerido  = custo ÷ (1 − %lucro/100)      ← margem sobre o PREÇO, não sobre o custo
```

`businessRates` é a fonte única — DRE, Loja e a calculadora de precificação leem daqui para nunca ficarem descolados. **Não hardcodar percentuais em tela.**

> ⚠️ O PRD (§10) define um rateio `%barbeiro + %barbearia = 100%` sobre o lucro bruto (exemplo 40/60). O código usa uma taxa única de 15%. São modelos diferentes. Ver AUD-25.

### 9.3 O que o DRE calcula

```
Receita Bruta            = dre.grossRevenue × fator do mês
(−) CMV                  = Σ purchaseCost dos productMovements
(−) Despesas Variáveis   = taxas de gateway + comissões
(=) Custo Variável Total
(=) Margem de Contribuição = Receita − Custo Variável
(−) Despesas Fixas       = Σ monthExpenses  (NÃO escala com o mês)
(−) Folha                = 0 (operação solo)
(=) Resultado do Mês
```

O simulador de cenário aplica o fator de crescimento **apenas** sobre receita e custo variável — o custo fixo permanece igual. É isso que revela o impacto real na margem.

---

## 10. Convenções para novo código

1. **Status e rótulos vêm de mapas únicos.** `bookingStatusMeta`, `paymentMethodLabel`, `businessRates` — nunca duplicar o texto ou o número na tela.
2. **Formatação centralizada.** `formatBRL` e `formatDatePtBR` (`lib/format.ts`). Não chamar `toLocaleString` direto.
   ⚠️ `formatDatePtBR` devolve `"domingo, 05 de julho"`. **Não usar `.split(",")[0]`** para extrair a data — isso devolve o dia da semana. Ver AUD-05.
3. **Modais usam `components/ui/modal.tsx`.** Ele já trata `Esc`, `aria-modal` e clique no backdrop. Loja e Despesas ainda têm cópias locais — não criar a quarta.
4. **Navegação interna com `<Link>`**, nunca `<a href="/rota">` (causa reload completo).
5. **Firebase pesado sob demanda.** `getDb()`, `getAppStorage()`, `getAppFunctions()` — nunca no topo de módulo alcançado pelo layout raiz.
6. **Server Component por padrão; `"use client"` só quando há estado, efeito ou evento.** Hoje só `(cliente)/page.tsx` é Server Component — e por isso não consegue ler `useAuth` (ver AUD-14).
7. **`cn()` para classes**, sempre, para que a prop `className` vença a classe padrão.
8. **Não separar o estado do `AuthProvider`** (ver §3.2).

---

## 11. Lacunas estruturais conhecidas

| Área | Situação |
|---|---|
| Persistência | Nenhuma. Firestore inicializado, nenhuma tela o usa. |
| Security Rules | Não existem no repositório. |
| Cloud Functions | Só o catálogo de templates; sem `index.ts`, sem deploy possível. |
| Pagamentos | Nenhuma integração de gateway. Checkout é simulado. |
| WhatsApp | Só o catálogo. Sem client, webhook ou gatilho. |
| Multi-tenant | `workspaceId` lido e ignorado. |
| Testes | Zero. Nenhum framework instalado. |
| CI/CD | Inexistente (`.github/` não existe). |
| Observabilidade | Sem Sentry/Crashlytics; erros de auth são engolidos com `catch {}`. |
| LGPD / auditoria | Sem opt-in, sem exclusão de dados, sem `audit_log`. |

---

## 12. Referências

- [`prd-app-barbearia.md`](../prd-app-barbearia.md) — PRD completo (17 seções, 14 épicos)
- [`CHANGELOG.md`](../CHANGELOG.md) — histórico de mudanças
- [`AUDITORIA-2026-08-02.md`](./AUDITORIA-2026-08-02.md) — 47 achados priorizados
- `web/node_modules/next/dist/docs/` — documentação da versão exata do Next em uso
