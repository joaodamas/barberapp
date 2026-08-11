# Blueprint do produto

Documento mestre. Define **o que o produto é**, quais entidades existem, o que
cada evento dispara e em que ordem construir.

Escrito em 11/08/2026 sobre o commit `621dada`. Substitui qualquer roadmap
anterior. Uma sessão de desenvolvimento deve ler este documento antes de criar
tela ou coleção — o objetivo é que ninguém precise inventar funcionalidade.

| Marca | Significado |
|---|---|
| ✅ | existe e funciona hoje |
| ⚠️ | existe parcialmente, com ressalva descrita |
| ❌ | não existe |

---

## 1. Tese do produto

### O que é

Não é um sistema de barbearia. É **o sistema operacional financeiro e
operacional da barbearia** — onde o dono entra todo dia para responder cinco
perguntas:

1. O que está acontecendo hoje?
2. Quanto estou faturando?
3. Quanto estou realmente lucrando?
4. Onde estou perdendo dinheiro ou oportunidade?
5. O que preciso fazer agora?

### Cliente ideal

**Barbearias com 2 a 15 profissionais**, com operação recorrente, que precisam
profissionalizar gestão, financeiro e relacionamento.

Barbearia de um profissional resolve com WhatsApp e agenda de papel. A dor
aparece quando existem ao mesmo tempo: vários barbeiros, comissão, escala, fluxo
de caixa, despesas, mensalistas, estoque e serviços diferentes.

**Consequência prática:** tudo que for específico de multi-barbeiro tem
prioridade sobre o que serve operação solo. Comissão individual, ocupação por
profissional e conflito de agenda por barbeiro não são refinamento — são o
produto.

### A pergunta que governa o roadmap

> **O dono sentiria falta do sistema se ele desaparecesse amanhã?**

Hoje a resposta é *"sim, pela agenda"*. O destino é:

> *"Sem ele eu não sei quanto faturei, quanto vou receber, quais clientes estou
> perdendo, quem da equipe está performando e o que preciso fazer amanhã."*

Quando chegar aí, existe dependência operacional — e o produto deixa de ser uma
agenda bonita para virar o sistema de gestão da barbearia.

### North Star

**Atendimentos gerenciados pelo sistema, por barbearia ativa, por mês.**

Mede se o SaaS entrou na operação. Mil barbearias cadastradas sem uso valem menos
que trinta registrando 500 atendimentos/mês. Calculável hoje.

### Estado das cinco perguntas

| Pergunta | Estado | O que falta |
|---|---|---|
| O que acontece hoje? | ⚠️ | agenda além do dia; Action Center raso |
| Quanto faturo? | ✅ | — |
| Quanto lucro? | ⚠️ | taxa de maquininha e receita de produto não entram |
| Onde perco dinheiro? | ❌ | sem cliente inativo, inadimplência ou estoque |
| O que fazer agora? | ⚠️ | cobre só encaixe e serviço faltando |

---

## 2. Princípios de arquitetura

### 2.1 O motor existe. Falta o histórico.

Concluir um atendimento já dispara a cascata: o dono clica "Concluir", grava
`status: "completed"`, e a receita entra no DRE, a comissão é calculada, o caixa
atualiza, a fidelidade credita, a projeção muda. **Não há dupla digitação.**

O produto hoje é um *motor transacional com telas interpretando os dados*. O
próximo nível é:

```
evento → histórico imutável → modelo operacional → decisão → ação
```

### 2.2 Derivado vs. materializado

> **Derive o que descreve o presente. Materialize o que vira histórico.**

Derivar nunca fica inconsistente — não há job de reconciliação nem risco de dois
números divergirem. É certo para indicadores e agregados.

Materializar é obrigatório quando o valor **precisa parar no tempo**.

**O que já está congelado na reserva** ✅ — `createBooking` grava
`serviceNames`, `staffName`, `value` e `durationMin`. Mudar o nome ou o preço de
um serviço **não altera** atendimentos passados. Essa parte do snapshot está
resolvida.

**O que não está** ❌ — o percentual de comissão e a taxa de pagamento são lidos
do cadastro *atual*:

