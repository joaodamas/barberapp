# G1.7 — Auditoria do ciclo de vida financeiro

> **Antes das fórmulas.** Os fatos de entrada nascem certos desde G1.6. Esta
> auditoria pergunta o que acontece com eles **depois**: quando são desfeitos,
> devolvidos, editados ou fechados.

Nenhuma linha de código alterada.

---

## Resumo executivo

| | O quê |
|---|---|
| 🔴 **D22** | **O estorno não existe.** `refunds` tem regra, tem caminho e **ninguém escreve**. O produto calcula o valor a devolver, grava num campo da reserva que nada lê, e o dinheiro devolvido não existe em lugar nenhum do financeiro |
| 🔴 **D23** | **Venda e mensalidade não têm caminho de desfazer.** Serviço tem reversão; produto e mensalidade, não. Uma venda registrada por engano é irreversível pela interface, com estoque baixado e taxa cobrada |
| 🟠 **D24** | **A despesa é o único fato econômico sem congelamento, sem idempotência e editável para sempre.** A tela escreve direto, `patchDoc` altera valor e data de meses fechados, e `removeDoc` apaga |
| 🟠 **D25** | **`cash_entries` e `client_occurrences` são coleções mortas.** Declaradas em `paths.ts` e nas regras, zero escritas e zero leituras — a mesma classe de `inventory_movements` antes de G1 |

Nenhum deles impede a Rodada 3 de calcular. **Todos os quatro mudam o que o
resultado significa depois que o mês fecha.**

---

## 1 · Pagamento

O que G1.6 deixou pronto:

| | Serviço | Produto | Mensalidade |
|---|---|---|---|
| Id derivado do fato | 🟢 `pagamento_{bookingId}` | 🟢 `pagamento_venda_{movementId}` | 🟢 `pagamento_fatura_{invoiceId}` |
| Idempotente | 🟢 `set` no mesmo id | 🟢 chave da tela | 🟢 não reescreve fatura paga |
| Origem explícita | 🟢 `origin: "servico"` | 🟢 `origin: "produto"` | 🟢 `origin: "mensalidade"` |
| Taxa congelada | 🟢 | 🟢 | 🟢 |
| Bruto / líquido | 🟢 | 🟢 | 🟢 |
| Nasce com o fato | 🟢 gatilho | 🟢 mesma transação | 🟢 mesma transação |
| Escrita só do servidor | 🟢 regra `write: false` | 🟢 | 🟢 |

**Esta camada está fechada.** É a única das cinco que está.

---

## 2 · Estorno — 🔴 D22

### O que existe

`refunds` está em `paths.ts:35` e tem regra em `firestore.rules:305`
(`read: isStaffOf || ownsResource`, `write: false`). O comentário de
`decidirEfeito` a nomeia como a resposta certa:

> *"Devolver dinheiro de atendimento realizado é **estorno**, e estorno é evento
> novo (`refunds`), nunca a remoção do evento anterior. Histórico financeiro se
> corrige somando, não apagando."*

### O que não existe

**Nenhuma linha do repositório escreve `refunds`.** Zero em `functions/src`,
zero no web. A única menção fora de `paths.ts` e das regras é o comentário
acima.

### O que acontece hoje quando alguém cancela

`cancelBooking` calcula a devolução com `desfechoDoCancelamento` — política da
barbearia, faixa de horas, taxa retida — e grava o resultado em
`bookings.refundedAmount` (`booking.ts:980`).

**`refundedAmount` não é lido por nenhuma linha do produto.** A única outra
ocorrência no repositório é um comentário na tela do painel.

Então o ciclo é:

```
cliente cancela
   ↓
servidor calcula R$ 67,50 de devolução      ← conta correta, política certa
   ↓
grava em bookings.refundedAmount            ← campo que nada lê
   ↓
o dinheiro devolvido NÃO existe no DRE,
no fluxo de caixa, nem em payments
```

### Por que importa mais agora que antes

