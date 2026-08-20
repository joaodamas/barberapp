# Auditoria do modelo financeiro

> **Feita depois de G1 e G2.** Pela primeira vez é possível seguir uma venda e
> uma mensalidade que **nasceram no produto** até o DRE, em vez de auditar massa
> semeada.

Nenhuma linha de código foi alterada nesta auditoria.

---

## Resumo executivo

Três achados novos, e um deles é maior que o D3 registrado:

| | O quê |
|---|---|
| 🔴 **D19** | **O CMV é estruturalmente ZERO em produção.** Nenhum caminho do produto grava movimento de `compra`. D3 dizia "CMV soma as compras em vez do custo do vendido" — a verdade é que não há compras a somar |
| 🔴 **D20** | **A fatura de mensalidade não é lida por nenhuma visão financeira.** G2 grava o fato; `useFinanceiro` não passa `subscription_invoices` para lugar nenhum. A receita de mensalista continua saindo de `status === "ativo"` |
| 🟠 **D21** | **Venda e mensalidade não geram `payments`.** Só a conclusão de atendimento escreve lá. Como `gatewayFeesTotal` soma `payments`, produto e mensalidade não pagam taxa de maquininha — que é o D7, com a causa localizada |

E a confirmação do que já sabíamos, agora sobre fato real: a venda nasceu
`credit` e o Fluxo de Caixa a mostra como `dinheiro` (D4).

---

## 1 · Origem do fato

Onde cada real nasce, e o que fica congelado.

| Fato | Documento | Quem escreve | Id / idempotência | Congelado |
|---|---|---|---|---|
| Atendimento | `bookings/{auto}` | `createBooking`, `createBookingAtCounter` | id automático + trava de horário na transação | `value`, `durationMin`, `serviceNames`, `staffName` |
| Receita de serviço | `payments/pagamento_{bookingId}` | `materializeFinancialsOnCompletion` | **id derivado do bookingId** | `grossAmount`, `feePct`, `feeAmount`, `netAmount`, `paymentMethod` |
| Comissão de serviço | `commissions/comissao_{bookingId}` | idem | **id derivado do bookingId** | `commissionPct`, `commissionBase`, `commissionAmount` |
| Venda de produto | `inventory_movements/venda_{chave}_{produto}` | `registrarVendaDeProduto` | **chave de idempotência da tela** | `unitPrice`, `unitCost`, `paymentMethod`, `value` |
| Assinatura | `subscriptions/{auto}` | `criarMensalista` | id automático + guarda de assinatura ativa única | `planName`, `price`, `billingDay` |
| Cobrança | `subscription_invoices/fatura_{assinatura}_{YYYY-MM}` | `emitirFaturasDaCompetencia` | **id derivado do fato** + `create` | `amount`, `competencia`, `dueDate`, `planName` |
| Recebimento da mensalidade | o mesmo documento da fatura | `registrarPagamentoDeMensalidade` | transação, não reescreve fatura paga | `paidAt`, `paymentMethod` |
| Despesa | `expenses/{auto}` | **a tela, direto** | nenhuma | nada |
| Compra de estoque | — | **NINGUÉM** | — | — |

**Todos os fatos econômicos nascem no servidor, exceto despesa.** `expenses`
ainda aceita escrita direta do cliente e não tem congelamento nem idempotência
— é o único ponto do modelo onde o dono digita um valor que entra no resultado.
Não é urgente (ele é o dono do próprio custo), mas é assimetria a registrar.

### 🔴 D19 · Não existe entrada de estoque

`kind: "compra"` aparece em **quatro lugares, e os quatro são leitura**:
`analytics.ts:469` e `dre/page.tsx:144` filtram por ele; `domain.ts` e
`inventory.ts` só o declaram no tipo.

O estoque inicial vem do formulário de cadastro do produto
(`loja/page.tsx:91`, campo `stock`), e **não há tela de reposição**. Quando a
caixa de pomada chega, o dono edita o número — sem movimento, sem custo, sem
data.

Consequência: `cmv = movimentos.filter(kind === "compra")` soma sobre um
conjunto vazio. **O CMV do DRE é R$ 0,00 em produção, sempre**, e o lucro da
loja aparece como o faturamento inteiro.

Isso reenquadra D3. O achado dizia *"CMV soma as compras do período, não o custo
do que foi vendido"* — descrição correta do **código** e incorreta do **produto**,
porque não há compras. A massa de teste tinha `C01 · compra · 180`, semeada à
mão; a produção não tem equivalente.

---

## 2 · Receita

Quatro coisas diferentes, e o produto hoje conhece duas.

| Conceito | Existe? | Onde | Lastro |
|---|---|---|---|
| **Contratada** | 🟡 sim, mas derivada | `receita.mensalistas` ← `subscribers.filter(status === "ativo")` | uma caixinha marcada |
| **Faturada** | 🟢 **nova, em G2** | `subscription_invoices` com `amount` congelado | documento emitido |
| **Recebida** | 🟢 **nova, em G2** | fatura com `status: "paga"` + `paidAt` + `paymentMethod` | confirmação humana |
| **Realizada** | 🟢 sim | `receita.bruta = servicos + encaixes + produtos` | atendimento concluído / venda registrada |

