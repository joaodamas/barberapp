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
| Perdas e uso interno de estoque (10/10) | movimento `ajuste` MANUAL de saída (`quantity < 0`, sem `refundOf`) × `unitCost` congelado | 🟢 desde `ajustarEstoque` |
| Comissão de produto | — | 🔴 **não existe documento** |
| Despesas | `ExpenseDoc` | 🟡 existe, sem congelamento (D24) |
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

## Adendo de 10/10/2026 · ajuste de estoque, perdas e correção de venda

**Ajustar o estoque** (`ajustarEstoque`) grava um movimento `kind: "ajuste"` com
`quantity` ASSINADA, `reason` (`perda`, `uso_interno`, `vencido`, `contagem`,
`outro`), `reasonText` e o `unitCost` do produto CONGELADO no instante. Ele não
tem `refundOf` — é isso que o separa de uma devolução.

| Fato | Receita | CMV | Perdas e uso interno | Estoque |
|---|---|---|---|---|
| Saída por perda, uso interno, vencido, contagem a menos ou "outro" | — | — | **+ `\|quantity\| × unitCost`** | − |
| Contagem a MAIS (achou mais do que o sistema dizia) | — | — | — | + |
| Devolução (`ajuste` com `refundOf`) | − `refunds` | − custo devolvido | — | + |

Decisões:

- **Perda é linha própria**, entre o CMV e as despesas variáveis, e soma no custo
  variável. Mercadoria que saiu sem venda é custo do mês — mas diluí-la no CMV
  esconderia justamente quanto a quebra e o uso na cadeira custam.
- **Contagem a mais não gera receita nem reduz custo.** Nenhum dinheiro entrou;
  corrige a quantidade e fica registrada. O custo médio do cadastro não se move
  (não há compra para ponderar).
- **Contagem a menos é perda.** A diferença de inventário é mercadoria que sumiu
  sem venda: custo, ao custo congelado.
- **Devolução e perda não se contam duas vezes.** `perdasDeEstoque` ignora
  `refundOf`; `detalheDoCustoDoVendido` ignora `ajuste` sem `refundOf`. Cada
  fato contribui para uma linha só.
- **Sem custo congelado** (movimento anterior ao campo), a perda entra com custo
  zero e a tela conta quantas unidades ficaram de fora — nunca lê `products.cost`.

**Corrigir a forma de pagamento de uma venda** (`corrigirPagamentoDeVenda`)
altera `payments` (meio, forma, taxa, líquido) e o `paymentMethod` do movimento
na mesma transação, com log em `audit_log`. A taxa é a de HOJE, congelada
(R1.1). Receita bruta, CMV e comissão não mudam. Venda com devolução — total ou
parcial — não se corrige: o estorno guardou o meio antigo. Janela: o mês
corrente, como no atendimento.

**Preço combinado na hora** (só o dono): o movimento de venda guarda o
`unitPrice` praticado (de onde saem receita, taxa e comissão), o `listPrice` de
tabela do instante e o `priceReason`. O desconto reduz a receita bruta
diretamente — não existe "linha de desconto" na venda de produto.

**Corrigir venda** não é um fato novo: é uma devolução (`refunds`) seguida de uma
venda nova. Cada uma é um fato completo; se a segunda não acontece, a primeira
fica registrada.

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
