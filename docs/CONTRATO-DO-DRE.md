# Contrato do DRE — a origem de cada número

> **Nenhuma fórmula nova pode criar informação que não tenha uma origem
> identificável.**
>
> Se uma linha do DRE não consegue responder *"qual fato gerou esse número?"*,
> ela não entra como verdade financeira.

Este arquivo é o contrato que a Rodada 3 precisa cumprir. Nenhuma linha de
código alterada.

---

## A árvore

| Linha | Fato de origem | Existe hoje? |
|---|---|---|
| Receita de serviços | `payments` com `origin: "servico"` ← booking concluído | 🟢 desde o Gate A |
| Receita de produtos | `payments` com `origin: "produto"` ← venda | 🟢 desde G1.6 |
| Receita de mensalidades | `payments` com `origin: "mensalidade"` ← **fatura paga** | 🟢 desde G1.6 |
| CMV | `unitCost` congelado nas vendas do período | 🟢 desde G1 |
| Taxas | `PaymentDoc.feeAmount` | 🟢 desde G1.6 |
| Comissão de serviço | `commissions` com `origin: "servico"` | 🟢 desde o Gate A |
| Comissão de produto | — | 🔴 **não existe documento** |
| Despesas | `ExpenseDoc` | 🟡 existe, sem congelamento (D24) |
| Outras receitas (09/10) | `other_incomes` (`OtherIncomeDoc`) | 🟡 existe, direto da tela como `ExpenseDoc` (D24) |
| Correções | `refunds` · movimento `ajuste` | 🔴 **não existem** |
| Movimentos de caixa sem fato | `cash_entries` | 🔴 **não existe escrita** |

---

## Duas consequências que a regra produz, e que valem registrar

### 1 · A receita realizada passa a sair de `payments`, não de `bookings`

Hoje `receitaDoMes` soma `bookings.value` dos concluídos
(`analytics.ts:74`) e `movements.value` das vendas (`:78`). A árvore diz outra
coisa: **as três receitas derivam de `payments`**.

Isso não é preciosismo de origem. Três ganhos concretos:

**a) D20 sai de graça.** A mensalidade só entra na receita quando existe
`payments` com `origin: "mensalidade"` — e ele só nasce quando a fatura é
marcada como paga. *Contratado projeta, realizado fatura* deixa de ser regra a
implementar e vira consequência da fonte.

**b) A pergunta "qual fato gerou esse número" tem uma resposta só.** Com três
fontes diferentes, auditar a receita exige três caminhos. Com uma, `origin`
separa as linhas e o total é uma soma.

**c) Bruto e líquido ficam disponíveis juntos.** `payments` já carrega
`grossAmount`, `feeAmount` e `netAmount` congelados. A receita bruta e o custo
de adquirência passam a vir do mesmo documento, e não podem divergir.

**O que precisa ser verificado antes de trocar:** todo booking concluído
gera `payments`? Sim desde o Gate A, com fallback para o histórico anterior ao
trigger — o mesmo cuidado que `comissoesDeServico` já tem para comissão
(`analytics.ts:301`). A troca precisa do mesmo fallback, ou o histórico antigo
aparece zerado.

### 2 · D18 vira "comissão sim, pagamento não"

`materializeFinancialsOnCompletion` grava **comissão e pagamento juntos**
(`financial-events.ts:267`). D18 diz que o atendimento coberto por plano:

| | |
|---|---|
| gera comissão | **SIM** — o barbeiro trabalhou |
| gera receita | **NÃO** — o dinheiro veio da mensalidade |

Com a receita saindo de `payments`, isso se implementa **não criando o
pagamento** — e não com uma marca que o `analytics` precise interpretar depois.

```
booking coberto por plano
   ├── commissions   criado   ← o trabalho aconteceu
   └── payments      NÃO      ← nenhum dinheiro entrou aqui
```

É mais forte que a marca no fato: um pagamento que não existe não pode ser
somado por engano em nenhuma visão futura. E a marca
(`includedInSubscription`) continua necessária **no booking**, para explicar
por que não há pagamento — sem ela, um atendimento sem `payments` seria
indistinguível de um erro de materialização.