### 🔴 D20 · O lastro existe e ninguém lê

`useFinanceiro` monta o financeiro inteiro e **não busca
`subscription_invoices` em lugar nenhum**. As faturas são lidas só pela tela
Mensal, por um hook próprio (`useSubscriptionInvoices`).

Então, hoje:

```
receita.mensalistas  ←  status === "ativo"        (sem lastro)
fatura paga          →  nenhuma visão financeira  (lastro sem leitor)
```

Os R$ 248 continuam derivados de um status, exatamente como antes de G2 — só
que agora **existe** o documento que os substituiria.

Isso é bom: significa que a decisão da Rodada 3 não é "como inventar lastro
para o mensalista", e sim **"qual dos dois números o DRE deve usar"**. A
resposta provável é *receita realizada = fatura paga na competência*, mas isso
é decisão de modelo e não de implementação.

### O que a receita realizada NÃO inclui, e está certo

Encaixe (`receita.encaixes`) é somado à parte e depois entra em `bruta`. O fluxo
de encaixe saiu do produto em 17/08 — o campo continua para não zerar histórico
antigo, e o valor é sempre zero em base nova.

---

## 3 · Custo

### Pode o CMV vir do fato da venda? **Sim, e todo o dado necessário existe.**

```
inventory_movements (venda)
  ├── unitCost   CONGELADO no instante da venda
  ├── quantity
  ├── date       competência
  └── productId
```