> Se o Rômulo renegociar de 40% para 50% em setembro, o DRE de agosto passa a
> mostrar 50%. Fechamento financeiro não pode mudar retroativamente — quebra o
> acerto com o barbeiro e a conversa com o contador.

| Materializar | Derivar |
|---|---|
| `commissions` — percentual e valor congelados | receita, margem, DRE |
| `payments` — bruto, taxa e líquido | ticket médio, ocupação |
| `subscription_invoices` — competência | frequência e risco do cliente |
| `inventory_movements` — custo unitário | projeção |
| `client_occurrences` — no-show, atraso | performance da equipe |

### 2.3 Confiança do dado é parte do dado

Nenhuma tela apresenta como **real** um número cuja origem o sistema não possui.
Mostrar `R$ 0,00` para algo que não é zero — é desconhecido — é o defeito que
produziu, na auditoria de 11/08, um painel que mentia com confiança.

```ts
type Indicador<T> = {
  valor: T;
  confianca: "real" | "estimado" | "insuficiente";
  /** Por que não é real. Obrigatório quando confiança ≠ "real". */
  motivo?: string;
};
```

| Estado | Quando | Como aparece |
|---|---|---|
| 🟢 **real** | origem completa | número normal |
| 🟡 **estimado** | derivado de média ou projeção | rótulo "estimativa" visível |
| ⬜ **insuficiente** | falta a origem | "sem dados" + o que cadastrar |

**Exemplo concreto:** o lucro hoje ignora taxa de maquininha e receita de
produto. Enquanto essas origens não existirem, a margem é 🟡 **estimada**, não
🟢 real — e a tela diz o porquê.

### 2.4 Uma ação, muitos dados

```
Dono clica "Concluir"
        │
        ├─ materializa ─► commissions (pct congelado)
        │                 payments (taxa congelada)
        │                 loyalty_transactions  ✅ já funciona
        │
        └─ deriva ──────► DRE · caixa · números · projeção
                          performance do profissional
                          histórico, frequência e risco do cliente
```

### 2.5 Invariantes globais

1. Toda escrita é escopada por `barbershopId`.
2. Autoridade vem do custom claim, nunca de documento que o usuário escreve.
3. Preço e valor são calculados no servidor. A tela nunca envia dinheiro.
4. Dinheiro é write-only do servidor (`allow write: if false`).
5. Histórico financeiro é imutável — correção gera lançamento novo.
6. Estimativa é rotulada; dado ausente não vira zero.

---

## 3. Catálogo de entidades

Formato: campos · invariantes · quem escreve · quem lê · estado.

### 3.1 Barbearia — `barbershops/{id}` ✅

Contrato completo em `DOCUMENTACAO-TECNICA-FUNCIONAL.md` §4.

**Invariantes:** `slug`, `plan`, `status`, `createdAt`, `createdBy`, `features` e
`trial` imutáveis pelo dono. `features` ausente deriva de `plan`; `plan` ausente
cai em `entrada`.

**Acrescentar:**

```ts
metas?: { faturamentoMensal: number; definidaEm: string };
policies.paymentFees: {
  pix: number; debito: number; credito: number; creditoParcelado: number;
};
```

Hoje `paymentGateways` em `business-rules.ts` é tabela de referência de mercado
que não afeta cálculo nenhum, e o seletor na tela de Financeiro não faz nada.

### 3.2 Cliente — `barbershops/{id}/clients/{id}` ❌ **criar**

A maior lacuna. O cliente é derivado de `bookings`: `recorrenciaDeClientes` já
calcula frequência e status de retorno, e nenhuma tela usa.

```ts
type ClientDoc = {
  uid: string | null;          // conta no app; nulo para walk-in
  name: string;
  whatsapp: string;            // dígitos com DDI
  email?: string | null;
  birthday?: string | null;    // MM-DD
  notes?: string | null;
  preferredStaffId?: string | null;   // observado, não declarado
  createdAt: Timestamp;
  origin: "app" | "balcao" | "importacao";
  active: boolean;
};
```

- **Invariante:** `whatsapp` único por barbearia — chave de deduplicação entre
  quem agenda pelo app e quem chega no balcão.
- **Escreve:** `createBooking` (upsert), tela de Clientes.
- **Derivado, nunca gravado:** visitas, ticket médio, total gasto, última visita,
  intervalo médio, risco de perda.

