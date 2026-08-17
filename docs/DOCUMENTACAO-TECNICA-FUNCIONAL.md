# Documentação técnica funcional — CorteHub

Levantada a partir do código em **17/08/2026**, no commit `659091a` da `main`.

Descreve **o que existe**, não o que foi planejado. Onde uma tela aparenta
funcionar e não funciona, isso está na seção
[O que é fachada](#25-o-que-é-fachada-e-o-que-está-quebrado) — e a distinção é o
ponto do documento: descrever intenção como se fosse implementação já fez uma
auditoria inteira analisar código que não correspondia à produção.

Os defeitos abertos, com arquivo e linha, estão em
[`AUDITORIA-2026-08-17.md`](./AUDITORIA-2026-08-17.md). Aqui eles aparecem
referenciados pelo código (P0-1, P1-3…), sem repetir a análise.

---

## Índice

**Fundação**
1. [O que é a plataforma](#1-o-que-é-a-plataforma)
2. [Stack, endereços e projeto](#2-stack-endereços-e-projeto)
3. [Arquitetura e multi-tenant](#3-arquitetura-e-multi-tenant)
4. [Autenticação, papéis e permissões](#4-autenticação-papéis-e-permissões)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Regras de segurança](#6-regras-de-segurança)

**Backend**
7. [Cloud Functions — as 21](#7-cloud-functions--as-21)
8. [Motor de agenda](#8-motor-de-agenda)
9. [Motor financeiro](#9-motor-financeiro)
10. [Action Center](#10-action-center)
11. [Planos, trial e acesso](#11-planos-trial-e-acesso)

**Produto**
12. [App do cliente final](#12-app-do-cliente-final)
13. [Painel do dono](#13-painel-do-dono)
14. [Cadastro e onboarding](#14-cadastro-e-onboarding)
15. [Fidelidade](#15-fidelidade)
16. [WhatsApp](#16-whatsapp)
17. [LGPD, encerramento e expurgo](#17-lgpd-encerramento-e-expurgo)

**Implementação**
18. [Camada de dados no front](#18-camada-de-dados-no-front)
19. [Design system e componentes](#19-design-system-e-componentes)
20. [Estados, erros e vazios](#20-estados-erros-e-vazios)
21. [PWA e service worker](#21-pwa-e-service-worker)
22. [Segurança de aplicação](#22-segurança-de-aplicação)
23. [Ambientes, variáveis e segredos](#23-ambientes-variáveis-e-segredos)
24. [Deploy e testes](#24-deploy-e-testes)
25. [O que é fachada, e o que está quebrado](#25-o-que-é-fachada-e-o-que-está-quebrado)

---

## 1. O que é a plataforma

**CorteHub** é um SaaS de gestão para barbearias, com **dois produtos numa base
de código só**:

- **App do cliente final** — quem corta cabelo agenda, remarca, cancela e
  acompanha a fidelidade.
- **Painel do dono** — agenda do dia, equipe, catálogo, financeiro completo
  (DRE, fluxo de caixa, projeção, despesas), loja e mensalistas.

Cada barbearia é um **tenant isolado**, servido num subdomínio próprio, com marca,
políticas e jornada próprias.

O produto nasceu resolvendo a dor de **uma** barbearia — *O Siqueira*, que hoje é
o tenant **piloto**, não o dono do produto. Boa parte da documentação antiga
confunde os dois. O produto não se chama, e nunca se chamou, "AXON Barber" — esse
é o id do projeto Firebase, herdado.

### Modelo de negócio

Três planos mensais, cobrados da barbearia (não do cliente final). A contratação
hoje é **humana, por WhatsApp** — não existe checkout. Detalhe da matriz em
[§11](#11-planos-trial-e-acesso) e em `COBRANCA-E-ENTRADA.md`.

---

## 2. Stack, endereços e projeto

| Camada | Escolha |
|---|---|
| Front | **Next.js 16.2.12** (App Router, Turbopack), React 19.2.4, Tailwind 4 |
| Banco | **Firestore**, multi-tenant por subcoleção |
| Backend | **Cloud Functions v2**, região `southamerica-east1`, `maxInstances: 10`, Node 22 |
| Auth | **Firebase Auth** — e-mail/senha, Google, (SMS não habilitado) |
| Hospedagem | **Firebase Hosting** framework-aware (SSR em Cloud Run) |
| Segredos | **Secret Manager** |
| Testes | **Vitest** nos dois pacotes + testes de regras com emulador |
| Publicação | **GitHub Actions**, com aprovação humana |

**Projeto Firebase:** `axon-barber` (nome herdado; não é o nome do produto).

### Endereços

| URL | O que é |
|---|---|
| `osiqueira.jpproject.com.br` | app da barbearia piloto, em produção |
| `<slug>.jpproject.com.br` | app de cada barbearia |
| `jpproject.com.br` | domínio raiz → redireciona para `/landing` |
| `axon-barber.web.app` | URL interna do Hosting |

O domínio raiz vem de `NEXT_PUBLIC_ROOT_DOMAIN` (padrão `jpproject.com.br`, em
`lib/tenant.ts:448`). **O domínio próprio do CorteHub ainda não foi comprado.**

### Estrutura do repositório

```
barber/
├── web/                    Next.js — os dois produtos
│   └── src/
│       ├── app/            rotas (App Router)
│       ├── components/     interface
│       ├── lib/            regra de negócio, dados, tenant
│       └── assets/         fontes e fotos auto-hospedadas
├── functions/              Cloud Functions
│   └── src/
│       ├── whatsapp/       catálogo, cliente, webhook
│       └── __tests__/      inclui os testes de regras
├── firestore.rules         isolamento entre barbearias
├── storage.rules           idem, para arquivos (não publicado — ver §24)
├── firestore.indexes.json
├── firebase.json
└── docs/
```

---

## 3. Arquitetura e multi-tenant

### Resolução do tenant

O subdomínio determina a barbearia, resolvido **no servidor**, antes do primeiro
byte de HTML:

```
osiqueira.jpproject.com.br
    │
    ├─ slugFromHost(host) ──────────► "osiqueira"
    ├─ GET /slugs/osiqueira ────────► { barbershopId }
    ├─ GET /barbershops/{id} ───────► documento do tenant
    ├─ toTenant(id, data) ──────────► normalização (tenant-shape.ts)
    └─ TenantProvider ──────────────► toda a árvore React
```

Resolver no servidor evita o sintoma clássico de white-label mal feito: a tela
abrir com a marca da plataforma e "piscar" para a do cliente após a hidratação.

**Três decisões não óbvias em `lib/tenant-server.ts`:**

1. **Leitura pela REST do Firestore, com `fetch` — sem SDK.** `firebase-admin` é
   externalizado pelo Turbopack com um nome hasheado que não resolve em execução
   (500 em toda rota); o SDK cliente falha em silêncio no Node, e o sintoma não
   parece de tenant — a resolução cai no padrão, o app consulta uma barbearia
   inexistente e o dono é expulso do próprio painel, sem erro em log.
2. **`x-forwarded-host` antes de `host`.** O Hosting reescreve o `Host` para o
   domínio interno `*.run.app`; lendo só `host`, o subdomínio some. Não aparece
   em desenvolvimento, onde não há proxy.
3. **`cache()` do React** deduplica a leitura dentro da mesma requisição — o
   layout raiz, o `generateMetadata` e o manifest chamam `getTenant()` cada um por
   sua conta.

**Consequência arquitetural:** ler o `host` torna a rota dinâmica. O app deixou de
ser estático. A mitigação é cache de borda: `slugs/{slug}` por 1h,
`barbershops/{id}` por 300s.

**No painel, o cache é contornado.** `TenantLive` (`lib/tenant-live.tsx`) assina o
documento com `onSnapshot` e substitui o valor do servidor: é o único lugar onde
alguém **edita** a ficha, e ver o valor antigo depois de salvar é a interface
mentindo sobre o que foi gravado. A vitrine pública segue cacheada.

### `slugFromHost`

Compara contra o domínio raiz configurado, **não por contagem de rótulos** —
`jpproject.com.br` tem três e é o apex, enquanto `osiqueira.jpproject.com.br` tem
quatro. Contar quebra em todo domínio `.com.br`.

Devolve `null` (→ tenant padrão da plataforma) em: `localhost`, `*.localhost`, IP
literal, `*.web.app`, `*.firebaseapp.com`, no apex, em host de mais de um nível
(`a.b.dominio`) e nos slugs reservados `www`, `app`, `admin`, `api`, `status`,
`docs`.

### Isolamento

**Estrutural, não por filtro.** Tudo vive sob `/barbershops/{barbershopId}`. Uma
regra no nível do pai protege tudo abaixo, e não existe como "esquecer o `where`"
e vazar dado de outra barbearia — que é o risco do modelo com coleções na raiz e
campo `tenantId`.

Todo acesso passa por `lib/db/paths.ts`, e toda função exige `barbershopId`. Não
existe uma string `"expenses"` solta no código para alguém copiar. `assertId`
recusa id vazio ou com `/`, porque caminho com número ímpar de segmentos o
Firestore aceita como coleção e o erro aparece longe, como "documento não
encontrado".

---

## 4. Autenticação, papéis e permissões

A autoridade vem **exclusivamente do custom claim** do Firebase Auth. Nenhuma
regra e nenhuma function lê papel de documento do Firestore — o que elimina a
escalada por auto-escrita.

### Claims

```jsonc
{
  "barbershops": { "<barbershopId>": "owner" | "staff" },  // vínculo por barbearia
  "platformAdmin": true,                                    // operador do SaaS
  "mustChangePassword": true,                               // senha provisória
  "role": "owner"                                           // DEPRECADO (single-tenant)
}
```

| Papel | Alcance | Como é concedido |
|---|---|---|
| **cliente** | sem claim; alcança o que é dele por `clientId` | automático ao criar conta |
| **staff** | uma barbearia | `grantShopRole` |
| **owner** | uma barbearia | `signUpBarbershop` (autocriação) ou `grantShopRole` |
| **platformAdmin** | toda a plataforma | **só à mão no console** — nenhum código grava |

`role: "owner"` é o modelo antigo. Sobrevive como fallback em `auth-guard.tsx:26`,
`login/page.tsx:108` e `owner-panel-link.tsx`, para tokens não renovados. O
Firestore o ignora por completo.

### Renovação de token

Toda mudança de claim chama `revokeRefreshTokens` — o token em uso continua com o
claim antigo até renovar. `AuthProvider` (`lib/auth-context.tsx`) lê
`getIdTokenResult()` a cada mudança de sessão e entrega usuário e claims **num
único `setState`**: dois estados separados criariam um instante com "logado, mas
sem permissão ainda", e quem lesse o papel nesse instante decidiria errado.

### Portas de entrada

`AuthGuard` (`components/auth-guard.tsx`), em ordem:

1. `mustChangePassword` → `/trocar-senha`
2. dono com onboarding incompleto → `/comecar`
3. autorizado → renderiza
4. com sessão, sem `owner` (quando `requireOwner`) → `/` (app do cliente)
5. sem sessão → `/login`

**O gate é client-side.** O HTML do painel é servido para qualquer um; o que
protege o dado são as regras do Firestore. É aceitável enquanto nada dentro de
`/painel` renderizar dado sensível no servidor — hoje não renderiza.

> ⚠️ `AuthGuard` envolve **todo** o app do cliente, inclusive a vitrine e
> `/agendar` (`(cliente)/layout.tsx:24`). Quem recebe o link da barbearia precisa
> criar conta antes de ver qualquer coisa. Ver P2-1.

---

## 5. Modelo de dados

### Coleções da raiz

| Coleção | Conteúdo | Acesso |
|---|---|---|
| `barbershops/{id}` | o tenant | **leitura pública** (vitrine) |
| `slugs/{slug}` | `{ barbershopId }` — índice do subdomínio | **leitura pública** |
| `users/{uid}` | conta global do cliente | só o próprio |
| `users/{uid}/memberships/{shopId}` | de quais barbearias é cliente | leitura do próprio; escrita só do servidor |
| `platform_users/{uid}` | hash da senha provisória | **ninguém** — só Admin SDK |
| `whatsapp_numbers/{phoneNumberId}` | número da Cloud API → barbearia | só servidor |
| `whatsapp_sent/{messageId}` | id da mensagem → barbearia | só servidor |
| `whatsapp_conversations/{telefone}` | telefone → última barbearia | só servidor |

Os três últimos são o **mapa de volta** do webhook, necessários porque o número
do WhatsApp é único para toda a plataforma. Expostos, o segundo e o terceiro são
uma lista de quem é cliente de qual barbearia.

### Subcoleções de `barbershops/{id}`

| Coleção | Conteúdo | Quem escreve hoje |
|---|---|---|
| `private/{doc}` | contrato, cobrança, config de WhatsApp | platformAdmin / servidor |
| `members/{uid}` | vínculo de acesso: papel e e-mail | Cloud Function |
| `staff/{id}` | profissionais | dono (tela Equipe) |
| `services/{id}` | catálogo | dono (tela Serviços) |
| `plans/{id}` | planos de mensalista **da barbearia** | **ninguém** — não há tela |
| `products/{id}` | produtos da loja | dono (tela Loja) |
| `bookings/{id}` | reservas | **só Cloud Function** (`create: if false`) |
| `schedules/{id}` | exceções de jornada | dono — **sem tela** |
| `expenses/{id}` | despesas | dono (tela Despesas) |
| `cash_entries/{id}` | lançamentos de caixa | **ninguém** |
| `commissions/{id}` | comissão apurada e congelada | só servidor |
| `payments/{id}` | pagamento apurado e congelado | só servidor |
| `refunds/{id}` | estornos | **ninguém** |
| `subscriptions/{id}` | mensalistas | **ninguém** — ver P0-1 |
| `subscription_invoices/{id}` | faturas de mensalidade | **ninguém** |
| `inventory_movements/{id}` | compra e venda de produto | **ninguém** — ver P1-8 |
| `loyalty_transactions/{id}` | carimbos e resgates | só servidor |
| `client_occurrences/{id}` | ocorrências do cliente | **ninguém** |
| `whatsapp_messages/{id}` | histórico de envio e recebimento | só servidor |
| `audit_log/{id}` | trilha imutável | só servidor |

### O documento do tenant

```ts
type Tenant = {
  id: string;
  slug: string;                                  // subdomínio
  status: "ativo" | "suspenso" | "trial" | "encerrada";
  plan: "agenda" | "crescimento" | "gestao";     // normalizado na leitura
  brand: {
    name; shortName;                             // shortName corta por PALAVRA
    logo; logoHorizontal;
    accentColor;                                 // vira --color-gold em runtime
    themeColor; panelLabel; clientTagline;
  };
  contact: { address; whatsapp; instagram?; since? };
  locale: { timeZone; currency; locale };        // decide QUE DIA é hoje
  policies: {
    cancellation: { fullRefundHours; partialRefundHours; cancellationFeePct };
    reschedule:   { minHoursBefore; maxPerBooking };
    booking:      { minAdvanceMinutes; maxAdvanceDays; visibleDays;
                    slotMinutes; fitInExpirationMinutes; lateToleranceMinutes };
    loyalty:      { stampsForReward; reward };
    commissionSplit: { barberPct; shopPct };
    taxRatePct;                                  // Simples sobre receita bruta
    openWeekdays: number[];
    paymentFees:  { dinheiro; pix; debito; credito };   // % da maquininha
  };
  features: { subscriptions; store; loyalty; whatsapp; advancedFinance };
  schedule: { weekdays; opensAt; closesAt; breaks[]; slotMinutes };
  trial: { startedAt; endsAt } | null;
  onboarding: { completedSteps[]; completedAt; sharedLink };
};
```

**Normalização única** (`lib/tenant-shape.ts`), usada pelo servidor e pelo painel:

- campo ausente cai no padrão da plataforma, **nunca em `undefined`** — que
  viraria `NaN` em cálculo de reembolso;
- `policies.booking` e `policies.paymentFees` têm merge **próprio**, porque o
  spread é raso e Configurações grava por caminho pontilhado. Não é hipótese: a
  primeira gravação real em produção deixou `policies.booking` com um único campo,
  e sem esse merge a agenda aceitaria horário já passado;
- `plan` desconhecido, ausente ou de uma linha antiga (`entrada`/`completo`) cai
  em **`agenda`** — o mínimo, nunca o máximo;
- `features` ausente é derivado do plano, e o campo explícito sobrepõe.

### Estados da reserva

```
                    ┌─ ocupam o horário na agenda (OCCUPIES_SLOT) ─┐
pending_payment ────┤                                              │
confirmed ──────────┤                                              │
confirmed_by_client ┤                                              │
completed ──────────┤   ← único que é receita (isRevenue/isReceived)│
no_show ────────────┘                                              │
                                                                   │
cancelled_by_client · cancelled_by_shop · expired ── liberam o horário
fit_in_requested ─────────────────────────────────── pedido de encaixe
```

Duas regras derivadas (`lib/domain.ts`), e as duas mudaram em agosto:

- **`isRevenue`** = `status === "completed"`. Agendamento confirmado **não** é
  faturamento.
- **`isReceived`** = `status === "completed"`, **para todos os métodos**. Antes,
  Pix e cartão contavam ao confirmar e dinheiro só na conclusão — isso misturava
  regime de caixa com competência dentro do mesmo número.

`no_show` **ocupa** o horário de propósito: ele foi reservado, ninguém mais pôde
usá-lo, e é exatamente esse o custo que a falta representa.

---

## 6. Regras de segurança

### Firestore

Princípio declarado no topo do arquivo: **negar por padrão**. Há fallback
`if false` dentro da barbearia **e** outro global — coleção nova nasce
inacessível em vez de herdar permissão por descuido.

```
isSignedIn()        request.auth != null
memberships()       claim `barbershops`, ou {}
roleIn(shopId)      papel naquela barbearia, ou null
isOwnerOf(shopId)   roleIn == 'owner'
isStaffOf(shopId)   roleIn in ['owner','staff']
isSelf(userId)      uid == userId
isPlatformAdmin()   claim platformAdmin == true
```

**Nenhuma regra faz `get()`.** A autoridade vem do claim, que é grátis de ler; um
`get()` custaria uma leitura por avaliação. É também o motivo de `status` e
`trial` **não** serem consultados pelas regras — o gate de plano é de interface
(ver P0-5).

#### Campos de contrato, imutáveis pelo dono

```
slug · plan · status · createdAt · createdBy · features · trial
```

`features` é lido como gate de recurso e `trial` decide quando o acesso vence:
são contrato tanto quanto `plan`. Sem eles na lista, um `updateDoc` direto do
navegador liberava o plano de cima e empurrava o fim do teste para 2099.

#### Matriz

| Recurso | Leitura | Escrita |
|---|---|---|
| `barbershops/{id}` | **pública** (vitrine) | dono, menos os campos de contrato |
| `private/*` | dono, platformAdmin | platformAdmin |
| `members/*` | staff, o próprio | **`if false`** — só Cloud Function |
| `services`, `staff`, `plans`, `products` | autenticado | dono |
| `schedules` | autenticado | dono |
| `bookings` | staff, ou o cliente dono da reserva | **`create: if false`**; update/delete: staff |
| `expenses`, `cash_entries` | dono | dono |
| `commissions` | dono, **ou o barbeiro pelo próprio `uid`** | **`if false`** |
| `inventory_movements` | staff | staff |
| `payments`, `refunds`, `subscriptions`, `subscription_invoices`, `loyalty_transactions` | staff, ou o cliente dono | **`if false`** |
| `client_occurrences`, `whatsapp_messages` | staff / dono | **`if false`** |
| `audit_log` | dono, platformAdmin | **`if false`** — imutável, inclusive para o dono |
| `slugs/{slug}` | **pública** | platformAdmin |
| `users/{uid}` | o próprio, platformAdmin | o próprio, sem tocar em `barbershops`/`platformAdmin` |
| `platform_users/*`, `whatsapp_*` (raiz) | **ninguém** | **ninguém** |

Três detalhes que valem registro:

- **Comissão é da pessoa.** A regra anterior era `isStaffOf`, ou seja: qualquer
  barbeiro lia a comissão dos colegas. Com uma cadeira só isso nunca apareceu;
  com equipe, é vazamento de salário entre colegas.
- **`create` em `users` tem a mesma guarda do `update`.** Sem isso, dava para
  apagar o próprio documento e recriá-lo já com `platformAdmin: true`. Não era
  explorável hoje (nada lê autoridade do documento), mas a escalada ficaria
  pronta para o dia em que alguém escrevesse um painel de suporte.
- **`bookings.create: if false`.** A regra antiga permitia o cliente gravar
  direto sem mexer em status e valor — e por ela passavam reserva sem `status`
  (que não bloqueia horário e mesmo assim aparece na agenda) e criação em massa.

### Storage

Mesmo princípio e mesmo claim, com tudo sob `barbershops/{id}/`. Dois pontos que
o arquivo documenta e que são contraintuitivos:

- **Regra de segurança não é first-match.** Toda regra que casa é avaliada, e
  basta uma permitir. Declarar o bloco de `reports/` antes do genérico não protege
  nada — quem exclui `reports` é a lista `tipo in ['brand','photos','products']`,
  não a ordem.
- **Ler propriedade inexistente no token levanta exceção** nas regras do Storage,
  em vez de devolver nulo. Daí o `'platformAdmin' in request.auth.token` antes de
  comparar: regra que quebra não é regra que protege.

Permissões: `brand/`, `photos/`, `products/` são leitura pública (a logo aparece
na tela de login, antes de existir usuário) e escrita do dono, com limite de 5 MB
e `content-type` de imagem; `reports/` é leitura do dono e escrita de ninguém;
`users/{uid}/avatar/` é só do próprio.

> ⚠️ **As regras do Storage nunca foram publicadas** — ver §24. Hoje é inofensivo
> porque nenhuma tela usa Storage.

### Cobertura de teste

`functions/src/__tests__/firestore-rules.test.ts` (20 KB) e `storage-rules.test.ts`
provam o isolamento A↔B. **Exigem emulador** (`npm run test:rules`) e ficam fora
do `vitest` padrão.

---

## 7. Cloud Functions — as 21

Todas em `southamerica-east1`, `maxInstances: 10`, Node 22. A contagem é
verificável com `grep -rn "^export const \w* = on" functions/src`.

> Divergir de região quebra a chamada em silêncio: o cliente resolve o endpoint
> por região em `getAppFunctions()`.

### 7.1 Reserva — `booking.ts`

#### `createBooking` (callable)

```
{ barbershopId, serviceIds[], date, time, staffId?, paymentOrigin?, isFitIn?,
  clientName?, clientWhatsapp? }
```

Existe no servidor por três motivos, e nenhum é conveniência: **preço** (se o
cliente mandasse o valor, mandaria zero), **conflito de horário** (dois toques
simultâneos precisam de transação) e **status** (as regras proíbem o cliente de
gravá-lo).

Validações, em ordem:

1. autenticado
2. `barbershopId` presente; ao menos um serviço; `date` e `time` no formato
3. `paymentOrigin` só aceita `in_person` — pagamento antecipado é recusado
   explicitamente enquanto não houver gateway
4. barbearia existe
5. há barbeiro ativo; com dois ou mais, escolher deixa de ser opcional
6. o barbeiro atende os serviços escolhidos (lista vazia = **todos**)
7. o dia está na jornada **dele**, senão na da loja
8. antecedência mínima (`policies.booking.minAdvanceMinutes`, padrão 60)
9. serviços existem e estão ativos; preço e duração são **somados aqui**
10. **transação**: limite de reservas ativas por cliente
    (`maxActivePerClient`, padrão 3) e conflito de horário por cadeira

Grava com `paymentMethod: null` explícito — ausência seria ambígua entre "não
pagou" e "campo antigo".

Retorna `{ bookingId, value, status, durationMin, staffId }`.

> Dois filtros são feitos **em memória e não na query**, de propósito: três
> cláusulas de igualdade exigiriam índice composto, e índice faltando derruba a
> criação de reserva em produção.
>
> ⚠️ O conflito é por **horário exato**, não por intervalo — ver **P0-2**.

#### `rescheduleBooking` (callable)

`{ barbershopId, bookingId, date, time }`. Exige que a reserva esteja aberta,
aplica antecedência mínima e a janela de remarcação (`minHoursBefore`, padrão 6 —
o dono é isento), e revalida conflito na mesma transação: senão remarcar seria a
porta dos fundos para furar a fila. Grava `rescheduledFrom` e `rescheduledAt`.

> ⚠️ Não incrementa contador de remarcações (P1-13) e valida a jornada da loja, e
> não a do barbeiro (P2-2).

#### `cancelBooking` (callable)

`{ barbershopId, bookingId }`. Autorizado ao dono da reserva **ou** ao dono da
barbearia. A conta mora em `desfechoDoCancelamento`, função pura, extraída do
`onCall` justamente porque dentro dele só se exercia com emulador e por isso não
tinha teste nenhum — hoje tem 9.

| Antecedência | Devolução |
|---|---|
| ≥ `fullRefundHours` (24h) | integral |
| ≥ `partialRefundHours` (6h) | valor − `cancellationFeePct` (25%) |
| abaixo | nada |
| sem `paymentMethod` | nada — o dinheiro nunca entrou |

O status distingue `cancelled_by_client` de `cancelled_by_shop`: falta e
desistência entram na régua do cliente, e o que a barbearia desmarca não pode
contar contra quem não desmarcou nada. Os dois rótulos **não** mudam a devolução.

Grava `refundedAmount` — **e dinheiro nenhum volta**, porque não há gateway.

> ⚠️ Não checa se a reserva ainda está aberta — ver **P0-3**.

### 7.2 Disponibilidade — `availability.ts`

#### `availableSlots` (callable)

`{ barbershopId, date, staffId?, durationMin? }` → `{ slots[], staffId, fechado? }`

Existe porque o cliente **não pode** ver a agenda — as regras permitem a ele ler
apenas as próprias reservas, e a lista de quem corta o cabelo onde e a que horas é
dado de terceiro. Sem esta função, a tela oferecia **todos** os horários e só no
"confirmar" o servidor respondia que já era de outra pessoa.

Devolve **só as horas livres**: disponibilidade sem entregar a agenda. Considera
jornada do barbeiro (ou da loja), intervalos com verificação de **interseção**,
antecedência mínima e a duração total pedida (*"um combo de 60 min não pode
começar 30 min antes do almoço nem 30 min antes de fechar"*).

> ⚠️ A ocupação considera só o **horário de início** das reservas existentes —
> **P0-2**. E, por devolver apenas os livres, matou o fluxo de encaixe no app do
> cliente — **P1-3**.

### 7.3 Cadastro — `signup.ts`

| Function | O que faz |
|---|---|
| `checkSlugAvailability` | valida formato (`validateSlug`, espelhada no cliente) e consulta `slugs/{slug}`. Chamada com debounce |
| `signUpBarbershop` | cadastro self-service: quem chama **é** o futuro dono |
| `completeOnboardingStep` | marca um passo concluído e grava os campos daquele passo |

**`signUpBarbershop`** exige **e-mail verificado** — self-service é superfície de
squatting de subdomínio, e sem isso um script registra os melhores nomes numa
tarde. Limita a **uma barbearia por conta**. Numa transação cria: o tenant (com
`plan: "gestao"`, `features` correspondentes e `trial` de 7 dias), o índice
`slugs/{slug}`, `members/{uid}`, **o primeiro `staff`** e os 4 serviços semente,
mais o registro de auditoria. O claim é gravado **fora** da transação, porque o
Auth não participa dela.

> A barbearia **nunca nasce sem barbeiro**. Não é conveniência: com um garantido,
> nenhum caminho do código precisa tratar "e se não houver barbeiro?" — o estado
> não existe.

**`completeOnboardingStep`** escreve com Admin SDK, que **ignora as regras**. Por
isso `data` passa por uma **allowlist nominal** de 11 campos
(`ONBOARDING_WRITABLE_FIELDS`). Sem ela, o dono chamava com
`{ plan: "completo", status: "ativo", trial: null }` e reescrevia exatamente o que
a regra protege. Campo fora da lista é **recusado**, não ignorado — ignorar faria
o dono ver "salvo" com o dado no chão. A lista é nominal e não por prefixo:
`brand.` liberado em bloco deixaria passar chave nova.

### 7.4 Provisionamento — `provisioning.ts`

| Function | Quem pode | O que faz |
|---|---|---|
| `provisionBarbershop` | `platformAdmin` | cria barbearia para um dono que **já tem conta**; caminho assistido |
| `grantShopRole` | `platformAdmin` ou `owner` daquela barbearia | concede ou revoga papel; idempotente |

Ambas gravam claim e documento juntos — o claim fora da transação, com log
explícito e orientação de reexecutar `grantShopRole` se falhar. Um dono não pode
revogar o próprio acesso: outra conta precisa fazê-lo.

> ⚠️ `provisionBarbershop` não grava `trial` nem `schedule` — **P0-6** e **P2-5**.

### 7.5 Conta — `account.ts`

**`changeInitialPassword`** troca a senha provisória **e** limpa o claim
`mustChangePassword` na mesma operação. Fossem duas, a segunda poderia falhar e
deixar o dono trancado numa tela de troca que ele já cumpriu — ou, pior, existiria
uma função "limpa o claim" chamável sozinha, que transformaria a trava em
decoração.

Recusa repetir a senha provisória, comparando com o hash guardado em
`platform_users/{uid}` (sha256 sem salt, de propósito: o segredo é descartável,
só serve para comparar contra si mesmo e some no instante da troca). Revoga os
refresh tokens: quem tiver recebido a senha junto não continua dentro.

Política mínima (`validatePassword`): 8 caracteres, não só números, não um
caractere repetido — dita em português na tela, não escondida num regex.

### 7.6 Financeiro — `financial-events.ts`

**`materializeFinancialsOnCompletion`** (trigger `onDocumentUpdated` em
`bookings`) — o coração da confiabilidade financeira.

O sistema derivava tudo de `bookings`: receita, comissão e caixa recalculados a
cada leitura. Correto para indicadores, **errado para histórico**, porque a
derivação lê o cadastro atual. Sintoma: o barbeiro renegocia de 40% para 50% em
setembro e o DRE de agosto passa a mostrar 50%.

Ao virar `completed`, grava dois documentos imutáveis:

```
commissions/comissao_{bookingId}   { commissionPct, commissionBase,
                                     commissionAmount, staffId, uid, staffName,
                                     date, origin: "servico" }
payments/pagamento_{bookingId}     { paymentOrigin, paymentMethod, grossAmount,
                                     feePct, feeAmount, netAmount, clientId, date }
```

Três decisões:

- **Id derivado do `bookingId`.** O Firestore reprocessa o gatilho em retry, e
  `set` no mesmo id sobrescreve em vez de duplicar: idempotência por construção,
  não por checagem — que teria corrida entre leitura e escrita.
- **Guarda a base, não só o resultado.** `commissionAmount` sozinho diz quanto foi
  pago e não como se chegou lá.
- **Conclusão desfeita apaga os dois.** Sem isso, marcar como concluído por engano
  deixa comissão a pagar e receita fantasma, sem caminho de volta pela interface.
  *(É este ramo que o P0-3 explora indevidamente.)*

`calcularEventoFinanceiro` é pura e o invariante é que o resultado dependa **só**
dos argumentos: nada relê cadastro, então o documento é reprodutível a partir dos
próprios campos. Sem método informado, `feePct` é 0 e `paymentMethod` fica `null`
— o nulo é o que separa depois "não teve taxa" de "não sabemos a taxa".

### 7.7 Fidelidade — `loyalty.ts`

| Function | Tipo | O que faz |
|---|---|---|
| `creditLoyaltyOnCompletion` | trigger | credita 1 carimbo em `credito_{bookingId}`; desfazer a conclusão estorna |
| `redeemLoyaltyReward` | callable | resgata em transação, lendo saldo e gravando o débito juntos |

### 7.8 Assinatura da plataforma — `billing.ts`

**`revisarAssinaturas`** (agendada, 06:00, `America/Sao_Paulo`).

Existe porque **trial não gera evento**: todo o resto do ciclo é empurrado pelo
provedor de pagamento, mas o fim dos 7 dias é apenas uma data passando.

- `trial` vencido → `suspenso`, com `suspendedReason: "trial_vencido"`
- `ativo` com `paidUntil` vencido → régua de 7 dias (`dunningStage`), depois
  `suspenso` por inadimplência

> 🔴 **`DRY_RUN = true`.** Hoje ela só registra o que faria. Desligar exige ler o
> log ao menos uma vez. E barbearia com `status: "trial"` sem `trial.endsAt` é
> **pulada com warning** — ver P0-6.

### 7.9 Encerramento — `data-deletion.ts`

| Function | Tipo | O que faz |
|---|---|---|
| `encerrarConta` | callable (dono) | marca `status: "encerrada"` e a data; **não apaga nada** |
| `reabrirConta` | callable (dono) | desfaz dentro da janela, voltando para `suspenso` |
| `expurgarContasEncerradas` | agendada, 04:00 | apaga o que passou de **30 dias** |

Detalhe em [§17](#17-lgpd-encerramento-e-expurgo).

### 7.10 WhatsApp

| Function | Tipo | O que faz |
|---|---|---|
| `notifyBookingCreated` | trigger `onDocumentCreated` | avisa dono e cliente da reserva nova |
| `whatsappWebhook` | HTTP **público** | recebe entrega, leitura, botão e texto da Meta |

Detalhe em [§16](#16-whatsapp).

### 7.11 Plataforma — `index.ts`

- **`healthcheck`** — confirma que o deploy subiu e a região está correta.
- **`setOwnerRole`** — **deprecado**, concede `role: owner` global. Mantido só
  para o bootstrap do primeiro operador, com o procedimento documentado no
  próprio arquivo: até ele existir, o claim havia sido gravado à mão e ninguém
  saberia restaurar o acesso se a conta do dono fosse recriada.

---

## 8. Motor de agenda

Duas implementações, com papéis diferentes:

| Onde | Arquivo | Papel |
|---|---|---|
| Servidor | `functions/src/availability.ts` | **fonte de verdade** da disponibilidade |
| Cliente | `web/src/lib/slots.ts` | grade de dias e horários; usado onde não há consulta ao servidor |

Um horário é oferecido quando:

1. o dia está na jornada (do barbeiro, senão da loja);
2. está entre `opensAt` e `closesAt`;
3. o atendimento inteiro cabe até o fechamento;
4. não invade `breaks`, testando **interseção** (`t < ate && t + duracao > de`);
5. respeita a antecedência mínima;
6. está livre **para aquele barbeiro** — conflito é por cadeira, não por
   barbearia. Antes bastava `date + time`: três barbeiros às 15h viravam conflito
   e dois terços da agenda sumiam.

**Capacidade** = slots por dia × barbeiros ativos (`capacidadeDiaria` ×
`barbeirosAtivos`). Sem multiplicar, quem tem 3 barbeiros lê "100% de ocupação"
com dois terços da agenda vazia.

`slotsForDate` do cliente ainda sabe marcar **encaixe** (`isFitIn`) sobre horário
ocupado, e continua testada — mas a tela de agendar não a usa mais. Ver P1-3.

---

## 9. Motor financeiro

Tudo em `web/src/lib/analytics.ts`: **funções puras**, que recebem documentos e
devolvem números, sem tocar no Firestore. É o que as torna testáveis sem emulador
— são 207 linhas de teste só para este módulo.

A regra que organiza o arquivo inteiro: **o congelado vence a derivação, sempre.**
Onde houver derivação, ela é fallback para o histórico anterior ao trigger —
nunca a fonte preferida.

### Receita

```
servicos    = reservas completed, sem encaixe
encaixes    = reservas completed com isFitIn
produtos    = inventory_movements kind="venda" no período
mensalistas = assinantes ativos, SÓ se o período contém a data de referência
caixa       = servicos + encaixes + produtos
bruta       = caixa                        ← mensalista NÃO entra
```

**Mensalidade é receita contratada, não realizada.** O único lastro de que esse
dinheiro entrou é alguém ter deixado o status como `ativo` — não existe cobrança.
Somando em `bruta`, o produto afirmava um recebimento cuja evidência era uma
caixinha marcada; o Simples incide sobre `bruta`, então o dono separava imposto
sobre dinheiro que talvez não tivesse entrado, e a margem subia junto. Continua
exposta em `mensalistas`, para a tela mostrar à parte.

### Comissão

Por reserva, com o percentual **de quem atendeu**:

```
pct    = comissaoCongelada.commissionPct ?? staff.commissionPct ?? policies.commissionSplit.barberPct
base   = comissaoCongelada.commissionBase ?? booking.value
valor  = comissaoCongelada.commissionAmount ?? round(base × pct / 100)

comissão de produto = max(produtos − CMV, 0) × barberPct / 100
```

As bases são diferentes de propósito: **serviço** paga sobre o faturamento (é como
o mercado brasileiro paga barbeiro, 35–60%), **produto** paga sobre o lucro,
porque o custo de compra não é receita de ninguém.

O percentual **exibido** é recalculado do que foi somado (`valor / base`), e não
copiado do cadastro: num mês em que a taxa mudou, parte dos atendimentos está
congelada na taxa antiga e parte na nova.

> Até 04/08 a comissão incidia só sobre o lucro de produto. Com R$ 12.432 de
> serviço e 40% de rateio, o sistema lançava R$ 140 de mão de obra em vez de
> R$ 5.113 — e informava 60% de margem para um setor cuja margem real fica entre
> 15% e 30%.

### DRE

```
  Receita realizada                       (servicos + encaixes + produtos)
− CMV                                     (movimentos de compra no período)
− Taxas de maquininha                     (soma de payments.feeAmount, congelado)
− Comissões                               (serviço por pessoa + loja)
= Margem de contribuição
− Despesas fixas (recorrentes vigentes)
− Despesas eventuais
− Folha (salário fixo de quem tem)
= Resultado antes de impostos
− Imposto (Simples, taxRatePct sobre a receita BRUTA)
= Resultado do mês
```

O imposto fica fora de `variableCost` para a escada continuar legível, e a
identidade `grossRevenue − totalCost === result` segue valendo — coberta por
teste.

> Cobrar a alíquota sobre o resultado subestimava o imposto em ~3×: R$ 360 em vez
> de R$ 1.200 num mês de R$ 20.000 faturados. O Simples (Anexo III) incide sobre
> receita bruta e é devido mesmo no mês de prejuízo.

### Despesa recorrente

`despesasRecorrentesVigentes(expenses, ateData)` — `recurring` é um booleano num
documento de data única, e nada gera a ocorrência do mês seguinte. O compromisso
vale **a partir do lançamento e segue valendo**; relançamentos da mesma conta
(chave `categoria|descrição`) contam **uma vez**, valendo o mais recente — o
reajuste do aluguel substitui, não soma.

As duas telas que liam esse campo discordavam: o DRE perdia a despesa no mês
seguinte ao lançamento, e a Projeção cobrava seis aluguéis no mesmo dia depois de
seis meses de uso.

### Projeção de caixa

Horizontes de 30, 91, 182 e 365 dias. Por dia:

- receita = reservas que ocupam o dia; se não houver, **média histórica daquele
  dia da semana**, marcada como `isEstimate`;
- mensalistas cobram **todo mês** no dia de `nextCharge`, a partir dela — a regra
  antiga (`nextCharge === date`) casava uma vez e nunca mais, o que em 12 meses
  subestimaria a receita recorrente em mais de 90%;
- despesa fixa vence no dia do lançamento, com dia 31 caindo no último dia do mês
  — como os meios de pagamento fazem.

`fracaoEstimada` viaja junto na visão mensal: é o que separa projeção de chute com
aparência de projeção.

### Indicadores

`avgTicket`, `occupancyPct` (limitada a 100), `noShowPct`, `lateCancelCount`
(só `cancelled_by_client`), top serviços com **rateio do combo** entre os
serviços, recorrência de clientes classificada **pelo hábito de cada um**
(`avgIntervalDays × 1,5` esfriando, `× 3` sumiu) e mapa de calor dia × hora.

### Utilitários que evitam defeito conhecido

- `safeDiv` / `safePct` — `NaN` e `Infinity` já vazaram para a tela como
  `width: NaN%` e "R$ ∞";
- `mesAtual` fixa o dia 1 **antes** de mover o mês: em 31/03, voltar um mês pede
  "31 de fevereiro" e transborda de volta para março;
- `formatDateShortPtBR` existe porque `formatDatePtBR(...).split(",")[0]` devolve
  o **dia da semana**, não a data — as tabelas chegaram a exibir só "domingo".

---

## 10. Action Center

`web/src/lib/action-center.ts` — a seção "Precisa de você" do painel Hoje.
Contrato completo em `ACTION-CENTER-CONTRATO.md`.

**Regra de admissão, em uma frase:** um item só existe se responder *o que
aconteceu*, *por que importa agora* e *o que eu faço*. Faltando qualquer uma, é
indicador — e indicador vive no topo da tela, não aqui.

A decisão mora no motor, não na interface: sem isso a regra de negócio se espalha
em condicionais de JSX, cada tela interpreta a operação do seu jeito, e o produto
volta a ter cinco números que discordam entre si.

### As regras implementadas

| # | Regra | Severidade | O que dispara |
|---|---|---|---|
| 4.1 | `fechamentosPendentes` | crítico, urgência 1 | `completed` sem `paymentMethod` — a taxa entra como zero e o lucro aparece maior |
| 4.11 | `desfechosEsquecidos` | crítico, 1–2 | reserva de dia anterior ainda em aberto |
| 4.3 | `encaixesAguardando` | crítico, 2 | `fit_in_requested` pendente |
| 4.2 | `atendimentosAtrasados` | crítico, 2 | passou do horário + tolerância e segue em aberto |
| 4.10 | `taxasNaoConfiguradas` | crítico, 3 | taxas zeradas **e** houve pagamento em cartão no período |
| 4.4 | `semServicoCadastrado` | crítico, 1 | nenhum serviço ativo |

Três invariantes que o motor respeita:

- **`insufficient` não gera item.** Indicador ruim é ignorado; alerta falso
  destrói a confiança no produto inteiro.
- **Ação secundária só quando o dado não diz qual das duas aconteteu.** "Reserva
  em aberto passado o horário" comporta duas leituras opostas — o cliente está na
  cadeira e ninguém fechou, ou ele não veio. Oferecer só uma faria o dono marcar
  falta de quem acabou de atender.
- **Unicidade por id canônico** (`tipo:alvo`), com teto de 3 críticos visíveis. O
  excedente não some: esconder problema é pior que listar demais.

`desfechosEsquecidos` foi a regra que a "lente de confiança" produziu: o painel
Hoje mostra `date === hoje` e o DRE só conta `completed`, então uma reserva de
ontem em aberto **desaparecia à meia-noite** — o corte aconteceu, o dinheiro
entrou na gaveta, e não havia tela onde reencontrá-la.

---

## 11. Planos, trial e acesso

### Matriz

| Recurso | Agenda (R$ 97) | Crescimento (R$ 197) | Gestão (R$ 297) |
|---|---|---|---|
| Agenda, painel, equipe, serviços | ✅ | ✅ | ✅ |
| **WhatsApp** | ✅ | ✅ | ✅ |
| Fidelidade | — | ✅ | ✅ |
| Mensalistas | — | ✅ | ✅ |
| Loja | — | ✅ | ✅ |
| Financeiro avançado (DRE, projeção, fluxo, despesas) | — | — | ✅ |

WhatsApp entra no plano de entrada **de propósito**: é o que o concorrente cobra
como add-on, e o argumento de venda mais direto contra ele.

Fonte única: `functions/src/plans.ts`, espelhada em `FEATURES_POR_PLANO`
(`lib/tenant.ts`). Os dois lados precisam concordar — o backend grava `features`
na criação e o frontend resolve na leitura.

> **Nunca escreva fallback generoso.** `FEATURES_POR_PLANO[plan] ?? ALL_FEATURES`
> parecia defensivo e entregava o catálogo inteiro a quem tivesse um typo no
> plano. Ausência e valor desconhecido resolvem para o **mínimo**, e a
> normalização acontece na entrada, uma vez.

### Trial

7 dias, criado por `signUpBarbershop`, rodando no plano **Gestão** — o dono só
escolhe o plano ao fim dele.

| Função | Comportamento |
|---|---|
| `trialDaysLeft` | dias restantes; negativo depois de vencer; **`null` sem trial** |
| `shouldWarnAboutTrial` | verdadeiro a partir de 4 dias do fim |
| `isTrialExpired` | verdadeiro no vencimento; **falso quando não há trial** |

### Acesso — `acessoDaBarbearia`

Decisão em um lugar só, consumida por `useAcesso`:

| `status` | `podeEditar` | `features` | `motivo` |
|---|---|---|---|
| `encerrada` | não | nenhuma | `cancelada` |
| `suspenso` | não | nenhuma | `suspensa` |
| `trial` vencido | não | nenhuma | `trial_vencido` |
| `trial` válido | sim | **todas** | — |
| `ativo` | sim | do plano, com o documento sobrepondo | — |

**Modo leitura, não corte seco.** Barbearia que perde a agenda no meio de um
sábado não volta para negociar — cria caso. O dono continua vendo tudo, o cliente
continua agendando pelo link, e o que trava é editar. Houve um corte seco no ar
por um dia; foi removido.

**O app do cliente nunca cai por inadimplência do dono.** Quem marcou corte na
sexta não tem culpa da mensalidade, e derrubar a agenda pública transforma uma
cobrança em prejuízo para terceiros.

> 🔴 **O modo leitura não é aplicado por tela nenhuma** e há uma segunda fonte de
> verdade (`useFeature`) que ignora status e trial — **P0-5**. E não existe
> caminho de mudança de plano — **P0-6**.

### Contato comercial

`NEXT_PUBLIC_PLATFORM_WHATSAPP` é o número de quem **vende o SaaS**, separado do
`tenant.contact.whatsapp`, que é o do lojista. Misturar mandaria o dono conversar
consigo mesmo. Sem o número configurado (≥ 12 dígitos), o botão **não é
renderizado** — um "Escolher um plano" que não abre nada é pior que a ausência.

---

## 12. App do cliente final

Layout `(cliente)/layout.tsx`: `AuthGuard`, `SubscriptionProvider`, banner de
demonstração, navegação inferior no celular e lateral no desktop. No domínio raiz,
redireciona para `/landing`.

**Navegação:** `Início` · `Agendar` · `Planos` · `Reservas` · `Perfil`

### `/` — Início

Próximo agendamento (com serviços, data, hora, status e valor), atalho para
agendar, card de mensalista, barra de carimbos e ficha da barbearia com WhatsApp
e telefone.

### `/agendar` — Agendamento em 4 passos

| Passo | O que faz | Regra |
|---|---|---|
| **1. Serviços** | seleção múltipla; soma duração e valor | precisa de ≥ 1 |
| **2. Dia e horário** | barbeiro (só a partir do segundo) + dia + slot | horários vêm de `availableSlots` |
| **3. Pagamento** | informa que o pagamento é no salão | com aviso de LGPD antes de gravar |
| **4. Confirmação** | resumo e atalho para as reservas | — |

A tela **não envia preço**: o servidor calcula a partir dos `serviceIds`. A
consulta de horários carrega a **chave que a originou** (`dia|barbeiro|duração`),
e a lista exibida é derivada dela — sem isso, a lista de um dia aparece sob outro
enquanto a consulta nova viaja.

O aviso de privacidade fica **no passo da confirmação**, imediatamente antes do
ato que grava o dado do cliente final. No rodapé de outra tela, ninguém leria.

> Antes havia três botões de pagamento e dois nasciam desabilitados. Oferecer uma
> escolha que não existe é pior que não oferecer escolha.

### `/reservas` — Minhas reservas

Futuras e histórico, com fidelidade ao lado.

| Ação | Function | Regra |
|---|---|---|
| Reagendar | `rescheduleBooking` | ≥ 6h de antecedência, máx. 2 por reserva |
| Cancelar | `cancelBooking` | mostra a devolução antes de confirmar |
| Resgatar recompensa | `redeemLoyaltyReward` | exige o saldo completo |

As duas primeiras escreviam direto no Firestore, e as regras negam — o `catch` só
fazia `console.error`, o modal fechava, o cliente via a tela dizer que remarcou, e
a agenda do barbeiro continuava com o horário antigo. Falha silenciosa dos dois
lados.

> ⚠️ O seletor de horário da remarcação continua local e só enxerga as reservas do
> próprio cliente — **P1-4**. O limite de remarcações é `useState` — **P1-13**.

### `/planos` — Mensalista

Lista `plans` da barbearia, com checkout em modal e cálculo de quantas visitas o
plano compensa.

> 🔴 **Não persiste, não cobra e afirma que fez as duas coisas** — **P0-1**.

### `/perfil` — Perfil

Identidade, menus em modal (dados, plano, notificações, política de cancelamento,
ajuda), histórico de atendimentos e valor investido, link para o painel quando a
conta é dona, e sair.

> ⚠️ Dados e preferências **não persistem** — **P0-4**, **P1-16**.

### `/login` — Entrar

Três métodos: **celular com SMS**, **e-mail e senha** (com criação e recuperação)
e **Google**.

O `reCAPTCHA` é criado **sob demanda**, na hora de enviar o código: construído na
montagem, uma falha dele travava a tela inteira sem erro visível — inclusive a
aba de e-mail, que nem o usa.

O destino após entrar: `mustChangePassword` → `/trocar-senha`; `?next=` (só
caminho interno, rejeitando `//`, para a tela não virar ponte de phishing); dono →
`/painel`; cliente → `/`.

> 🔴 A aba padrão é **Celular**, e o provider SMS não está habilitado — **P1-15**.

---

## 13. Painel do dono

Layout `painel/(dashboard)/layout.tsx`: `TenantLive` (ficha ao vivo), `AuthGuard
requireOwner`, aviso de trial e barra de modo leitura.

**Navegação:** `Hoje` · `Financeiro` (Resumo, DRE, Fluxo, Despesas, Projeção) ·
`Números` · `Serviços` · `Mensal` 🔒 · `Equipe` · `Loja` 🔒 · `Ajustes`

O cadeado marca o que o plano não inclui, e o item **continua visível**: sumir do
menu não vende nada, e a tela bloqueada é onde o dono descobre que existe algo a
mais.

### `/painel` — Hoje

A tela mais usada do produto.

- **KPIs:** previsto hoje, atendimentos, ocupação (por cadeira), horários livres
- **Previsão × recebido**, com barra de progresso
- **Caixa de hoje** por meio de pagamento
- **"Precisa de você"** — o Action Center ([§10](#10-action-center))
- **Encaixes pendentes** — aprovar/recusar, abrindo o WhatsApp **só depois** de
  gravar
- **Agenda do dia** — tabela ordenada por hora, com telefone clicável, e por
  reserva: **Concluir** (pergunta o método, em um toque), **Não veio** (só depois
  da tolerância), **Cancelar** (só em aberto, mostrando a devolução antes)

Detalhes de desenho que carregam decisão:

- **Uma pergunta, quatro opções, e cada opção já conclui.** Um botão "Confirmar"
  separado somaria um segundo clique ao gesto mais repetido do dia — e o
  fechamento precisa custar um toque, senão o dono volta para o caderno.
- **Falta pede confirmação; concluir não.** Não é simetria perdida: concluir é o
  desfecho esperado e acontece dezenas de vezes por dia, enquanto a falta entra no
  histórico do cliente e é a única acionável sem querer, a partir de um card.
- **A falta não é beco sem saída.** Cliente que aparece 40 min depois volta a ser
  atendimento pelo mesmo caminho ("Veio depois").
- **O relógio é fonte externa** (`useSyncExternalStore`, 60s): `new Date()` no
  render congela na montagem, e o atendimento das 14:00 continuaria "no horário"
  às 15:30 num dia parado.
- **Método e status na mesma escrita**, porque o trigger financeiro lê o documento
  depois da atualização — gravar em duas etapas materializaria o pagamento antes
  de o método existir.

> ⚠️ A legenda do "Previsão × recebido" descreve a regra antiga — **P1-11**.

### `/painel/servicos`

Editor do cardápio (`servicos-editor`, compartilhado com o onboarding), salvando
no `blur` de cada campo. Avisos derivados: nenhum serviço visível, serviço visível
com preço zerado, serviço mais longo que o expediente (nunca produz slot). Ocultar
tira do app sem apagar o histórico.

### `/painel/equipe`

Adicionar, editar e remover profissional: nome, **comissão individual** (% do
atendimento), **salário mensal**, serviços que atende, ativo.

Duas regras que parecem detalhe e não são: **nunca dá para ficar com zero
barbeiros ativos** (o último não pode ser desativado nem removido), e **lista de
serviços vazia significa TODOS** — barbeiro recém-cadastrado nasceria invisível na
agenda e o dono acharia que o sistema quebrou.

> ⚠️ Não há campo de jornada por barbeiro, embora o servidor a leia — **P2-4**.

### `/painel/financeiro` — Resumo

KPIs do mês, ponto de equilíbrio, composição da receita, tabela de referência de
taxas de mercado (Stone/InfinitePay — **referência, não o que a barbearia paga**)
e atalhos para as subtelas. Seção comercial com mensalistas e loja.

> ⚠️ Dois rótulos enganosos — **P1-9** e **P1-10**.

### `/painel/financeiro/dre` 🔒

Escada completa com seletor de mês (12 meses), drill-down por serviço, por produto
e **por barbeiro**, e simulação de cenário (receita e custo variável escalam; o
fixo não).

A mensalidade fica **fora** do DRE, num cartão próprio de "Receita contratada".

> ⚠️ E, ao mesmo tempo, dentro da árvore de receita realizada — **P1-2**.

### `/painel/financeiro/fluxo-caixa` 🔒

Histórico diário: atendimentos, ticket médio, Pix, cartão, dinheiro, total, com
gráfico de barras. É relatório de **entrada**; não tem saídas nem saldo
acumulado — isso é a Projeção.

### `/painel/financeiro/despesas` 🔒

CRUD completo e persistente, com categoria, fornecedor, forma de pagamento,
**recorrente** e observações. Validação de descrição vazia e valor ≤ 0, e
confirmação antes de excluir.

> ⚠️ Os KPIs dizem "no mês" e somam o histórico inteiro, com "julho de 2026"
> cravado — **P1-1**.

### `/painel/financeiro/projecao` 🔒

Horizonte de 30/91/182/365 dias, gráfico de saldo acumulado, tabela por dia (até
30) ou por mês (acima), com **percentual estimado** exibido — e um aviso explícito
quando passa de 80%: *"trate como cenário, não como previsão"*.

### `/painel/numeros`

Faturamento, atendimentos, ticket médio, ocupação e no-show, cada um com
**variação contra o mês anterior**; top serviços; recorrência de clientes; mapa de
calor dia × hora; e dois insights automáticos.

### `/painel/mensal` 🔒

Lista de assinantes com filtro por status, MRR cobrável × contratado e régua de
cobrança D-5 → D+5.

> ⚠️ Não há como cadastrar assinante, e `dueStage` é campo morto. Ver **P0-1**.

### `/painel/loja` 🔒

Catálogo de produtos com alerta de estoque mínimo, cadastro com **prévia de
precificação** (`preço = custo ÷ (1 − margem)`, limitada a 95% — 100% seria
divisão por zero) e simulador de comissão.

> ⚠️ Usa a comissão da plataforma, não a da barbearia (**P1-7**), e não há registro
> de venda (**P1-8**).

### `/painel/configuracoes`

**Taxas por meio de pagamento** (com exemplo em cima de R$ 100) e **tolerância de
atraso** (0–120 min, com exemplo "14:00 avisa às 14:15").

O formulário **não semeia do tenant** — exibe o tenant até alguém digitar. Com
`useState(tenant…)`, o campo prenderia o valor do primeiro render (que vem do
cache de 300s), e salvar gravaria o valor velho por cima do novo: a tela
desfazendo a própria mudança do dono, em silêncio.

A gravação é por **caminho pontilhado** (`"policies.paymentFees"`), porque enviar
`policies` inteiro sobrescreveria cancelamento, comissão e alíquota com o que esta
tela por acaso conhece.

> **O padrão da taxa é zero, e é honesto.** Taxa é contrato de cada barbearia com
> a maquininha dela; chutar uma média faria o DRE debitar dinheiro que talvez não
> seja cobrado. A tela sinaliza que o dado falta.

---

## 14. Cadastro e onboarding

### `/criar-conta` — Self-service

Quatro estados: carregando · precisa entrar · precisa verificar o e-mail ·
formulário.

O **endereço** é o centro da tela — é irreversível e vira o subdomínio: sugerido a
partir do nome comercial, validado enquanto se digita (espelho de `lib/slug.ts`),
conferido no servidor com debounce, com ✓ / ✗ / spinner. A disponibilidade é
**derivada** de uma resposta que carrega o slug que a originou, para o "disponível"
de um endereço não ficar na tela enquanto a consulta do seguinte viaja.

Ao concluir, redireciona com `window.location.href` para o subdomínio novo — o
claim acabou de ser gravado e o token em uso ainda não o tem.

### `/comecar` — Onboarding em 4 passos

| Passo | Grava |
|---|---|
| **Sua barbearia** | `brand.name`, `brand.shortName`, `brand.accentColor`, `contact.*` |
| **Seus serviços** | `services` (mesmo editor do painel) |
| **Seus horários** | `schedule.*` |
| **Compartilhe seu link** | marca a conclusão; QR e link para divulgar |

Quatro passos, e só quatro: são os que impedem a primeira reserva de acontecer.
Despesas, planos, produtos e políticas são pedidos dentro da própria tela, quando
o dono chegar lá — quem precisa lançar o aluguel antes de conseguir receber um
agendamento fecha a aba.

Cada passo salva ao avançar via `completeOnboardingStep`. É a segunda porta: a
primeira é a senha provisória, e sem a checagem daria para pulá-la digitando
`/comecar` na barra de endereço.

### `/trocar-senha`

Para quem recebeu senha provisória por WhatsApp. Chama `changeInitialPassword`.

---

## 15. Fidelidade

O único **loop de valor completo** do produto — nasce, acumula e é consumido sem
intervenção manual.

```
reserva vira completed
   └─► creditLoyaltyOnCompletion
         └─► loyalty_transactions/credito_{bookingId}   (+1)

cliente pede resgate
   └─► redeemLoyaltyReward (runTransaction)
         └─► loyalty_transactions/{auto}                (−N)
```

O saldo é a **soma das transações**, nunca uma contagem de atendimentos: a
contagem funciona até o primeiro resgate, e depois o cliente "reganha" o prêmio
sozinho. O extrato existe de graça.

Política em `policies.loyalty`: `stampsForReward` (10) e `reward`
("1 corte grátis").

> ⚠️ Nem o crédito nem o resgate consultam a feature do plano — **P2-7**.

---

## 16. WhatsApp

### Catálogo

**34 templates** em `functions/src/whatsapp/templates.ts` (31 KB), validados
contra as regras da Meta em `validate.ts`. Separados por remetente: **barbearia**
(confirmação, lembrete, cancelamento, encaixe, pós-atendimento, aniversário,
reativação…) e **plataforma** (`trial_terminando`, `trial_encerrado`,
`cobranca_falhou`).

### Envio — `client.ts`

Três decisões:

1. **Parâmetros por nome, ordem do catálogo.** Quem chama passa
   `{ primeiroNome: "João" }` e é o cliente que monta o array posicional. Aceitar
   array pronto convidava ao erro mais caro possível: trocar valor e hora de lugar
   numa confirmação, que ninguém percebe até o cliente aparecer no horário errado.
2. **O registro é criado ANTES do envio, com id determinístico.** Gatilho do
   Firestore é reexecutado; `create()` falhando por id duplicado **é** a trava,
   sem checagem extra e sem corrida. Mensagem repetida faz o cliente bloquear o
   número, o que derruba a nota de qualidade e reduz o quanto a barbearia pode
   enviar por dia.
3. **Falha de envio nunca derruba quem chamou.** A reserva já está gravada; o que
   não pode acontecer é o agendamento falhar porque a notificação falhou.

`normalizarNumero` força o DDI 55: a Cloud API aceita vários formatos e **falha em
silêncio** em alguns — responde 200 e a mensagem nunca chega.

### Configuração por barbearia — `config.ts`

O `phoneNumberId` fica em `barbershops/{id}/private/whatsapp`, **explícito**.
**Sem documento, não envia.** Nada de cair num número padrão da plataforma: a
mensagem da barbearia B sairia pelo número da A, o cliente receberia uma
confirmação assinada por outro salão, e a A levaria o bloqueio. Ficar em silêncio
é ruim; sair errado é pior.

O token é da **plataforma** e mora no Secret Manager, nunca no Firestore —
documento aparece em backup, em export e na tela de quem tiver acesso ao console.

### Recebimento — `webhook.ts`

Endpoint **público**, chamado pela Meta. Confere `X-Hub-Signature-256` contra o
corpo **cru** em toda requisição (reserializar o JSON muda espaços e ordem, e o
hash deixa de bater). Sem essa checagem, qualquer um que descubra a URL cancela
reserva de qualquer barbearia mandando um JSON.

Responde **200 antes de processar**: a Meta reenvia se não receber rápido, e cada
retry reprocessaria o mesmo toque de botão.

Como o número é **único para toda a plataforma**, cada evento tem uma origem de
verdade diferente:

| Evento | Como descobre a barbearia |
|---|---|
| **Botão** | vem no payload, dentro da requisição assinada |
| **Entrega / leitura** | pelo id da mensagem, em `whatsapp_sent` |
| **Texto livre** | pela última conversa daquele telefone |

Botões e seus efeitos: `CONFIRM_BOOKING` → `confirmed_by_client`,
`CANCEL_BOOKING` → `cancelled_by_client`, `APPROVE_FITIN` → `confirmed`,
`DECLINE_FITIN` → `cancelled_by_shop`, `RESCHEDULE` → só registra.

Duas guardas no `aplicarBotao`:

- **Autoria.** Confirmar/cancelar é do cliente da reserva; aprovar/recusar encaixe
  é de quem toca a barbearia. Com número único, uma mensagem com o payload de
  outra pessoa é indistinguível da legítima só pelo conteúdo.
- **Estado terminal.** Reserva `completed`/`cancelled`/`expired` não volta atrás
  por toque de botão — o lembrete fica no celular e o cliente pode tocar em
  "Confirmo" dias depois.

### Estado real

🔴 **Zero envio.** O código está completo e o token existe, mas falta a
**verificação comercial na Meta** e um chip novo. Sem a verificação: 250
destinatários únicos por 24h.

> ⚠️ E, mesmo liberada, o cliente não receberia nada: `clientWhatsapp` nunca é
> preenchido — **P0-4**.

---

## 17. LGPD, encerramento e expurgo

### Postura

**A barbearia é a controladora** dos dados dos clientes dela; **o CorteHub é o
operador**. A cláusula que sustenta isso está na seção 7 dos Termos — sem ela, a
postura seria afirmação unilateral e a responsabilidade voltaria para a
plataforma.

A política é **ciente do tenant**: num subdomínio de barbearia, ela nomeia a
barbearia como controladora, para o cliente não ter de descobrir sozinho a quem
reclamar.

**Rotas:** `/privacidade` e `/termos`, com links no rodapé da landing, no cadastro
do dono e — o que mais importa — **no passo de confirmação da reserva**,
imediatamente antes do ato que grava o dado do cliente final.

**Transferência internacional declarada:** as functions de negócio rodam em
`southamerica-east1`, mas o SSR (`ssraxonbarber`) roda em `us-central1` — e é ele
que monta a tela, processando nome e telefone em trânsito. É o art. 33, e está
escrito. Mover o SSR para São Paulo eliminaria a declaração.

### Encerramento

`encerrarConta` **não apaga nada**: marca `status: "encerrada"`, a data e o motivo,
e deixa a janela de **30 dias** correr. O acesso ao painel continua — quem
encerrou precisa exatamente disso para exportar antes do prazo.

> A janela não é enfeite: exclusão imediata transforma um clique errado, ou uma
> briga com um sócio, em perda definitiva do histórico de um negócio. E prazo
> longo demais contraria o que foi prometido ao titular.

`reabrirConta` desfaz dentro da janela.

### Expurgo

`expurgarContasEncerradas` roda às 04:00 e apaga o que passou dos 30 dias. Os
alvos são uma **lista explícita**, e não um `recursiveDelete` solto, porque nem
todo dado pessoal mora debaixo da barbearia:

| Alvo | Por quê |
|---|---|
| árvore `barbershops/{id}` | a barbearia e toda subcoleção, inclusive as não listadas |
| `memberships/{id}` (collection group) | vínculos que vivem debaixo de cada usuário |
| `whatsapp_sent`, `whatsapp_conversations`, `whatsapp_numbers` | ficam na **raiz**, e o segundo tem **telefone no id do documento** |
| `slugs/{slug}` | sem liberar, o endereço fica preso a um fantasma |

> 🔴 **`DRY_RUN = true`.** Registra o que apagaria e não apaga. Desligar exige ler
> o log ao menos uma vez com conta encerrada de verdade — rotina que apaga dado de
> cliente é irreversível por definição.

---

## 18. Camada de dados no front

### Caminhos

`lib/db/paths.ts` — a única forma de endereçar dados, com `barbershopId`
obrigatório em toda função.

### Repositório

`lib/db/repository.ts` — `subscribeToCollection`, `createDoc`, `putDoc`,
`patchDoc`, `patchTenant`, `removeDoc`.

Duas decisões:

- **Assinaturas compartilhadas por `(barbearia, coleção, filtros)`.** Sem isso,
  cada componente abre o próprio listener: a tela de Números chama `useFinanceiro`
  duas vezes e abriria doze listeners sobre as mesmas seis coleções. O segundo
  assinante entra de carona e recebe na hora o último resultado conhecido.
- **Cancelamento com 30s de folga.** Navegar para outra tela e voltar recriaria o
  listener e refaria a busca.

`stripUndefined` existe porque o Firestore rejeita `undefined` em tempo de
execução, e campo opcional de formulário chega assim o tempo todo.

### Hooks

`useShopCollection` expõe `{ items, status }` com `carregando | pronto | erro`, e
só começa depois que o Auth resolve — consultar antes garante `permission-denied`,
porque a regra depende do token.

`use-shop-data.ts` traz os atalhos tipados por coleção;
`use-financeiro.ts` monta **tudo** que o financeiro precisa a partir de nove
coleções, num lugar só: as telas de Financeiro, DRE, Fluxo, Projeção e Números
liam cinco literais pré-agregados que precisavam bater entre si na mão — e não
batiam.

### Firebase SDK sob demanda

Só o Auth é carregado de imediato (o `AuthProvider` está no layout raiz).
Firestore, Storage, Functions e Analytics entram por import dinâmico — juntos
passam de 400 KB, e cobrar isso de quem só abriu a tela de agendar atrasa toda
navegação.

**Cache persistente em IndexedDB, só no navegador.** Aplicá-lo no servidor faz
`getDoc` falhar em silêncio — e o sintoma não parece de cache: a resolução do
subdomínio cai no tenant padrão e o dono é expulso do próprio painel.
`persistentMultipleTabManager` porque o painel costuma ficar aberto em mais de uma
aba.

---

## 19. Design system e componentes

### Tokens

Fundo claro, detalhes em dourado e preto. `--color-gold` é **sobrescrito por
barbearia** em tempo de execução; o resto é da plataforma, para o contraste medido
não depender da cor que o lojista escolher.

> ⚠️ **A nomenclatura engana:** `ivory` é o texto **quase preto**, e `gold-light`
> é **mais escuro** que `gold` — existe para ter contraste como texto sobre fundo
> claro. Não presuma pelo nome.

Contraste conferido: `#4f8542` dava 4.41:1 e reprovava AA por pouco, virou
`#43733a`; o hover de superfície dourada precisa **clarear**, senão o texto escuro
cai para 3.3:1.

**Elevação** foi refeita quando o app deixou de ser escuro: sombra preta densa
sobre creme não afunda o cartão, suja o fundo. Hoje são duas sombras por nível
(uma curta que define a borda, uma longa e difusa que dá distância), com o tom
puxado para o marrom da identidade — sombra neutra sobre fundo quente parece cinza
sujo.

### Tipografia

Duas famílias **auto-hospedadas** (`next/font/local`):

- **Fraunces** — a voz da marca (landing, assinatura). `preload: false`: só
  aparece ali, e pré-carregá-la custaria 118 KB no celular de quem só quer marcar
  um corte.
- **Manrope** — a voz do produto. Carrega em toda rota; é a que vale pré-carregar.

> `next/font/google` baixa a fonte **em tempo de build**. Em 11/08 o
> `fonts.gstatic.com` devolveu 404 e derrubou uma publicação real. Com barbearia
> em uso, a correção urgente de um bug ficaria refém de um serviço de terceiro.
> De quebra, o IP de cada visitante deixa de ir para a Google.

### Componentes

| Componente | Papel |
|---|---|
| `ui/button`, `ui/card`, `ui/modal`, `ui/pill` | base |
| `ui/kpi-tile` | indicador com rótulo, valor, legenda e tom |
| `ui/chart` | `BarChart` e `LineChart`, com `label` acessível |
| `ui/segmented` | alternador de período |
| `ui/empty-state` | vazio que **ensina**, com ação — e `LoadingRows` |
| `ui/bloqueio-plano` | `BloqueioPlano` (vende) e `AvisoModoLeitura` (barra fixa) |
| `ui/voltar`, `ui/barber-pole-divider` | navegação e ornamento |
| `recurso-bloqueado` | tela cheia de recurso fora do plano |
| `servicos-editor` | cardápio, compartilhado painel/onboarding |
| `auth-guard`, `acesso` | portas e aviso de trial |
| `painel-sidebar-nav`, `painel-bottom-nav`, `cliente-*-nav` | navegação, com cadeado por plano |
| `service-worker-register` | registro e troca de versão do PWA |
| `demo-banner` | tarja do que ainda não persiste |

**O bloqueio vende em vez de negar:** quem chega numa tela fechada já quis usá-la,
e é o melhor momento para explicar o que ela faz. Muro cinza escrito
"indisponível" desperdiça exatamente essa intenção.

---

## 20. Estados, erros e vazios

**Distinguir vazio de erro é regra.** Falha de rede não pode aparecer como "você
não tem reserva nenhuma". `useShopCollection` expõe os três estados e
`combineStatus` junta vários; o padrão é esqueleto → conteúdo → `EmptyState`.

**A escrita avisa depois de gravar.** `soAvisaSeGravou` (`lib/so-avisa-se-gravou.ts`)
existe por um defeito concreto: aprovar um encaixe disparava
`void patchDoc(...).catch(console.error)` e, na linha seguinte, abria o WhatsApp
com *"Seu encaixe foi confirmado"* — incondicionalmente. Com a rede caindo no
salão, o dono **enviava a um terceiro a confirmação de um encaixe que não
existia**.

> Afirmar algo a um cliente é irreversível de um jeito que uma tela errada não é:
> dá para recarregar a página, não dá para desenviar a mensagem.

As mensagens de erro são **para o dono, não para o log**: "FirebaseError: Missing
or insufficient permissions" não ajuda quem está no balcão com um cliente
esperando. O que ele precisa saber é que **não foi gravado** — e que pode tentar
de novo.

| Situação | O que o usuário lê |
|---|---|
| rede fora | "Sem conexão agora. Nada foi salvo — tente de novo em alguns segundos." |
| regra negando | "Você não tem permissão para esta alteração. Nada foi salvo." |
| conflito de horário | "Esse horário acabou de ser reservado. Escolha outro, por favor." |
| slug tomado no cadastro | "Esse endereço acabou de ser registrado por outra pessoa." |
| dono removendo a si mesmo | "Um dono não pode revogar o próprio acesso — outra conta precisa fazer isso." |

---

## 21. PWA e service worker

Manifest **por barbearia** (`app/manifest.ts`, `force-dynamic`): nome, nome curto,
cores e ícones saem do tenant. É 90% do valor de um app white-label sem passar por
loja de aplicativo.

**A versão do SW vem da URL de registro** (`/sw.js?v=<build>`), e o build vem de
`GITHUB_SHA` no CI:

> Como constante, ela nunca mudava. O navegador só procura service worker novo
> quando o **byte** do arquivo muda; `sw.js` é estático e não mudava entre builds,
> então nenhum deploy jamais disparou `updatefound`. O aviso "Nova versão
> disponível" existia desde a fundação, bem feito, e **nunca teve como aparecer** —
> enquanto o cache atravessava publicação após publicação servindo chunks antigos.

Sem `skipWaiting()` automático: ativar o SW novo enquanto a aba ainda roda o JS
anterior faz ela pedir chunks que já não existem. Quem decide a troca depende de
haver algo a perder — **antes do primeiro toque**, troca calada; **depois**,
pergunta.

`cache.add` item a item, e não `addAll`: um único 404 derrubaria o precache
inteiro e a página offline nunca seria cacheada.

> ⚠️ O botão "Atualizar" foi **observado sem funcionar** em 11/08; o caminho
> "fechar e reabrir" funciona. E há um `ChunkLoadError` visto 4× sem causa raiz.

---

## 22. Segurança de aplicação

`next.config.ts` define CSP e cabeçalhos:

| Cabeçalho | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`, com allowlist explícita para os domínios do Google/Firebase |
| `Strict-Transport-Security` | 2 anos, `includeSubDomains; preload` (só em produção) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | câmera, microfone, geolocalização e pagamento negados |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` — o login com Google usa popup |

Três notas do próprio arquivo:

- `'unsafe-eval'` **não** entra em produção, mas é necessário em desenvolvimento —
  sem ele a hidratação quebra em silêncio: a página aparece e nenhum botão
  responde.
- `upgrade-insecure-requests` só em produção: em desenvolvimento com subdomínio
  (`osiqueira.lvh.me`) o navegador força https e derruba todos os assets. Com
  `localhost` o sintoma não aparece — só surgiu ao testar o multi-tenant de
  verdade.
- `frame-src` precisa do reCAPTCHA e do popup de conta Google.

### Bloqueadores de segurança abertos

Detalhe em `GO-LIVE-READINESS.md` §2.

| | |
|---|---|
| 🔴 **SEC-001** | a conta de runtime das functions tem `roles/editor` no projeto — uma falha em qualquer function alcança o projeto inteiro |
| 🔴 **SEC-002** | **um único** owner e **um único** admin de faturamento, na mesma conta pessoal, e o projeto **não está sob organização nenhuma** — é o único item da lista sem caminho de recuperação |
| 🔴 **App Check** | zero referências no código: qualquer um chama as functions de fora do app. As regras protegem o *dado*, não o *consumo* |
| 🟡 **Observabilidade** | ninguém é avisado se uma function começar a falhar |
| 🟡 **Backup** | sem rotina configurada |

---

## 23. Ambientes, variáveis e segredos

### Variáveis do web (`web/.env.local`)

| Variável | Papel |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (7) | configuração do SDK — **pública por design** |
| `NEXT_PUBLIC_ROOT_DOMAIN` | domínio raiz da plataforma |
| `NEXT_PUBLIC_PLATFORM_WHATSAPP` | comercial da plataforma; vazio esconde o botão |
| `NEXT_PUBLIC_DEMO_MODE` | `false` esconde a tarja; ausente = mostra |
| `NEXT_PUBLIC_USE_EMULATOR` | aponta SDK **e** a resolução REST do tenant para o emulador |

`NEXT_PUBLIC_BUILD_ID` **não** vem do `.env`: é gerado pelo `next.config.ts` a
partir do `GITHUB_SHA` (ou do relógio, fora do CI) e exposto ao cliente. É o que
faz o service worker enxergar versão nova a cada publicação — ver [§21](#21-pwa-e-service-worker).

`lib/firebase.ts` **falha cedo** com a lista do que falta, em vez de deixar o SDK
morrer com `auth/invalid-api-key` — como o módulo é avaliado no prerender de toda
rota, o build inteiro morria sem explicação.

`NEXT_PUBLIC_*` é **inlined em tempo de build**: mudar exige rebuild e novo
deploy, não basta reiniciar. Por isso ficam em `vars` do ambiente do GitHub, e
não em `secrets` — chamar de segredo o que é público ensina a equipe a tratar
segredo de verdade com a mesma displicência.

### Segredos do servidor (Secret Manager)

`WHATSAPP_TOKEN` · `WHATSAPP_VERIFY_TOKEN` · `WHATSAPP_APP_SECRET`

> Segredo entra no Secret Manager por arquivo ou colagem, e os dois trazem `\n`
> sem pedir licença. Daí o `.trim()` em `whatsapp/webhook.ts` — sem ele, o sintoma
> é um 403 na verificação do webhook que **parece problema da Meta**.

### Emuladores

Auth 9099 · Firestore 8080 · Functions 5001 · Storage 9199 · UI 4000.

Com o emulador ligado, a resolução do tenant aponta para a REST local (porta 8080)
e o cache é zerado — ler a **produção** daqui seria pior que não ler nada: o slug
local não existe lá, cai no tenant padrão, e o dono é tratado como cliente.

---

## 24. Deploy e testes

### Publicação

**Só pela esteira.** Deploy de máquina local já sobrescreveu regras de produção
com versões mais antigas e removeu as regras de 6 coleções por 28 minutos — o
repositório estava 30 commits atrás da produção sem ninguém saber.

`.github/workflows/deploy.yml`, disparo manual com escopo (tudo / hosting / regras
e índices / functions), ambiente `producao` com **aprovação humana obrigatória**.
A ordem é deliberada: índices → regras → functions → hosting. O Hosting por
último, porque é a chave que liga o que foi publicado para o cliente.

Cinco proteções que valem nomear:

1. **Trava de alvo por três origens independentes** — o valor fixo no workflow, o
   `.firebaserc` do commit e o `project_id` de quem assina a credencial. Uma
   alteração futura que aponte para outro lugar morre nessa etapa, não em
   produção.
2. **Actions fixadas por SHA**, não por tag: tag é ponteiro móvel, e este é o único
   workflow com credencial de produção em mãos.
3. **A credencial é escrita depois de todo `npm ci`**, fora do workspace, com
   `umask 077` — um `postinstall` de qualquer pacote transitivo roda com o mesmo
   usuário. E é destruída no fim, `if: always()`.
4. **Functions publicadas por nome**, com a lista montada dos exports compilados:
   um `--only functions` seco entende função sem código no repositório como
   apagada e tenta removê-la.
5. **O job depende da esteira de qualidade** — a mesma do push, não uma cópia.

> 🔴 **As regras do Storage estão fora do escopo do deploy.** Cinco publicações
> morreram com a mensagem falsa *"Firebase Storage has not been set up"*, que o
> `firebase-tools` produz a partir de um 404 do endpoint `defaultBucket` — que
> responde 200 para o owner e 404 para a conta da esteira. Foram tentados três
> papéis e a declaração do bucket em `firebase.json`, sem sucesso. Hoje é
> inofensivo (nenhuma tela usa Storage); **antes da primeira tela de upload isso
> precisa voltar.**

### Testes

```bash
# Verificação completa
cd web && npm run check          # typecheck + lint + 177 testes
cd functions && npm run typecheck && npm test   # 141 testes

# Regras — exige emulador
cd functions && npm run test:rules              # 66 testes de isolamento
```

| Suíte | Cobertura |
|---|---|
| `web/src/lib/__tests__` | analytics, action-center, business-rules, tenant, tenant-shape, slots, slug, format, so-avisa-se-gravou |
| `functions/src/__tests__` | booking (devolução), financial-events, signup, provisioning, account, data-deletion, locale, índices |
| regras (emulador) | isolamento A↔B no Firestore e no Storage |

> **Teste verde não promove nada para "validado".** Suíte verde diz que o código
> faz o que o autor imaginou; produção diz que o produto faz o que o dono precisa.
> Todo defeito grave de agosto passou por uma suíte verde — inclusive um teste
> chamado "comissão sai do lucro da loja", que passava **afirmando o comportamento
> errado**.

### Armadilhas conhecidas

- **Deploy de Hosting no Windows** falha com `EPERM: symlink` sem Modo de
  Desenvolvedor. É o motivo de o deploy ter migrado para o CI.
- **`npm install` em `functions/`** nesta máquina remove `@emnapi/core` e
  `@emnapi/runtime` do lockfile — o build remoto (Node 22/Linux) precisa deles.
- **`npm run test:rules` não roda no Git Bash** (as aspas simples não sobrevivem);
  roda no CI e localmente trocando por aspas duplas.
- **A integração Firebase↔Next** é homologada até Next 16.0; o projeto usa
  16.2.12.
- **Este Next tem mudanças de API** em relação ao conhecido: ler
  `node_modules/next/dist/docs/` antes de escrever código que toque no framework
  (`web/AGENTS.md`).

---

## 25. O que é fachada, e o que está quebrado

Duas listas diferentes, e a distinção é deliberada: **funcionalidade ausente é
escopo; funcionalidade que mente é defeito.**

### Não existe (escopo, decisão consciente)

| Item | Estado |
|---|---|
| Gateway de pagamento | não existe — nem para o cliente da barbearia, nem para a mensalidade da plataforma |
| Estorno real | `cancelBooking` grava `refundedAmount`; dinheiro nenhum volta |
| Venda de produto | ninguém escreve `inventory_movements` |
| Ficha de cliente / CRM | sem ela não há reativação, aniversário nem régua de faltas |
| Nota fiscal | não existe |
| Login por SMS | provider não habilitado |
| Observabilidade e backup | não existem |
| Expiração de encaixe | `fitInExpirationMinutes` é lido só para escrever texto na tela |
| `client_occurrences`, `cash_entries`, `refunds`, `subscription_invoices`, `schedules` | coleções declaradas nas regras, sem escrita |

### Aparenta funcionar e não funciona (defeito)

Referências completas em [`AUDITORIA-2026-08-17.md`](./AUDITORIA-2026-08-17.md).

| Item | O que a tela afirma | Ref. |
|---|---|---|
| **Assinatura de mensalista** | "Plano ativado", "Primeira cobrança hoje", "Enviamos a confirmação no seu WhatsApp" | **P0-1** |
| **Reserva sobreposta** | horário livre que não está livre | **P0-2** |
| **Cancelar concluído** | apaga receita e comissão sem aviso | **P0-3** |
| **WhatsApp do cliente** | "O cliente é avisado pelo WhatsApp em seguida" | **P0-4** |
| **Modo leitura** | "Você continua vendo tudo, mas não consegue alterar" | **P0-5** |
| **Trial e plano** | teste que nunca vence; downgrade sem efeito | **P0-6** |
| **Despesas "no mês"** | total histórico rotulado como mensal, com "julho de 2026" fixo | **P1-1** |
| **DRE** | filhos da receita não somam o cabeçalho | **P1-2** |
| **Encaixe** | anunciado nos dois lados, inalcançável no app | **P1-3** |
| **Remarcar** | oferece horário de outra pessoa | **P1-4** |
| **Política de cancelamento** | 24h/6h fixos na tela do cliente | **P1-5** |
| **Preço de plano** | "a partir de R$ 149/mês" fixo | **P1-6** |
| **Perfil e notificações** | "Salvo!" sem gravar | **P0-4**, **P1-16** |
| **Botão "Atualizar" do PWA** | observado sem funcionar | §21 |

### O que já foi validado em produção

Cada linha com evidência nomeada em `GO-LIVE-READINESS.md` §4: comissão e taxa
congeladas no atendimento, materialização e rollback de `payments`/`commissions`,
DRE lendo o materializado, resolução de tenant por subdomínio, deploy pela
esteira, Configurações gravando e refletindo na hora, merge de política parcial, e
troca de versão do PWA ao fechar e reabrir.

---

*Levantado sobre `659091a` em 17/08/2026. Onde este documento e o código
divergirem, **o código vence** — e a divergência é defeito deste arquivo.*