Com pagamento em três origens, a assimetria ficou tripla:

- serviço concluído e depois devolvido: o `payments` fica, o estorno não nasce;
- venda de produto devolvida: **não há nem o cálculo**;
- mensalidade paga e devolvida: idem.

O produto sabe **quanto** devolver e não sabe **registrar** que devolveu.

---

## 3 · Reversão — 🔴 D23

### Serviço: existe, e é a única

`decidirEfeito` distingue duas coisas com cuidado, e a distinção está certa:

| Transição | Efeito | Por quê |
|---|---|---|
| → `completed` | materializar | o atendimento aconteceu |
| `completed` → `confirmed`/`no_show`/… | **reverter** | correção: não aconteceu |
| `completed` → `cancelled_*` | **nada** + `console.warn` | contradição: já aconteceu |

A reversão **apaga** `comissao_{bookingId}` e `pagamento_{bookingId}`.

### O que isso implica, e que a auditoria anterior não olhou

Apagar é correto para *"marquei concluído por engano"* — o fato nunca existiu.
Mas o registro de que houve um engano também some. Não há rastro de que aquele
atendimento chegou a ser concluído e foi desfeito, nem quem desfez.

Para correção de digitação isso é aceitável. Vira problema quando alguém usa
a reversão para desfazer receita real — e não há como distinguir os dois casos
depois.

### Produto e mensalidade: **não existe caminho de desfazer**

| | Desfazer |
|---|---|
| Serviço | 🟢 mudar o status da reserva |
| Venda de produto | 🔴 **nenhum** |
| Mensalidade paga | 🔴 **nenhum** |

Uma venda registrada por engano — produto errado, quantidade errada, cliente
errado — é **irreversível pela interface**, com estoque já baixado, pagamento
gravado e taxa cobrada. O único caminho é editar o Firestore à mão, que é
exatamente o que `write: false` foi posto para impedir.

`registrarPagamentoDeMensalidade` recusa reescrever fatura paga — decisão certa
para idempotência, e que também impede corrigir um meio de pagamento digitado
errado.

**Não é falta de tela: é falta de decisão de modelo.** Desfazer uma venda é
reversão (apagar) ou estorno (evento novo)? A resposta muda se ela devolve
estoque, se gera `refunds`, e se a taxa volta.

---

## 4 · Despesa — 🟠 D24

O único fato econômico que **a tela escreve direto**.

```
firestore.rules:256
  match /expenses/{expenseId}  { allow read, write: if isOwnerOf(barbershopId); }
```

| Propriedade | Serviço | Venda | Mensalidade | **Despesa** |
|---|---|---|---|---|
| Escrita pelo servidor | 🟢 | 🟢 | 🟢 | 🔴 tela, direto |
| Idempotência | 🟢 | 🟢 | 🟢 | 🔴 nenhuma |
| Valor congelado | 🟢 | 🟢 | 🟢 | 🔴 `patchDoc` altera |
| Editável após fechar o mês | 🔴 não | 🔴 não | 🔴 não | 🟢 **sim, sempre** |
| Apagável | não | não | não | 🟢 **`removeDoc`** |
| Meio de pagamento tipado | 🟢 `PaymentMethod` | 🟢 | 🟢 | 🟡 `"Pix" \| "Boleto" \| "Cartão" \| "Transferência"` |

Duas observações sobre o último ponto:

**`ExpenseDoc.payment` é um vocabulário paralelo.** "Cartão" não distingue
débito de crédito — exatamente a distinção que `PaymentMethod` existe para
fazer — e "Boleto" e "Transferência" não existem do lado da entrada. Quando o
Fluxo de Caixa tiver saídas (D8/D11), somar entradas e saídas por meio vai
exigir traduzir dois vocabulários.

**Editar despesa de mês fechado muda o resultado do passado.** É o mesmo
defeito que o congelamento de comissão e taxa resolveu para as entradas, e que
nunca chegou às saídas. Um aluguel corrigido em outubro reescreve o lucro de
setembro.

