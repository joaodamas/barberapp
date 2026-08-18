# Mapa de fontes — Rodada 3.2

> **Cada linha precisa provar o valor do fato E provar que nenhum outro fato
> contribui para ela.**

Escrito **antes** de tocar em `analytics.ts`. A Rodada 3.1 criou todos os fatos;
esta rodada decide quais alimentam cada linha, e prova que nenhum entra duas
vezes.

---

## 1 · O que cada linha lê HOJE

Levantado lendo `analytics.ts` linha a linha, não a documentação.

| Linha | Fonte hoje | Situação |
|---|---|---|
| Receita serviço | `bookings.value` onde `status === "completed"` | 🔴 não usa `payments` |
| Receita produto | `movements.value` onde `kind === "venda"` | 🔴 não usa `payments` |
| Receita mensalidade | `subscribers.status === "ativo"` × `price` | 🟡 fora de `bruta`; é contratado, não realizado (D20) |
| Taxas de maquininha | `payments.feeAmount` | 🟢 **já correto** |
| CMV | `movements` onde `kind === "compra"` × `value` | 🔴 compras do período, não custo do vendido (D3) |
| Comissão serviço | `commissions` congelada, com fallback | 🟢 **já correto** — é o padrão a copiar |
| Comissão produto | `lucroLoja × policies.commissionSplit.barberPct` | 🔴 relê a política de hoje (P1-7) |
| Estornos | — | 🔴 **nenhuma linha lê `refunds`** |
| Caixa sem fato | — | 🔴 **nenhuma linha lê `cash_entries`** |
| Despesas | `expenses` | 🟡 consumida, sem as garantias das outras (D24) |

---

## 2 · O padrão obrigatório — e ele já existe no repositório

`comissoesDeServico` resolveu o problema de fallback histórico do jeito certo, e
esta rodada não vai inventar outro:

```
para cada FATO no universo:
    valor = fato_materializado?.campo  ??  derivação_do_fato_original
```

Ele **itera sobre `bookings`** — o universo — e, para cada reserva, usa a
comissão congelada quando ela existe. Não soma duas coleções.

**Por que isso importa.** A forma ingênua seria:

```
receita = soma(payments)  +  soma(bookings sem payment)     ← ERRADO
```

Duas fontes somadas exigem que a exclusão entre elas esteja certa. Basta um
`PaymentDoc` cujo `bookingId` não case — id renomeado, documento órfão, migração
parcial — para o mesmo atendimento entrar duas vezes. E o erro é silencioso:
o número fica maior, que é a direção que ninguém questiona.

Iterando sobre o fato, **cada atendimento contribui exatamente uma vez por
construção**, do mesmo jeito que a exclusividade de `cash_entries` vem do enum
fechado e não de uma validação.

### A regra escrita

> **Fato novo → fonte nova. Fato histórico sem materialização → fallback
> controlado, dentro da mesma iteração.**
>
> O fallback nunca é uma segunda parcela somada. É o `??` de um único valor.

---

## 3 · O mapa de destino

| Linha | Universo iterado | Valor preferido | Fallback histórico | Nunca pode entrar |
|---|---|---|---|---|
| **Receita serviço** | `bookings` com `status === "completed"` | `payments[bookingId].grossAmount` | `booking.value` | somar `payments` à parte |
| **Receita produto** | `movements` com `kind === "venda"` | `payments[venda_movementId].grossAmount` | `movement.value` | somar `movements` e `payments` |
| **Receita mensalidade** | `subscription_invoices` com `status === "paga"` | `payments[fatura_invoiceId].grossAmount` | `invoice.amount` | `subscriptions.price` · `status === "ativo"` |
| **Taxas** | `payments` do período | `feeAmount` congelado | — | estimar por `policies.paymentFees` |
| **CMV** | `movements` com `kind === "venda"` | `unitCost × quantity` congelados | — | `products.cost` atual · somar `kind === "compra"` |
| **Comissão serviço** | `bookings` completados | `commissions[comissao_bookingId]` | derivação por `staff.commissionPct` | recálculo com política de hoje |
| **Comissão produto** | `movements` com `kind === "venda"` | `commissions[comissao_venda_movementId]` | **nenhum** — sem fato, sem comissão | `lucroLoja × política atual` |
| **Estornos** | `refunds` do período | `grossAmount` | — | apagar o pagamento original |
| **Caixa sem fato** | `cash_entries` | `amount` assinado | — | duplicar `payments` ou `expenses` |
| **Despesas** | `expenses` | `value` | — | tratar como fato congelado |

### Três decisões que a tabela carrega

