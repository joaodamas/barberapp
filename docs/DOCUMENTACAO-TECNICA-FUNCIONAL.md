# Documentação técnica funcional — Plataforma de barbearias

Levantado a partir do código em 11/08/2026, no commit `5160d3f`.

Este documento descreve **o que existe**, não o que foi planejado. Onde uma tela
aparenta funcionar e não funciona, isso está registrado na seção
[O que ainda é fachada](#17-o-que-ainda-é-fachada). A distinção é o ponto: a
documentação anterior descrevia intenções, e foi o que fez uma auditoria inteira
analisar código que não correspondia à produção.

---

## Índice

1. [O que é a plataforma](#1-o-que-é-a-plataforma)
2. [Arquitetura e multi-tenant](#2-arquitetura-e-multi-tenant)
3. [Papéis e permissões](#3-papéis-e-permissões)
4. [Modelo de dados](#4-modelo-de-dados)
5. [Cloud Functions](#5-cloud-functions)
6. [Regras de segurança](#6-regras-de-segurança)
7. [App do cliente final](#7-app-do-cliente-final)
8. [Painel do dono](#8-painel-do-dono)
9. [Cadastro e onboarding](#9-cadastro-e-onboarding)
10. [Planos, trial e paywall](#10-planos-trial-e-paywall)
11. [Motor de agenda](#11-motor-de-agenda)
12. [Financeiro: fórmulas](#12-financeiro-fórmulas)
13. [Fidelidade](#13-fidelidade)
14. [WhatsApp](#14-whatsapp)
15. [Componentes de interface](#15-componentes-de-interface)
16. [Estados, erros e vazios](#16-estados-erros-e-vazios)
17. [O que ainda é fachada](#17-o-que-ainda-é-fachada)
18. [Ambientes e deploy](#18-ambientes-e-deploy)

---

## 1. O que é a plataforma

Um SaaS de gestão para barbearias, com dois produtos numa base de código só:

- **App do cliente final** — quem corta cabelo agenda, remarca, cancela,
  acompanha fidelidade e assina plano de mensalista.
- **Painel do dono** — agenda do dia, equipe, catálogo, financeiro completo
  (DRE, fluxo, projeção, despesas), loja e mensalistas.

Cada barbearia é um **tenant** isolado, servido num subdomínio próprio.

### Endereços

| URL | O que é |
|---|---|
| `osiqueira.jpproject.com.br` | app da barbearia piloto (produção) |
| `<slug>.jpproject.com.br` | app de cada barbearia |
| `axon-barber.web.app` | URL interna do Firebase Hosting |
| `/landing` | página comercial da plataforma |

O domínio raiz vem de `NEXT_PUBLIC_ROOT_DOMAIN`, com padrão `jpproject.com.br`
em `web/src/lib/tenant.ts`.

### Stack

- **Next.js 16.2.12** (App Router, Turbopack), React, Tailwind
- **Firebase**: Auth, Firestore, Cloud Functions v2 (`southamerica-east1`),
  Hosting, Storage, Secret Manager
- Projeto: `axon-barber`

---

## 2. Arquitetura e multi-tenant

### Resolução do tenant

O subdomínio determina a barbearia, resolvido **no servidor** antes do primeiro
byte de HTML:

```
osiqueira.jpproject.com.br
    │
    ├─ slugFromHost(host) ────────────► "osiqueira"
    ├─ slugs/osiqueira ──────────────► { barbershopId }
    ├─ barbershops/{barbershopId} ───► documento do tenant
    └─ TenantProvider ───────────────► toda a árvore React
```

Resolver no servidor evita o sintoma clássico de white-label mal feito: a tela
abrir com a marca da plataforma e "piscar" para a marca do cliente depois da
hidratação.

**Consequência arquitetural:** ler o `host` torna a rota dinâmica. O app não é
mais estático — é renderizado sob demanda.

`slugFromHost` (`web/src/lib/tenant.ts`) compara contra o domínio raiz
configurado, não por contagem de rótulos: `jpproject.com.br` tem três rótulos e é
o apex, enquanto `osiqueira.jpproject.com.br` tem quatro. Contar quebraria em
todo domínio `.com.br`.

Subdomínios reservados (não são barbearias): `www`, `app`, `admin`, `api`,
`status`, `docs`.

### Isolamento

O isolamento é **estrutural**, não por filtro: tudo vive em subcoleções sob
`/barbershops/{barbershopId}`. Uma regra no nível do pai protege tudo abaixo, e
não existe como "esquecer o `where`" e vazar dado de outra barbearia — que é
exatamente o risco do modelo com coleções na raiz e campo `tenantId`.

Todo acesso passa por `web/src/lib/db/paths.ts`, e toda função exige
`barbershopId`. Não existe uma string `"expenses"` solta no código para alguém
copiar.

### Desenvolvimento local

`NEXT_PUBLIC_DEV_TENANT_SLUG` faz o `localhost` resolver um tenant real sem
editar o `hosts` do sistema. **Atenção:** com ele apontando para um slug de
produção, o localhost lê e escreve no Firestore de produção.

---

## 3. Papéis e permissões

A autoridade vem **exclusivamente do custom claim** do Firebase Auth. Nenhuma
regra e nenhuma função lê papel de documento do Firestore — o que elimina a
falha clássica de escalada por auto-escrita.

### Claims

```jsonc
{
  "barbershops": { "<barbershopId>": "owner" | "staff" },  // vínculo por barbearia
  "platformAdmin": true,                                    // operador do SaaS
  "mustChangePassword": true,                               // senha provisória
  "role": "owner"                                           // DEPRECADO, single-tenant
}
```

| Papel | Alcance | Como é concedido |
|---|---|---|
| **cliente** | sem claim; acessa o que é dele por `clientId` | automático ao criar conta |
| **staff** | uma barbearia | `grantShopRole` |
| **owner** | uma barbearia | `signUpBarbershop` (autocriação) ou `grantShopRole` |
| **platformAdmin** | toda a plataforma | **só à mão no console** — nenhum código grava |

`role: "owner"` é o modelo antigo, sem tenant. Ainda existe como fallback em
`auth-guard.tsx`, `login/page.tsx` e `owner-panel-link.tsx`. O Firestore o
ignora completamente.

### Renovação de token

Toda mudança de claim chama `revokeRefreshTokens`, porque o token em uso
continua com o claim antigo até renovar. O cliente força a renovação com
`getIdTokenResult(true)` em `auth-context.tsx`.

### Gate do painel

`AuthGuard` (`web/src/components/auth-guard.tsx`) protege `/painel`:

1. Sem sessão → `/login`
2. Com sessão e sem `owner` naquele tenant → `/` (app do cliente)
3. `mustChangePassword` → `/trocar-senha`
4. Onboarding incompleto → `/comecar`

**O gate é client-side.** O HTML do painel é servido para qualquer um; o que
protege o dado é o `firestore.rules`. Isso é aceitável enquanto nada dentro de
`/painel` renderizar dado sensível no servidor.

---

## 4. Modelo de dados

### Raiz

| Coleção | Conteúdo | Acesso |
|---|---|---|
| `barbershops/{id}` | tenant: marca, contato, políticas, plano, features, jornada, trial, onboarding | leitura pública (vitrine) |
| `slugs/{slug}` | `{ barbershopId }` — índice do subdomínio | leitura pública |
| `users/{uid}` | conta global do cliente | só o próprio |
| `users/{uid}/memberships/{shopId}` | de quais barbearias é cliente | só o próprio, escrita do servidor |
| `platform_users/{uid}` | hash de senha provisória | **ninguém** — só Admin SDK |
| `whatsapp_numbers/{phoneNumberId}` | número da Cloud API → barbearia | só servidor |
| `whatsapp_conversations/{telefone}` | telefone → última barbearia | só servidor |
| `whatsapp_sent/{messageId}` | id da mensagem → barbearia | só servidor |

### Subcoleções de `barbershops/{id}`

| Coleção | Conteúdo | Quem escreve |
|---|---|---|
| `private/{doc}` | contrato e cobrança — nunca público | platformAdmin |
| `members/{uid}` | vínculo de acesso: papel e e-mail | Cloud Function |
| `staff/{id}` | profissionais: nome, comissão, salário, serviços, jornada | dono (tela Equipe) |
| `services/{id}` | catálogo: nome, duração, preço, ativo | dono (tela Serviços) |
| `plans/{id}` | planos de mensalista | ninguém ainda |
| `products/{id}` | produtos da loja | dono (tela Loja) |
| `bookings/{id}` | reservas | **só Cloud Function** |
| `schedules/{id}` | exceções de jornada | dono |
| `expenses/{id}` | despesas | dono (tela Despesas) |
| `cash_entries/{id}` | lançamentos de caixa | dono |
| `commissions/{id}` | comissões apuradas | só servidor |
| `inventory_movements/{id}` | entrada e saída de estoque | ninguém ainda |
| `payments`, `refunds`, `subscriptions`, `subscription_invoices` | dinheiro | só servidor |
| `loyalty_transactions/{id}` | carimbos e resgates | só servidor |
| `client_occurrences/{id}` | ocorrências do cliente (no-show etc.) | só servidor |
| `whatsapp_messages/{id}` | histórico de envio | só servidor |
| `audit_log/{id}` | trilha de auditoria — imutável | só servidor |

### Documento do tenant

```ts
type Tenant = {
  id: string;
  slug: string;
  status: "ativo" | "suspenso" | "trial";
  plan: "entrada" | "completo";
  brand: { name, shortName, logo, logoHorizontal, accentColor, themeColor,
           panelLabel, clientTagline };
  contact: { address, whatsapp, instagram?, since? };
  locale: { timezone, currency, ... };       // decide QUE DIA é hoje
  policies: { cancellation, reschedule, booking, loyalty,
              commissionSplit, taxRatePct, openWeekdays };
  features: { subscriptions, store, loyalty, whatsapp, advancedFinance };
  schedule: { weekdays, opensAt, closesAt, breaks, slotMinutes };
  trial: { startedAt, endsAt } | null;
  onboarding: { completedSteps, completedAt, sharedLink };
};
```

Campo ausente cai no padrão da plataforma — nunca em `undefined`, que viraria
`NaN` em cálculo de reembolso. `features` ausente é derivado do `plan`, não do
catálogo completo.

### Estados da reserva

```
pending_payment ──┐
confirmed ────────┤
confirmed_by_client ─┼──► ocupam horário na agenda (OCCUPIES_SLOT)
completed ────────┘

no_show, cancelled_by_client, cancelled_by_shop, expired  ──► liberam o horário
fit_in_requested ──► pedido de encaixe, aguardando o dono
```

Duas regras derivadas, em `web/src/lib/domain.ts`:

- **`isRevenue`** = `status === "completed"`. Agendamento confirmado **não** é
  faturamento.
- **`isReceived`** = ocupa horário **e** (`completed` ou pagamento ≠ `local`).
  Pix e cartão contam ao confirmar; dinheiro só quando o cliente é atendido.

---

## 5. Cloud Functions

16 funções, todas em `southamerica-east1`, `maxInstances: 10`.

### Reserva — `functions/src/booking.ts`

#### `createBooking` (callable)

Entrada: `{ barbershopId, serviceIds[], date, time, paymentMethod, staffId?, isFitIn? }`

Validações, em ordem:

1. autenticado
2. `barbershopId` informado
3. ao menos um serviço
4. `date` e `time` em formato válido
5. `paymentMethod` ∈ `pix | cartao | local`
6. barbearia existe
7. barbeiro escolhido (ou o único ativo, quando há um só)
8. barbeiro está ativo e atende aquele serviço
9. serviços existem e estão ativos
10. antecedência mínima (`policies.booking.minAdvanceMinutes`, padrão 60)
11. dia aberto na jornada
12. **transação**: relê as reservas daquele barbeiro naquele dia e recusa se o
    horário foi tomado — *"esse horário acabou de ser reservado"*

Efeitos: cria `bookings/{id}` com `status`, `value`, `durationMin`, `staffId`,
`staffName` calculados **no servidor**. O cliente não envia preço.

Retorna: `{ bookingId, value, status, durationMin, staffId }`

#### `rescheduleBooking` (callable)

Entrada: `{ barbershopId, bookingId, date, time }`. Aplica a política de
antecedência, revalida conflito na mesma transação e atualiza a reserva.

#### `cancelBooking` (callable)

Entrada: `{ barbershopId, bookingId }`. Calcula o reembolso pela política:

| Antecedência | Devolução |
|---|---|
| ≥ `fullRefundHours` (24h) | integral |
| ≥ `partialRefundHours` (6h) | valor − taxa (25%) |
| abaixo disso | nada |
| pagamento `local` | nada (não houve pagamento) |

Grava `refundedAmount` na reserva. **Não cria documento em `refunds`** e não
executa devolução — não há gateway.

#### `availableSlots` (callable)

Entrada: `{ barbershopId, date, staffId?, durationMin? }`. Devolve os horários
livres considerando jornada, intervalos, folgas e reservas que ocupam. É a fonte
de verdade da grade — a tela não calcula disponibilidade sozinha.

### Cadastro — `functions/src/signup.ts`

#### `checkSlugAvailability` (callable, sem auth)

Valida formato e consulta `slugs/{slug}`. Chamada com debounce pela tela de
cadastro.

#### `signUpBarbershop` (callable)

Entrada: `{ slug, name, ownerName?, address?, whatsapp?, accentColor? }`

Exige **e-mail verificado** — sem isso, um script registra os melhores
subdomínios numa tarde. Limita a **uma barbearia por conta**.

Numa transação, cria: documento do tenant (com `plan`, `features`, `trial` de
7 dias), índice `slugs/{slug}`, `members/{uid}` como owner, **o primeiro
`staff`** (a barbearia nunca nasce sem barbeiro), os serviços semente e o
registro de auditoria. Fora da transação — o Auth não participa dela — grava o
claim e revoga o refresh token.

#### `completeOnboardingStep` (callable)

Entrada: `{ barbershopId, step, data? }`

`data` passa por **allowlist nominal** (`ONBOARDING_WRITABLE_FIELDS`): só os 11
campos que as telas do onboarding mandam. Campo fora da lista é **recusado**,
não ignorado — ignorar faria o dono ver "salvo" com o dado no chão.

> A função escreve com Admin SDK, que ignora as regras. Sem a allowlist, o dono
> reescrevia `plan`, `status` e `trial` — exatamente o que a regra protege.

### Provisionamento — `functions/src/provisioning.ts`

- **`provisionBarbershop`** — exige `platformAdmin`. Cria barbearia para um dono
  que já tem conta. É o caminho assistido.
- **`grantShopRole`** — concede ou revoga papel. Exige `platformAdmin` ou `owner`
  daquela barbearia. Idempotente. Um dono não pode revogar o próprio acesso.

### Conta — `functions/src/account.ts`

- **`changeInitialPassword`** — troca a senha provisória e limpa o claim
  `mustChangePassword`.

### Fidelidade — `functions/src/loyalty.ts`

- **`creditLoyaltyOnCompletion`** (trigger `onDocumentUpdated` em `bookings`) —
  credita carimbo quando a reserva vira `completed`. Id determinístico
  (`credito_{bookingId}`) o torna idempotente, e desfazer a conclusão estorna.
- **`redeemLoyaltyReward`** (callable) — resgata em `runTransaction`, lendo o
  saldo e gravando o débito na mesma transação. Duplo clique não resgata duas
  vezes.

### WhatsApp

- **`notifyBookingCreated`** (trigger `onDocumentCreated` em `bookings`) — dispara
  a confirmação.
- **`whatsappWebhook`** (HTTP, público) — recebe da Meta. Valida assinatura
  (`APP_SECRET`), trata confirmação de entrega/leitura, resposta de **botão**
  (confirmar/cancelar) e texto livre — que abre a janela de 24h.

### Plataforma

- **`healthcheck`** — confirma que o deploy subiu e a região está correta.
- **`setOwnerRole`** — **deprecado**, concede `role: owner` global. Mantido só
  para o bootstrap do primeiro operador.

---

## 6. Regras de segurança

`firestore.rules` — princípio: **negar por padrão**, com fallback `if false`
dentro da barbearia e outro global.

### Helpers

```
isSignedIn()          request.auth != null
memberships()         claim `barbershops` ou {}
roleIn(shopId)        papel naquela barbearia, ou null
isOwnerOf(shopId)     roleIn == 'owner'
isStaffOf(shopId)     roleIn in ['owner','staff']
isSelf(userId)        uid == userId
isPlatformAdmin()     claim platformAdmin == true
```

**Nenhuma regra faz `get()` de documento.** A autoridade vem do claim, que é
grátis de ler; um `get()` custaria uma leitura por avaliação.

### Campos de contrato — imutáveis pelo dono

```
slug · plan · status · createdAt · createdBy · features · trial
```

`features` decide o gate de recurso e `trial` decide quando o acesso vence: são
contrato tanto quanto `plan`. Sem eles na lista, um `updateDoc` do navegador
liberava o plano de cima e empurrava o fim do teste para 2099.

### Matriz resumida

| Recurso | Leitura | Escrita |
|---|---|---|
| `barbershops/{id}` | **pública** (vitrine) | dono, menos contrato |
| `private/*` | dono, platformAdmin | platformAdmin |
| `members/*` | staff, o próprio | Cloud Function |
| `staff`, `services`, `plans`, `products` | autenticado | dono |
| `bookings` | staff, ou o cliente dono da reserva | **`create: if false`** — só servidor |
| `expenses`, `cash_entries` | dono | dono |
| `commissions` | dono, ou o barbeiro pelo seu `uid` | servidor |
| `payments`, `refunds`, `subscriptions`, `loyalty_transactions` | staff, ou o cliente dono | **`if false`** |
| `audit_log` | dono, platformAdmin | **`if false`** — imutável |
| `slugs` | **pública** (resolve subdomínio) | platformAdmin |

Comissão é da **pessoa**: o dono lê tudo porque é quem paga; cada barbeiro lê só
o que é dele. Com equipe, ler a comissão do colega é o tipo de coisa que destrói
uma barbearia por dentro.

### Storage

`storage.rules` usa o mesmo claim `barbershops`, com caminhos sob
`barbershops/{barbershopId}/…`. Nenhuma tela faz upload hoje.

### Cobertura de teste

`functions/src/__tests__/firestore-rules.test.ts` prova o isolamento A↔B.
**Exige o emulador** (`npm run test:rules`) e não roda no `vitest` padrão.

---

## 7. App do cliente final

Layout `(cliente)/layout.tsx`: tarja de construção, cabeçalho com a marca,
navegação inferior no celular e lateral no desktop.

### Navegação

`Início` · `Agendar` · `Planos` · `Reservas` · `Perfil`

### `/` — Início

Próximo agendamento, atalho para agendar, barra de carimbos da fidelidade e
ficha da barbearia.

### `/agendar` — Agendamento

Fluxo de **4 passos**, com barra de progresso e botão Voltar:

| Passo | O que faz | Regra |
|---|---|---|
| **1. Serviço** | seleção múltipla; soma duração e valor | precisa de ≥ 1 para avançar |
| **2. Barbeiro e horário** | escolhe profissional e slot | horários vêm de `availableSlots`, do servidor |
| **3. Pagamento** | Pix, cartão ou pagar no local | — |
| **4. Confirmação** | resumo e atalho para as reservas | — |

O botão de confirmar chama `createBooking`. **O preço não é enviado pela tela** —
o servidor calcula a partir dos `serviceIds`.

Encaixe (`isFitIn`): quando o horário está ocupado, o cliente pode pedir
encaixe, que nasce como `fit_in_requested` e aguarda o dono.

### `/reservas` — Minhas reservas

Abas de futuras e histórico, com fidelidade ao lado.

| Ação | Modal | Function |
|---|---|---|
| Reagendar | **"Reagendar"** — seletor de dia e horário | `rescheduleBooking` |
| Cancelar | **"Cancelar reserva"** — mostra o valor a devolver | `cancelBooking` |
| Resgatar recompensa | — | `redeemLoyaltyReward` |

### `/planos` — Mensalista

Lista os planos de `plans` e oferece assinatura.

| Modal | Situação |
|---|---|
| **"Assinar {plano}"** | checkout |
| **"Cancelar plano"** | confirmação |
| **"Plano ativado!"** | sucesso |

> ⚠️ **Não persiste.** Ver [seção 17](#17-o-que-ainda-é-fachada).

### `/perfil` — Perfil

Dados pessoais, preferências de notificação e menus auxiliares em modal.

> ⚠️ **Não persiste.**

### `/login` — Entrar

Três métodos: **telefone com SMS**, **e-mail e senha** (com criação de conta e
recuperação) e **Google**.

O `reCAPTCHA` é criado sob demanda, na hora de enviar o código — construído na
montagem, uma falha dele travava a tela inteira sem erro visível.

Após entrar, o destino é decidido pela conta: `mustChangePassword` →
`/trocar-senha`; parâmetro `?next=` (só caminho interno) → aquele destino; dono →
`/painel`; cliente → `/`.

---

## 8. Painel do dono

Layout `painel/(dashboard)/layout.tsx`: `AuthGuard requireOwner`, tarja de
construção, **aviso de trial**, e **bloqueio de acesso** quando o teste vence ou
a conta é suspensa — decidido no servidor, antes de o painel montar.

### Navegação

`Hoje` · `Financeiro` (Resumo, DRE, Fluxo de Caixa, Despesas, Projeção) ·
`Números` · `Serviços` · `Mensal` 🔒 · `Equipe` · `Loja` 🔒

O cadeado aparece no que o plano não inclui. O item **continua visível**: some do
menu não vende nada, e a tela bloqueada é onde o dono descobre que existe algo a
mais.

No celular, acima de 5 itens o excedente vai para uma folha **"Mais"** — a barra
divide a largura igualmente, e sete itens deixariam ~51px cada.

### `/painel` — Hoje

Agenda do dia em tabela, ordenada por hora.

- **"Precisa de você"** — derivado do estado real: encaixes aguardando resposta,
  nenhum serviço cadastrado (com link para Serviços)
- KPIs: confirmados, horários livres, ocupação, previsão do dia, caixa por meio
  de pagamento
- Ações por reserva: **Concluir** (`status: completed`), **Aprovar encaixe**,
  **Recusar encaixe** — as duas últimas abrem o WhatsApp com a mensagem pronta

### `/painel/servicos` — Serviços

Tabela editável do cardápio, salvando no `blur` de cada campo — um botão único
faria o dono achar que perdeu tudo ao sair sem clicar.

- Campos: nome, duração, preço
- **Ocultar** (👁) — tira do app sem apagar histórico, reversível
- **Excluir** (🗑) — modal **"Excluir serviço"**, que sugere ocultar como
  alternativa
- Avisos derivados: nenhum serviço visível, serviço visível com preço zerado,
  serviço mais longo que o expediente (nunca produz slot)

### `/painel/equipe` — Equipe

- Adicionar, editar e remover profissional
- Campos: nome, **comissão individual** (% do atendimento; em branco usa o padrão
  da barbearia), **salário mensal**, serviços que atende, ativo
- Serviços vazios = atende todos

### `/painel/financeiro` — Resumo

KPIs do mês, comparativo de gateways e atalhos para as subtelas.

### `/painel/financeiro/dre` — DRE Gerencial 🔒

Escada completa, com seletor de mês e drill-down por serviço:

```
Receita bruta (serviços + encaixes + produtos + mensalistas)
 (−) CMV
 (−) Taxa de gateway
 (−) Comissões
 (=) Margem de contribuição
 (−) Despesa fixa · variável · folha
 (=) Resultado antes de impostos
 (−) Impostos (Simples, % sobre o faturamento)
 (=) Resultado do mês
```

Identidade garantida por teste: `grossRevenue − totalCost === result`.

### `/painel/financeiro/fluxo-caixa` — Fluxo de Caixa 🔒

Tabela diária: atendimentos, ticket, Pix, cartão, dinheiro, total.

> ⚠️ Não tem saídas nem saldo acumulado — é um relatório de faturamento diário.

### `/painel/financeiro/despesas` — Despesas

CRUD completo e persistente.

| Modal | Quando |
|---|---|
| **"Nova Despesa"** / **"Editar Despesa"** | criar ou editar |
| **"Excluir lançamento"** | confirmação |

Campos: categoria, descrição, fornecedor, valor, data, forma de pagamento,
**recorrente**, observações. Validação de valor ≤ 0 e descrição vazia.

### `/painel/financeiro/projecao` — Projeção 🔒

Estimativa dos próximos dias a partir de reservas confirmadas, média por dia da
semana, mensalidades a vencer e despesas recorrentes. Cada linha marca
**estimado** ou **confirmado**.

### `/painel/numeros` — Números

Indicadores operacionais: receita, atendimentos, ticket médio, ocupação,
no-show, top serviços, recorrência de clientes e mapa de calor.

Recorrência classifica pelo hábito de cada cliente (`avgIntervalDays × 3`), não
por prazo fixo: quem vem a cada 7 dias e sumiu há 30 é caso diferente de quem vem
a cada 30.

### `/painel/mensal` — Mensalistas 🔒

Lista de assinantes com filtro de status e régua de cobrança D-5 → D+5.

### `/painel/loja` — Loja 🔒

Catálogo de produtos, alerta de estoque baixo e simulador de precificação
(`preço = custo ÷ (1 − margem)`, limitado a 95% — 100% seria divisão por zero).

Modal **"Novo Produto"** com prévia de precificação: custo, preço, lucro bruto,
comissão, imposto e sobra.

---

## 9. Cadastro e onboarding

### `/criar-conta` — Cadastro self-service

Quatro estados: carregando · precisa entrar · precisa verificar e-mail ·
formulário.

O **endereço** é o centro da tela — é irreversível e vira o subdomínio:

- sugerido a partir do nome comercial (`Barbearia do Zé` → `barbearia-do-ze`)
- validado enquanto se digita (espelho de `lib/slug.ts`)
- conferido no servidor com 450ms de folga, com ✓ / ✗ / spinner
- a disponibilidade é **derivada** de uma resposta que carrega o slug que a
  originou, para o "disponível" de um endereço não ficar na tela enquanto a
  consulta do seguinte viaja

Campos: nome da barbearia, endereço do app, seu nome, WhatsApp e endereço
(opcionais).

Ao concluir, redireciona por `window.location.href` para o subdomínio novo — o
claim acabou de ser gravado e o token em uso ainda não o tem.

### `/comecar` — Onboarding, 4 passos

Pressupõe barbearia existente. Cada passo salva ao avançar; fechar e voltar
retoma de onde parou.

| Passo | Grava |
|---|---|
| **Sua barbearia** | `brand.name`, `brand.shortName`, `brand.accentColor`, `contact.*` |
| **Seus serviços** | `services` (mesmo editor da tela do painel) |
| **Seus horários** | `schedule.*` |
| **Compartilhe seu link** | marca conclusão; QR e link para divulgar |

### `/trocar-senha`

Para quem recebeu senha provisória. Chama `changeInitialPassword`.

---

## 10. Planos, trial e paywall

### Planos

| Recurso | entrada | completo |
|---|---|---|
| WhatsApp | ✅ | ✅ |
| Fidelidade | ✅ | ✅ |
| Mensalistas | — | ✅ |
| Loja | — | ✅ |
| Financeiro avançado (DRE, Projeção) | — | ✅ |

WhatsApp entra no plano de entrada **de propósito**: é o que o concorrente cobra
como add-on e o argumento de venda mais direto.

Fonte única: `functions/src/plans.ts`, espelhada em `featuresForPlan` no web.

`features` ausente no documento é derivado do `plan` — nunca do catálogo
completo. `plan` ausente cai em `entrada`: barbearia sem contrato conhecido
recebe o mínimo, não o máximo.

### Trial

7 dias, criado por `signUpBarbershop`.

| Função | Comportamento |
|---|---|
| `trialDaysLeft` | dias restantes; negativo depois de vencer; `null` sem trial |
| `shouldWarnAboutTrial` | verdadeiro a partir de 4 dias do fim |
| `isTrialExpired` | verdadeiro no dia do vencimento |

### Paywall

O painel fecha quando `status === "suspenso"` ou o trial venceu, exibindo
`AcessoExpirado`. Barbearia sem `trial` nunca vence — é cliente pagante ou o
tenant piloto.

Três decisões:

- **Bloqueio total, não modo leitura.** Read-only exigiria desabilitar botão por
  botão em dez telas, sem garantia de que nenhum escapasse.
- **O app do cliente segue no ar.** Quem marcou corte na sexta não tem culpa da
  mensalidade do dono.
- **É bloqueio de interface.** Negar por `status` no Firestore exigiria `get()`
  dentro da regra, que o arquivo evita por decisão explícita.

### Contato comercial

`NEXT_PUBLIC_PLATFORM_WHATSAPP` — o WhatsApp de quem vende o SaaS, separado do
número da barbearia. Sem ele configurado, o botão **não é renderizado**.

---

## 11. Motor de agenda

`web/src/lib/slots.ts` no cliente e `functions/src/availability.ts` no servidor.
**A disponibilidade real vem do servidor.**

Um horário é oferecido quando:

1. o dia está na jornada (`schedule.weekdays`)
2. está entre `opensAt` e `closesAt`
3. não cai em intervalo (`breaks`) — verificando **contiguidade**, não apenas
   vizinhança na lista
4. a duração total dos serviços cabe até o fechamento
5. respeita a antecedência mínima (60 min)
6. está livre para **aquele barbeiro** — o conflito é por profissional

Capacidade da barbearia = slots por dia × profissionais ativos. Sem isso, quem
tem 3 barbeiros lê "100% de ocupação" com um terço da agenda vazia.

---

## 12. Financeiro: fórmulas

Tudo em `web/src/lib/analytics.ts`, funções puras — recebem documentos, devolvem
números, sem tocar no Firestore. É o que as torna testáveis sem emulador.

### Receita

```
servicos    = reservas completed, sem encaixe
encaixes    = reservas completed com isFitIn
produtos    = inventory_movements kind=venda no período
mensalistas = assinantes ativos, SÓ se o período contém a data de referência
caixa       = servicos + encaixes + produtos
bruta       = caixa + mensalistas
```

> `SubscriberDoc` guarda o estado de hoje, não a série histórica. Somar o MRR
> atual em todo mês passado inventaria receita.

### Comissão

Calculada **por reserva**, pelo percentual de quem atendeu:

```
comissão de serviço = Σ (valor da reserva × pct(staffId)) / 100
    pct(staffId) = staff.commissionPct ?? policies.commissionSplit.barberPct

comissão de produto = max(produtos − CMV, 0) × barberPct / 100
```

Sem equipe informada, cai no percentual único aplicado ao total — correto na
operação solo.

### Imposto

```
tax = receita.bruta × policies.taxRatePct / 100
```

Simples Nacional (Anexo III) incide sobre **receita bruta** e é devido mesmo no
mês de prejuízo.

### Despesa recorrente

`despesasRecorrentesVigentes(expenses, ateData)` — o compromisso vale **a partir
do lançamento e segue valendo**. Relançamentos da mesma conta
(`categoria|descrição`) contam uma vez, valendo o mais recente: reajuste
substitui, não soma.

### Folha

```
payroll = Σ salary dos profissionais com active !== false
```

### Ponto de equilíbrio

`ceil(custoTotal ÷ (receita ÷ diasNoMes))` — é uma **aproximação** que assume
receita linear.

### Mês de referência

`mesAtual(offset, hoje)` fixa o dia 1 **antes** de mover o mês: `setMonth`
preserva o dia, e em 31/03 voltar um mês pediria "31 de fevereiro", que
transborda para março.

---

## 13. Fidelidade

O único loop de valor completo do produto.

```
reserva vira completed
   └─► trigger creditLoyaltyOnCompletion
         └─► loyalty_transactions/credito_{bookingId}  (+1 carimbo)

cliente pede resgate
   └─► redeemLoyaltyReward (runTransaction)
         └─► loyalty_transactions/{id}  (−N carimbos)
```

O saldo é a **soma das transações**, nunca uma contagem de atendimentos — a
contagem volta a subir sozinha depois de um resgate.

O id determinístico torna o crédito idempotente, e desfazer a conclusão estorna
o carimbo.

Política em `policies.loyalty`: `stampsForReward` (10) e `reward`
("1 corte grátis").

---

## 14. WhatsApp

### Catálogo

**34 templates** em `functions/src/whatsapp/templates.ts`, validados contra as
regras da Meta (`validate.ts`).

Por remetente: **barbearia** (confirmação, lembrete, cancelamento, encaixe,
pós-atendimento, aniversário, reativação…) e **plataforma** (`trial_terminando`,
`trial_encerrado`, `cobranca_falhou`).

Principais: `confirmacao_reserva`, `lembrete_confirmacao`,
`cancelamento_reserva`, `encaixe_alternativas`, `resumo_do_dia`,
`mensalidade_aviso`, `reagendamento_confirmado`, `reembolso_processado`,
`fidelidade_recompensa_liberada`, `plano_ativado`, `nova_reserva`.

### Envio

`whatsapp/client.ts` fala com a Cloud API. `notifyBookingCreated` dispara na
criação da reserva. `WHATSAPP_TOKEN` está no Secret Manager e **configurado em
produção**.

### Recebimento

`whatsappWebhook` (HTTP público):

1. valida a assinatura com `APP_SECRET`
2. confirmações de entrega e leitura
3. resposta de **botão** — confirmar ou cancelar a reserva
4. texto livre — abre a janela de 24h; guardar é o que permite responder depois

Como o número é **único para toda a plataforma**, três índices fazem o mapa de
volta: `whatsapp_numbers`, `whatsapp_sent` e `whatsapp_conversations`. Todos
fechados para o cliente — o segundo é uma lista de quem é cliente de quem.

### Pendências fora do código

Verificação comercial da empresa na Meta, cadastro como Tech Provider e
submissão dos 34 templates. Sem a verificação: 250 destinatários únicos por 24h.

---

## 15. Componentes de interface

| Componente | Papel |
|---|---|
| `ui/button` | ações; variantes padrão e `ghost` |
| `ui/card` | superfície elevada |
| `ui/modal` | diálogo com título, corpo e rodapé de ações |
| `ui/pill` | etiqueta de status: `gold`, `success`, `danger`, `neutral` |
| `ui/kpi-tile` | indicador com rótulo, valor e variação |
| `ui/chart` | gráficos do financeiro |
| `ui/segmented` | alternador de período |
| `ui/empty-state` | vazio que ensina, com ação |
| `ui/voltar` | retorno das subtelas |
| `ui/barber-pole-divider` | divisor temático |
| `auth-guard` | porta das áreas logadas |
| `acesso` | aviso de trial e bloqueio por vencimento |
| `recurso-bloqueado` | tela de recurso fora do plano |
| `demo-banner` | tarja do que ainda não persiste |
| `servicos-editor` | tabela do cardápio, compartilhada painel/onboarding |
| `bottom-nav` | navegação do celular, com agrupamento "Mais" |
| `painel-sidebar-nav` | navegação do desktop, com cadeado por plano |

---

## 16. Estados, erros e vazios

### Estados de carregamento

`useShopCollection` expõe `carregando | pronto | erro`, e `combineStatus` junta
vários. O padrão nas telas: esqueleto (`LoadingRows`) enquanto carrega, conteúdo
quando pronto, `EmptyState` quando vazio.

**Distinguir vazio de erro é regra:** falha de rede não pode aparecer como
"você não tem reserva nenhuma".

### Mensagens de erro

As telas traduzem os códigos das functions em texto acionável. Exemplos:

| Situação | O que o usuário lê |
|---|---|
| `failed-precondition` no convite de equipe | "Não existe conta com esse e-mail. Peça para a pessoa entrar no app uma vez." |
| dono removendo a si mesmo | "Você não pode remover o próprio acesso — outra conta de dono precisa fazer isso." |
| slug tomado durante o cadastro | "Alguém registrou esse endereço agora há pouco. Escolha outro." |
| conflito de horário | "Esse horário acabou de ser reservado." |

### Estados vazios

`EmptyState` ensina em vez de mostrar tabela em branco: um tenant novo abre toda
tela financeira sem nada, e "R$ 0,00" em toda célula não diz o que fazer.

---

## 17. O que ainda é fachada

Registro honesto do que aparenta funcionar e não funciona.

| Item | Estado | Onde |
|---|---|---|
| **Assinatura de mensalista** | `useState` em memória; some ao recarregar. O painel lê `subscriptions`, que ninguém escreve — as duas pontas não se falam | `subscription-context.tsx` |
| **Edição de perfil** | `setSaved(true)` e nada mais. A barbearia nunca fica com o WhatsApp do cliente | `(cliente)/perfil/page.tsx` |
| **Venda de produto** | ninguém escreve `inventory_movements`: estoque não baixa, CMV é zero, comissão de revenda é zero | — |
| **Estorno** | `cancelBooking` calcula e grava `refundedAmount`, mas nada cria documento em `refunds` nem devolve dinheiro | `booking.ts` |
| **Régua de cobrança D-5→D+5** | filtra por `dueStage`, campo que nada calcula | `mensal/page.tsx` |
| **Seletor de gateway** | tabela de taxas de referência, não afeta cálculo nenhum | `financeiro/page.tsx` |
| **Fluxo de caixa** | sem saídas, sem saldo acumulado, sem seletor de mês | `fluxo-caixa/page.tsx` |
| **Taxa de maquininha** | `gatewayFeesTotal` é sempre 0; não há onde cadastrar | `analytics.ts` |
| **Cobrança do SaaS** | nenhum gateway integrado — zero dependências | — |
| **QR do onboarding** | padrão determinístico até a lib entrar | `passo-compartilhar.tsx` |

A tarja `DemoBanner` nomeia os dois primeiros ao usuário, e o padrão é **avisar**:
desligar exige `NEXT_PUBLIC_DEMO_MODE=false` explícito.

---

## 18. Ambientes e deploy

### Variáveis (`web/.env.local`)

| Variável | Papel |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | configuração do SDK (pública por design) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | domínio raiz da plataforma |
| `NEXT_PUBLIC_DEV_TENANT_SLUG` | dev: resolve um tenant real no localhost |
| `NEXT_PUBLIC_DEMO_MODE` | `false` esconde a tarja; ausente = mostra |
| `NEXT_PUBLIC_PLATFORM_WHATSAPP` | comercial da plataforma; vazio esconde o botão |
| `NEXT_PUBLIC_USE_EMULATOR` | aponta o SDK para o emulador |

`NEXT_PUBLIC_*` é **inlined em tempo de build** — mudar exige rebuild e novo
deploy, não basta reiniciar.

Segredos do servidor (Secret Manager): `WHATSAPP_TOKEN`, `VERIFY_TOKEN`,
`APP_SECRET`.

### Comandos

```bash
# Verificação
cd web && npx tsc --noEmit && npx vitest run && npx eslint src
cd functions && npx tsc --noEmit && npm test

# Regras (exige emulador)
cd functions && npm run test:rules

# Deploy — pela esteira, não pela máquina local.
# GitHub → Actions → "Deploy (produção)" → Run workflow
```

O deploy manual pela máquina local continua funcionando, mas deixou de ser o
caminho: ele publica o que está no disco de alguém, e não o commit que passou
pela esteira. Ver `.github/workflows/deploy.yml`.

### Armadilhas conhecidas

- **Deploy de Hosting no Windows** falha com `EPERM: symlink` sem o Modo de
  Desenvolvedor ativado ou terminal como administrador. É o motivo de o deploy
  ter migrado para o CI — o runner é Linux e o problema não existe lá.
- **`npm install` em `functions/`** nesta máquina remove `@emnapi/core` e
  `@emnapi/runtime` do lockfile — dependências opcionais que o build remoto
  (Node 22/Linux) precisa. Conferir o lock antes de commitar.
- **A integração Firebase↔Next** é homologada até Next 16.0; o projeto usa
  16.2.12.
- **Deploy de functions com órfãs**: há uma função (`revisarAssinaturas`) em
  produção sem código-fonte no repositório. Um `deploy --only functions` tenta
  removê-la e aborta; deployar por nome contorna. O workflow de deploy monta a
  lista a partir dos exports compilados e avisa quando encontra uma órfã.

### Dívidas de DX registradas

| Item | Impacto | Prioridade |
|---|---|---|
| `npm run test:rules` não roda no Windows — o Git Bash não preserva as aspas simples do script e o `emulators:exec` recebe "Too many arguments". Roda no CI (bash de verdade) e roda localmente trocando por aspas duplas. | Dev no Windows não consegue rodar os 66 testes de isolamento pelo atalho. A rede de segurança existe no CI. | Baixa |