---

## Adendo de 09/10/2026 · lançamentos parcelados e "Outras receitas"

**Parcela é um fato por mês.** Um lançamento parcelado (despesa ou receita
avulsa) são N documentos, cada um com o valor DA PARCELA, a data de vencimento
e `parcela: {numero, total, grupoId}`. Não existe documento "total".

| Pergunta | Regra |
|---|---|
| Em que mês a parcela pesa no DRE? | No mês da data dela (competência = vencimento). Despesa parcelada não é recorrente: cai em "Despesas Operacionais Eventuais". |
| E no caixa? | Na data dela, **depois que a data chegou**. Parcela com data futura não é saída (nem entrada) do fluxo — o modelo não guarda "paga", então não se afirma que foi paga antes da data. |
| E na projeção? | Parcela com data de hoje em diante entra no dia dela, em coluna própria (`parcelaAPagar` / `parcelaAReceber`), fora de `fixedExpense`: parcela tem fim, recorrente não. |
| Equipamento parcelado? | **Limitação registrada:** a máquina de R$ 3.000 em 10x vira despesa de R$ 300 em cada mês, e não ativo imobilizado com depreciação. Não há ativo, depreciação nem a contrapartida de financiamento no produto; inventar isso criaria número sem fato de origem. |
| Mês "fechado"? | O produto não tem fechamento (D24). Alterar valor ou excluir parcela de mês que já passou é permitido, e a confirmação avisa que reescreve o resultado e o caixa daquele mês. |

**"Outras receitas"** (venda de equipamento, aluguel de cadeira, parceria) é uma
linha própria, **abaixo** do custo fixo e **fora** de `receita.bruta`:

```
resultado antes de impostos = margem de contribuição − custo fixo + outras receitas
imposto (Simples)           = alíquota × receita.bruta          ← não inclui outras receitas
```

Por quê fora da bruta: a base do Simples, a comissão do barbeiro, o ticket médio
e o ponto de equilíbrio são sobre o que a cadeira e a loja produzem. Somar ali
uma venda de equipamento inflaria o imposto e a comissão sem que ninguém tenha
decidido isso. **Limitação registrada:** o tratamento tributário real de cada
tipo de receita avulsa é decisão do contador; o produto não o presume. A
identidade `receita bruta − custo total = resultado` vale quando não há outras
receitas no mês; com elas, `resultado = receita bruta + outras receitas − custo total`.

A fonte `otherIncomes` entra em `resultado`, `caixaDoMes` e `projecao` na regra de
falha de leitura (`lib/apuracao.ts`): coleção ilegível = número "não apurado".

---

## O que a árvore expõe como ainda faltando

Três linhas do DRE não têm fato:

**Comissão de produto.** Hoje é derivada em `analytics.ts:511` com a política
de HOJE — mudar o split reescreve meses fechados. Precisa virar documento
`commissions` com `origin: "produto"`, congelado, como o de serviço. É P1-7 com
a solução localizada.

**Correções.** `refunds` e movimento `ajuste` — D22 e D23. Sem eles, o DRE não
consegue explicar por que um número caiu.

**Caixa sem fato.** `cash_entries` — sangria, troco, aporte, pagamento de
comissão ao barbeiro.

**A ordem que isso sugere para a Rodada 3:** criar os três fatos que faltam
antes de reescrever as fórmulas. É a mesma lição de D19 — corrigir o CMV antes
de existir compra era ajustar uma fórmula que somava zero.

---

## O teste que a Rodada 3 precisa passar

Para cada linha do DRE, um teste que responda **em código**:

```
dado o fato X
quando o DRE for calculado
então a linha Y contém exatamente o valor de X
e nenhum outro fato contribui para Y
```

A segunda cláusula é a que importa. Uma linha que soma certo por coincidência —
porque duas fontes se cancelam — passa no primeiro teste e falha no dia em que
uma delas mudar.

---

*Contrato de 17/08/2026, sobre `e0a3a2d`. Nenhuma alteração de código.*