### 3.3 Profissional — `staff/{id}` ✅

`name` · `active` · `uid?` · `serviceIds?` · `commissionPct?` · `salary?` ·
`schedule?` · `color?` · `order?`

**Invariante:** a barbearia nunca existe sem ao menos um profissional.

### 3.4 Serviço — `services/{id}` ✅

`name` · `durationMin` · `price` · `priceFrom?` · `active`

### 3.5 Reserva — `bookings/{id}` ✅

Fonte de verdade do operacional. Criada só por `createBooking`, que já congela
`serviceNames`, `staffName`, `value` e `durationMin`.

**Acrescentar:**

```ts
clientId: string;          // referência a clients/{id}
rescheduleCount: number;   // hoje é useState e zera com F5
```

### 3.6 Comissão — `commissions/{id}` ❌ **materializar**

Coleção declarada, regra escrita, nunca gravada.

```ts
type CommissionDoc = {
  bookingId: string;
  staffId: string;
  uid: string | null;          // barbeiro lê só o que é dele
  date: string;
  basePct: number;             // CONGELADO
  baseValue: number;           // CONGELADO
  amount: number;
  origin: "servico" | "produto";
  createdAt: Timestamp;
};
```

**Invariante:** nunca reescrito. Estorno gera documento com `amount` negativo.

### 3.7 Pagamento — `payments/{id}` ❌ **materializar**

```ts
type PaymentDoc = {
  bookingId?: string;
  subscriptionId?: string;
  clientId: string;
  method: PaymentMethod;
  gross: number;
  feePct: number;              // CONGELADA
  fee: number;
  net: number;                 // gross − fee
  date: string;
};
```

**Invariante:** `net = gross − fee`. É o que dá valor a `gatewayFeesTotal`, hoje
fixo em zero.

### 3.8 Assinatura — `subscriptions` + `subscription_invoices` ❌

O checkout é `useState` e o painel lê coleção que ninguém escreve.

```ts
type SubscriptionDoc = {
  clientId: string; planId: string; planName: string; price: number;
  status: "ativo" | "atrasado" | "cancelado" | "suspenso";
  billingDay: number;          // 31 cobra no último dia do mês
  startedAt: Timestamp; canceledAt?: Timestamp | null;
  nextCharge: string;
};

type SubscriptionInvoiceDoc = {
  subscriptionId: string; clientId: string;
  competencia: string;         // YYYY-MM — resolve o MRR histórico
  dueDate: string; amount: number;
  status: "aberta" | "paga" | "atrasada" | "cancelada";
  paidAt?: Timestamp | null;
};
```

`dueStage` (a régua D-5→D+5, hoje campo morto) passa a ser **derivado**.

### 3.9 Movimento de estoque — `inventory_movements` ❌

```ts
type InventoryMovementDoc = {
  productId: string;
  kind: "compra" | "venda" | "ajuste" | "perda";
  quantity: number;
  unitCost: number;            // CONGELADO — CMV por competência
  value: number;
  bookingId?: string | null;   // venda casada com atendimento
  clientId?: string | null;
  paymentMethod?: PaymentMethod;
  date: string;
};
```

### 3.10 Despesa — `expenses` ⚠️

CRUD completo. `recurring` é booleano num documento de data única; nada gera a
ocorrência seguinte.

```ts
recurrence?: { dayOfMonth: number; startedAt: string; endedAt?: string | null };
```

### 3.11 Ocorrência do cliente — `client_occurrences` ❌

`clientId` · `bookingId` · `kind: "no_show" | "cancelamento_tardio" | "atraso"` ·
`date`

Alimenta a régua que decide se o cliente passa a exigir pagamento antecipado —
o template `pagamento_antecipado_exigido` já existe.

---

## 4. Catálogo de eventos

### 4.1 `atendimento.concluido` — o evento central

**Gatilho:** `status: "completed"`.

```
atendimento.concluido
  ├─ materializa   commissions { basePct, baseValue congelados }
  │                payments { gross, feePct, fee, net }
  │                loyalty_transactions  ✅ já existe
  ├─ atualiza      clients.preferredStaffId
  └─ dispara       WhatsApp pós-atendimento
```