**Comissão de produto não tem fallback.** Antes da Rodada 3.1 a comissão de
produto não existia como fato — era um agregado do mês derivado da política de
hoje. Um fallback aqui **restauraria o P1-7**: meses fechados voltariam a se
reescrever quando o split mudasse. Vendas antigas ficam com comissão zero, o que
é verdade — não havia comissão registrada.

Isso difere do serviço, onde a comissão congelada existe desde o Gate A e o
fallback cobre só o intervalo anterior ao gatilho.

**Estorno reduz, não apaga.** A receita realizada da linha é
`soma(fatos) − soma(refunds da mesma origem)`. O pagamento original permanece
inteiro; o estorno é subtraído à parte. Somar um "pagamento negativo" faria toda
leitura de `payments` ter de aprender a filtrar.

**CMV passa a sair da VENDA, não da compra.** É o D3, e a mudança só é possível
porque G1 congelou `unitCost` no movimento. `kind === "compra"` deixa de
alimentar o CMV e passa a alimentar só o Fluxo de Caixa (3.3) — comprar estoque
é saída de caixa, não custo do período.

---

## 4 · As provas que esta rodada exige

Não basta `DRE === R$ X`. Cada linha precisa de **duas** provas:

| # | Prova | Formato |
|---|---|---|
| 1 | **Valor** | o número sai do fato correto, com o campo congelado |
| 2 | **Exclusividade** | nenhum outro fato contribui — e o mesmo fato não entra duas vezes |

A prova de exclusividade tem uma forma concreta: montar o cenário **com** o fato
materializado e **com** o documento original, e verificar que o total é o valor
**uma vez**. Se a implementação somasse as duas fontes, o teste veria o dobro.

E a recíproca: remover o fato materializado e verificar que o total **não muda**
(fallback) ou **cai para zero** (comissão de produto), conforme a linha.

---

## 5 · O que continua fora, e por quê

**`expenses` não ganha aparência de confiabilidade.** O modelo consome despesa,
porque o DRE precisa dela — mas ela é a única das seis coleções financeiras sem
escrita de servidor, sem valor congelado, sem idempotência e sem origem
obrigatória. É o D24, e a tabela em `DECISOES-DE-MODELO.md` mantém isso visível.

Consequência prática para a 3.2: **nenhuma fórmula pode depender de a despesa
ser imutável**. Um "fechamento de mês" que assuma que o custo fixo de setembro
não muda mais estaria afirmando algo falso.

**`cash_entries` não entra no DRE.** Sangria e aporte não são receita nem
despesa — são movimento de caixa. Eles entram no Fluxo (3.3), e misturá-los ao
resultado seria a duplicidade que a Rodada 3.1 passou inteira eliminando.

---

## 6 · Resultado — a reconciliação fechou em ZERO

A massa conhecida existe desde a auditoria, com o ledger calculado **à mão** em
`LEDGER-DE-VALIDACAO.md`. Antes desta rodada o sistema divergia dele em
R$ 34,75, decompostos em quatro achados. Depois:

| linha | antes | depois | ledger |
|---|---|---|---|
| CMV | 180,00 | **116,00** | 116,00 |
| comissão de loja | 44,00 | **69,60** | 69,60 |
| taxas | 4,00 | **7,85** | 7,85 |
| imposto | 41,00 | **40,80** | 40,80 |
| **resultado** | −2.317,50 | **−2.282,75** | −2.282,75 |

**Nenhum número foi ajustado para bater.** Cada linha passou a ler o fato que a
Rodada 3.1 criou, e o encontro com o ledger é consequência.

O teste não afirma só o total: um total certo pode esconder dois erros que se
cancelam. Ele confere **linha a linha**.

### O que a massa precisou ganhar

Ela é anterior a G1 e não tinha o que o produto hoje grava. Foram acrescentados
`unitCost`/`unitPrice` nas vendas, as comissões de produto materializadas e os
pagamentos de produto — nada inventado: os três derivam de números que o ledger
humano já usava.

### Achado da verificação em tela

Na tela do Financeiro, a composição da receita somava **123%** — o denominador
era a receita líquida enquanto as linhas eram brutas — e a devolução aparecia
com **0%**, porque `safePct` clampa negativo. É o D6/P1-2 na versão percentual.

Corrigido no motor, não na tela: `composicaoDaReceita` passou a devolver o
percentual pronto, calculado sobre o bruto, com a dedução marcada. A tela
consome.

---

## 7 · Ordem de execução

```
3.2  motor financeiro
     receita (3 origens) → CMV → taxas → comissões → estornos → exclusividade
3.3  fluxo de caixa
     payments + expenses + cash_entries + compras, sem dupla contagem
3.4  reconciliação
     massa antiga × fatos reais; divergência explicada, nunca mascarada
3.5  UI/UX transversal
```