### O que NÃO é problema

O dono é o dono do próprio custo, e ele precisa poder corrigir um lançamento
errado. A questão não é impedir — é **registrar que houve correção**, como o
estorno faz para as entradas.

---

## 5 · Fechamento

### O que já nasce imutável

`commissions` e `payments` têm `write: false` e id derivado do fato. Nada no
produto os reescreve, e o teste "REPOSIÇÃO MAIS CARA não altera a venda
anterior" prova o mesmo para `unitCost`.

### O que é recalculado a cada leitura, e está certo

Ocupação, ticket médio, taxa de falta, projeção. São **indicadores**, não
histórico: devem refletir o estado atual.

### O que é recalculado e **não deveria ser**

| Número | Fonte | Problema |
|---|---|---|
| CMV | `movements(compra)` do período | vai passar a usar `unitCost` das vendas (D3) |
| Comissão de produto | `receita.produtos − cmv` × `policies` de **hoje** | relê a política: mudar o split reescreve meses fechados (P1-7) |
| Despesa fixa | `despesasRecorrentesVigentes` | vigência, não lançamento — **correto**, e foi corrigido em 05/08 |
| Receita de mensalista | `subscribers.status === "ativo"` | estado de hoje aplicado a qualquer período (D20) |

### A pergunta que falta responder

**Existe "mês fechado" no produto?** Não. Nada marca um período como encerrado,
e portanto nada distingue "corrigir um lançamento de ontem" de "reescrever o
resultado de um trimestre".

Isso não bloqueia a Rodada 3 — mas define se o resultado dela é auditável.

---

## 6 · Coleções mortas — 🟠 D25

| Coleção | Escrita | Leitura | Situação |
|---|---|---|---|
| `refunds` | 0 | 0 | D22 |
| `cash_entries` | 0 | 0 | **nunca teve propósito escrito** |
| `client_occurrences` | 0 | 0 | alimentaria a régua de faltas; o template `pagamento_antecipado_exigido` já existe e nada o dispara |

`cash_entries` está em `paths.ts:31`, tem regra própria e aparece na suíte de
isolamento. Nenhum documento do projeto explica o que ela guardaria — o Fluxo
de Caixa lê `bookings` e `movements`, não ela.

É a mesma classe de `inventory_movements` antes de G1: coleção declarada que
parece implementada. A diferença é que aquela tinha leitores; estas não têm
nem isso.

---

## 7 · O que isto muda na ordem da Rodada 3

Nada da ordem que você fixou muda. O que a auditoria acrescenta são **três
decisões de modelo** que precisam ser respondidas junto com D18 e D20, porque
mudam o que as fórmulas somam:

**1 · Estorno é evento novo?** Se sim, `refunds` precisa nascer nas três
origens antes de o Fluxo de Caixa existir — senão o fluxo mostra entrada sem a
saída correspondente.

**2 · Desfazer venda é reversão ou estorno?** Reversão apaga e devolve estoque;
estorno soma um evento negativo e deixa o estoque como está. As duas são
defensáveis e produzem resultados diferentes no CMV.

**3 · Despesa corrigida vira versão nova ou edição?** É a mesma pergunta que 1,
do lado da saída.

**Minha leitura:** estorno como evento novo nas três origens, e desfazer venda
como estorno com devolução explícita de estoque (movimento `kind: "ajuste"`,
que já existe no tipo e nunca foi usado). Mantém a regra que o produto já
adotou — *histórico financeiro se corrige somando, não apagando* — e evita
criar uma segunda semântica para o mesmo verbo.

Para a despesa eu **não** faria versionamento agora: o volume é baixo, o dono é
o dono do custo, e a assimetria só passa a doer quando existir fechamento de
período. Registraria como dívida consciente.

---

*Auditoria de 17/08/2026, sobre `694d8fb`. Nenhuma alteração de código.*