**Invariantes:** idempotente (reconcluir não duplica); desfazer estorna os três;
comissão gravada nunca muda.

**Implementação:** trigger `onDocumentUpdated`, mesmo padrão de
`creditLoyaltyOnCompletion`, com id determinístico `comissao_{bookingId}` e
`pagamento_{bookingId}`.

### 4.2 Demais eventos

| Evento | Estado | Materializa / dispara |
|---|---|---|
| `reserva.criada` | ⚠️ | acrescentar upsert em `clients` |
| `reserva.cancelada` | ⚠️ | falta `refunds` e `client_occurrences` |
| `reserva.remarcada` | ✅ | incrementar `rescheduleCount` |
| `cliente.nao_compareceu` | ❌ | `client_occurrences` |
| `produto.vendido` | ❌ | `inventory_movements` + `payments` + `commissions` + baixa de estoque, em uma transação |
| `mensalidade.faturada` | ❌ | `subscription_invoices { competencia }` |
| `mensalidade.paga` | ❌ | `payments` + status da fatura |
| `mensalidade.atrasada` | ❌ | status + WhatsApp da régua |
| `fidelidade.creditada` / `.resgatada` | ✅ | — |

---

## 5. Roadmap por capacidade

Organizado por **capacidade do negócio**, não por tela. Blocos podem se
sobrepor; a ordem é de dependência, não de calendário.

### 🔴 Bloco 1 — VERDADE

> *O sistema sabe exatamente o que aconteceu?*

Fundação. Nenhum bloco acima confia em número que este não garanta.

| Item | Estado |
|---|---|
| `commissions` materializada com percentual congelado | ❌ |
| `payments` materializada com taxa congelada | ❌ |
| Taxas por método no tenant + tela de configurações | ❌ |
| Estorno executado (`refunds`) | ⚠️ |
| Registro de no-show (`client_occurrences`) | ⚠️ |
| `rescheduleCount` persistido | ⚠️ |
| Despesa recorrente materializada | ⚠️ |
| Tipo `Indicador<T>` com confiança do dado | ❌ |

**Métrica:** % dos eventos financeiros corretamente materializados. Meta: 100% —
não há valor parcial aceitável aqui.

### 🟠 Bloco 2 — OPERAR

> *O sistema me ajuda a administrar hoje?*

O painel Hoje vira cockpit, não dashboard.

| Item | Estado |
|---|---|
| Action Center completo | ⚠️ |
| Agenda semanal e por profissional (colunas) | ❌ |
| Ações por atendimento: iniciar · concluir · não compareceu | ⚠️ |
| Resultado do dia (receita − comissão − despesa) | ❌ |
| Ocupação por profissional no dia | ❌ |

O Action Center responde só o que exige decisão hoje: atendimentos aguardando
confirmação, cliente recorrente fora do intervalo, despesa vencendo, horário
ocioso em faixa de alta demanda.

**Métrica:** DAU/WAU dos donos. Um dono que abre todo dia é um dono que não
cancela.

### 🟠 Bloco 3 — CONHECER

> *O sistema conhece meus clientes?*

| Item | Estado |
|---|---|
| Entidade Cliente + upsert no agendamento | ❌ |
| Customer 360 | ❌ |
| Risco de perda (frequência vs. intervalo habitual) | ❌ |
| Clientes inativos com potencial estimado | ❌ |
| Lembrete por WhatsApp a partir da lista | ❌ |

O Customer 360 mostra: cliente desde, visitas, última visita, ticket médio, total
gasto, profissional preferido, serviços mais usados, frequência — e o risco:
*"normalmente retorna em 25 dias, está há 32"*.

**Métrica:** % dos atendimentos com cliente identificado.

### 🟡 Bloco 4 — GERENCIAR

> *O sistema me ajuda a administrar minha equipe?*

| Item | Estado |
|---|---|
| Performance por profissional | ❌ |
| Comparação relativa e evolução vs. mês anterior | ❌ |
| Extrato de comissão do barbeiro | ❌ |
| Metas | ❌ |

A leitura relevante não é o ranking, é a desproporção: *"Rômulo gera 31% da
receita ocupando 24% das horas"*. Comparação existe para achar onde melhorar,
não para eleger o pior barbeiro.