`CMV da competência = Σ (unitCost × quantity)` das vendas do período. Nenhuma
leitura de `products.cost`, nenhum histórico reescrito quando o custo muda —
provado em `inventory-transacao.test.ts` ("REPOSIÇÃO MAIS CARA não altera a
venda anterior").

**O que falta não é dado, é a decisão de trocar a fórmula** — e D19 mostra que
a fórmula atual não só está errada conceitualmente como devolve zero.

### Comissão

| Origem | Congelada? | Base |
|---|---|---|
| Serviço | 🟢 `commissions/comissao_{bookingId}` | `commissionBase = value` do atendimento |
| Produto | 🔴 **não existe documento** | derivada em `analytics.ts:511` do lucro da loja, com o percentual de HOJE |

`commissionsLoja = round(lucroLoja × padraoPct / 100)`, e `lucroLoja =
max(receita.produtos − cmv, 0)`. Com D19 (cmv = 0), **a comissão de produto é
calculada sobre o faturamento inteiro** em vez do lucro — o dono paga comissão
sobre o custo da mercadoria.

E ela relê `policies.commissionSplit` a cada render: mudar o split reescreve a
comissão de produto de meses fechados. É o mesmo defeito que o congelamento de
`commissions` resolveu para serviço, e que nunca chegou à loja. Isso é **P1-7
com causa localizada**.

### Taxa de maquininha — 🟠 D21

`gatewayFeesTotal = taxasDePagamento(payments, periodo)`, e `payments` é escrita
**só** por `materializeFinancialsOnCompletion`. Venda de produto e pagamento de
mensalidade não geram `payments`.

Logo: uma venda de R$ 145 no crédito e uma mensalidade de R$ 149 no crédito
**não debitam taxa nenhuma** no DRE, embora o `paymentMethod` esteja gravado nos
dois fatos. É o D7, e agora se sabe exatamente por quê.

---

## 4 · Caixa

### O que cada visão lê hoje

| Visão | Fonte | Meio de pagamento |
|---|---|---|
| `caixaDoDia` (painel Hoje) | `bookings` concluídos | 🟢 lê `b.paymentMethod` |
| `caixaDiario` (Fluxo de Caixa) — reservas | `bookings` concluídos | 🟢 lê `b.paymentMethod` |
| `caixaDiario` — vendas | `inventory_movements` | 🔴 **`d.dinheiro += m.value`, fixo** |
| `caixaDiario` — mensalidade | — | 🔴 **não aparece** |
| `caixaDiario` — saídas | — | 🔴 **não existem** |

### D4, agora com fato real

Venda registrada pela interface em 17/08: `paymentMethod: "credit"`.
Fluxo de Caixa na mesma sessão: `PIX 0,00 · CARTÃO 0,00 · DINHEIRO R$ 145,00`.

`analytics.ts:248` é literal: `d.dinheiro += m.value`. O comentário ao lado diz
*"Venda de produto entra no caixa do dia, sem contar como atendimento"* — e era
verdade quando o documento não sabia o meio. Agora sabe.

### D8/D11 · não existe saída

`caixaDiario` **não tem laço de despesa**. O "Fluxo de Caixa" é entrada diária
com nome de fluxo de caixa, e por isso não existe, em lugar nenhum do produto,
um número que responda *"quanto sobrou no caixa"*.

Com G1 e G2 isso mudou de natureza: as entradas agora têm meio de pagamento
(serviço, venda, mensalidade) e as saídas existem em `expenses`. **O dado para
um fluxo de caixa de verdade está completo** — falta a decisão de competência
(despesa recorrente é vigente ou lançada?) e a construção.

---

## 5 · DRE

A escada montada hoje:

```
grossRevenue        receita.bruta = serviços + encaixes + produtos
− variableCost      cmv + gatewayFees + commissions
= contributionMargin
− fixedCost         fixedExpenses + variableOperatingExpenses + payroll
− tax               taxRatePct sobre receita.bruta
= result
```

Identidade `grossRevenue − totalCost === result` vale, e tem teste.

O que cada linha realmente contém, depois desta auditoria:

| Linha | Estado | Por quê |
|---|---|---|
| `grossRevenue` | 🟡 sem mensalidade paga | D20 |
| `cmv` | 🔴 **zero estrutural** | D19 |
| `gatewayFees` | 🟡 só serviço | D21 |
| `commissions` — serviço | 🟢 congelada | — |
| `commissions` — produto | 🔴 base errada + relê política | D19 + P1-7 |
| `fixedExpenses` | 🟢 vigência, não lançamento | corrigido em 05/08 |
| `tax` | 🟡 sobre `bruta`, que exclui mensalidade | consequência de D20 |
| `result` | — | herda tudo acima |

---

## 6 · D18 · A pergunta de modelo que precede as correções

> Quando o cliente paga uma assinatura que inclui determinados serviços, qual é
> o tratamento econômico do atendimento consumido?

**Hoje o produto responde a pior das opções por omissão:** o mensalista paga a
mensalidade **e** o atendimento vira `booking` com `value` cheio, que entra em
`receita.bruta` e gera comissão e taxa. `PlanDoc.unlimited` existe e **nada o
consulta** na criação da reserva.

Uma barbearia com 40 mensalistas de R$ 149 que cortam 2× no mês teria, por essa
regra, R$ 5.960 de mensalidade **mais** ~R$ 6.400 de serviço — faturamento
duplicado, comissão paga duas vezes sobre a mesma cadeira, e imposto calculado
sobre um total que não existiu.

O erro **cresce com o sucesso do clube**, que é o produto que a matriz de planos
vende.

### As opções, e o que cada uma implica

**A · mensalidade é receita; atendimento é só utilização.**
`value = 0` no booking do mensalista. Simples, e destrói informação: a comissão
do barbeiro zera junto, o ticket médio despenca, e o dono perde a noção de
quanto serviço o clube consome.

**B · mensalidade é receita; atendimento tem valor econômico interno, sem nova
receita.**
O booking mantém `value` para comissão, ocupação e ticket, e ganha uma marca
(`coberturaPorPlano` ou `isRevenue = false`) que o tira da receita realizada.
Preserva a informação e separa **o que a cadeira produziu** de **o que a
barbearia faturou**.

**C · outra regra de reconhecimento** — por exemplo reconhecer a mensalidade
proporcionalmente ao consumo, que é o que a contabilidade de assinatura faz em
alguns modelos.

**Minha leitura, e é leitura, não decisão:** B é a única que preserva as três
perguntas que o produto já responde — *quanto a cadeira produziu*, *quanto o
barbeiro tem a receber*, *quanto a barbearia faturou* — sem inventar receita
nem apagar operação. A é mais fácil e cobra o preço no acerto com o barbeiro,
que é o número mais sensível de uma barbearia.

**A escolha muda seis coisas ao mesmo tempo** — receita, comissão, imposto,
ticket médio, ocupação e o significado de `isRevenue` — e por isso ela vem
antes das correções, não depois.

---

## 7 · A fotografia, e a ordem que ela sugere

```
DECISÃO DE MODELO          D18   tratamento do serviço coberto por plano
        ↓                  D20   receita de mensalista: status ou fatura paga?
        ↓
ENTRADA QUE FALTA          D19   movimento de compra / reposição de estoque
        ↓
FÓRMULAS                   D3    CMV = Σ(unitCost × quantity) das vendas
        ↓                  D4    caixa por meio, lendo paymentMethod da venda
        ↓                  D7    payments para venda e mensalidade  (D21)
        ↓                  P1-7  comissão de produto congelada, base correta
        ↓
CONSTRUÇÃO                 D8/D11 fluxo de caixa com saídas
```

**As duas primeiras não são correções de cálculo, são decisões suas.** As
demais dependem delas: corrigir o CMV antes de existir compra é corrigir uma
fórmula que continua somando zero, e corrigir a receita de mensalista antes de
decidir D18 é escolher a resposta pelo caminho mais curto.

---

## 8 · O que mudou desde a Fase 2

A reconciliação de agosto foi feita sobre massa semeada à mão, e a diferença
entre o ledger e o sistema era **R$ 34,75 em R$ 680 — 5,1%**.

Aquele número era otimista por construção: a massa tinha uma compra de estoque
(`C01`) e um `MEIO_DA_VENDA` paralelo, duas coisas que o produto não produzia.
Sobre fato real, o CMV é zero e o meio da venda é ignorado — a divergência é
maior, e agora é mensurável contra dados que nasceram no sistema.

**É a diferença entre auditar o motor e auditar o produto.**

---

*Auditoria de 17/08/2026, sobre `47495c1`. Nenhuma alteração de código.*