**Métrica:** % dos barbeiros com performance mensurável.

### 🟡 Bloco 5 — ENTENDER

> *O sistema me explica meu negócio?*

| Item | Estado |
|---|---|
| Fluxo de caixa com saldo e saídas | ⚠️ hoje é relatório de faturamento |
| PDV de produto | ❌ |
| Decomposição da variação de margem | ❌ |
| Receita previsível (recorrente vs. total) | ❌ |
| MRR, churn, inadimplência | ❌ |

A pergunta que este bloco responde não é "quanto lucrei", é **"por que meu lucro
caiu"**: receita +8%, resultado −3%, porque comissões +14% e despesas +7%.

**Métrica:** % das receitas e despesas reconciliáveis dentro do sistema.

### 🟢 Bloco 6 — INTELIGÊNCIA

> *O sistema me diz o que fazer?*

**Sem IA.** O primeiro nível é regra matemática sobre dado confiável:

- 🔴 faturamento caiu 18% nos últimos 7 dias
- 🟡 terça tem 34% de horários ociosos
- 🟢 ticket médio subiu 11% no mês
- 🔵 8 clientes recorrentes acima do intervalo habitual

Saúde do Negócio (score por dimensão) entra aqui. IA só depois de
`dados → indicadores → regras → alertas → insights` estarem estáveis.

**Métrica:** % dos alertas que geram ação.

### ⚙️ Trilha paralela — MONETIZAÇÃO

Não é bloco, é trilha. Trial, paywall e gate de plano **já estão prontos**; falta
a menor peça:

```
checkout → webhook → subscription → plano ativo → feature gates
```

Gateway recomendado: **Asaas** (Pix recorrente e boleto pesam neste público).
Sem billing complexo agora.

**Métrica:** primeiro real recebido de um cliente que não é a barbearia piloto.

---

## 6. O que NÃO fazer

- **Não criar tela porque "faltam telas".** O problema não é quantidade de
  interface, é profundidade operacional.
- **Não colocar IA agora.** Dado incompleto gera insight que mente com
  confiança, e isso destrói a única coisa que o produto vende.
- **Não fazer dezenas de gráficos.** O dono quer cinco respostas, não 25
  visualizações.
- **Não virar ERP.** O escopo é agenda, atendimento, cliente, equipe, financeiro
  e recorrência. Nota fiscal, folha e contabilidade estão fora.
- **Não materializar indicador.** Ticket, ocupação e frequência são derivados.
- **Não criar controle decorativo.** Botão que não faz nada, filtro que não
  filtra, campo que nenhuma tela lê.
- **Não mostrar zero para desconhecido.** Use ⬜ insuficiente.
- **Não reescrever documento financeiro.** Correção gera lançamento novo.

---

## 7. Riscos conhecidos

| Risco | Impacto | Mitigação |
|---|---|---|
| Comissão recalculada retroativamente | acerto errado com barbeiro | Bloco 1 — item mais urgente do produto |
| Receita sem taxa de maquininha | lucro superestimado em ~3% do que passa em cartão | `payments` com `feePct` congelada |
| MRR contamina histórico | série temporal inutilizável | `subscription_invoices` com competência |
| Trilha de monetização divide foco | integração de pagamento tem cauda longa de erro | manter pequena: sem billing complexo |
| Teste de regras não roda em CI | isolamento entre tenants sem verificação contínua | emulador no pipeline |
| Cliente sem entidade | sem retenção nem Customer 360 | Bloco 3 |

---

## 8. Como usar este documento

1. Escolha a capacidade (§5) e pegue **um** item.
2. Confira a entidade (§3) — campos, invariantes, quem escreve e quem lê.
3. Confira o evento (§4) — o que materializa e o que dispara.
4. Verifique §6 antes de criar tela ou campo.
5. Ao terminar, atualize o estado (✅ ⚠️ ❌) aqui e no
   `DOCUMENTACAO-TECNICA-FUNCIONAL.md`.

Documento que descreve intenção em vez de realidade é o que fez uma auditoria
inteira analisar código que não correspondia à produção. Se um item aqui
divergir do código, **o código vence** — e este arquivo é corrigido no mesmo
commit.
