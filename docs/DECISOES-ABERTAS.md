# As cinco decisões abertas

> 18/08/2026 · `hardening/p0-2026-08-17` em `867b070`
> Nenhuma delas é técnica. Todas mudam **o que o produto afirma**, e por isso
> nenhuma pode ser tomada por um agent.

Este documento existe para tornar a decisão barata: cada uma traz o que foi
medido no código, as opções com o custo real de construir, e o que quebra se
errarmos. As recomendações são recomendações — o dono decide.

---

# GRUPO A · R1 — correção do meio de pagamento

## Contexto comum: o R1 não abre um caminho, ele fecha um vazamento

Antes de decidir qualquer coisa, o fato que a investigação mediu:

**O caminho de correção já existe e está em produção.** O card crítico
*"Registrar pagamento"* (`action-center.ts:117`) reabre o modal de conclusão
(`page.tsx:316`), que grava `bookings.paymentMethod` (`page.tsx:221`). A reserva
já está `completed`, então `decidirEfeito` devolve `"nada"`
(`financial-events.ts:284`) e **o gatilho não faz nada**.

Resultado hoje, sem nenhuma decisão tomada:

```
bookings/{id}.paymentMethod       "pix"   ✅  a agenda passa a mostrar Pix
payments/pagamento_{id}.method    null    ❌
payments/…feePct · feeAmount      0 · 0   ❌  DRE, Fluxo e Caixa leem daqui
```

E o filtro do card é `!b.paymentMethod` — então **o alerta desaparece**. O
produto declara o problema resolvido no instante em que ele deixa de ser
resolvível pela interface, depois de prometer por escrito que *"a taxa da
maquininha entra como zero e o lucro do mês fica maior do que é"*.

**Consequência para a decisão:** não decidir também é uma escolha, e é a pior
das disponíveis. O vazamento roda hoje.

---

## R1.1 · Qual taxa usar na correção

### O que foi medido, e muda a pergunta

`PaymentDoc` guarda **apenas o `feePct` do método antigo** — não a tabela. Para
calcular a taxa do método novo é preciso uma tabela de taxas.

E aqui está o achado que decide o custo: **não existe tabela histórica.**
`GatewayFeeDoc` com `validFrom` existe em `domain.ts:590`, e tem **zero
consumidores** — é um tipo órfão. As taxas reais vivem em
`policies.paymentFees`, um objeto único, sem histórico, sobrescrito a cada
edição.

⚠️ **Achado colateral, e é um defeito:** a tela do Financeiro afirma ao dono que
*"as taxas são versionadas por data de vigência e não afetam transações já
registradas"* (`financeiro/page.tsx:308`). A segunda metade é verdade — a taxa
congela no `PaymentDoc`. **A primeira descreve um mecanismo que não existe.**

### As opções, com o custo real

| | Desenho | Custo | Consequência |
|---|---|---|---|
| **A** | tabela de hoje | **zero** — já disponível | Corrigir em setembro um fato de agosto aplica a taxa de setembro. Contradiz `payments.ts:61` e o teste `financial-events.test.ts:233` |
| **B** | preservar a taxa da data original | **alto** — exige construir o versionamento que o tipo órfão sugere que foi planejado. **Não resolve o histórico já gravado**, que não tem a tabela | Correto, e é a promessa que a tela já faz |
| **C** | recusar quando a taxa mudou desde a conclusão | baixo — comparar `feePct` gravado com a tabela atual | Conservador. O dono não entende por que o produto se recusa |

### Recomendação: **A, com a correção do texto da tela**

A janela em que A erra é estreita: só quando o dono muda a taxa da maquininha
**e** corrige um pagamento anterior. B custa uma frente inteira para cobrir esse
caso e **ainda assim não conserta o passado**, onde o dado não existe.

Mas A só é honesta se a tela parar de prometer versionamento. **Se você preferir
B, ela é a única que honra o texto que já está lá** — e aí o versionamento entra
como frente própria, não como parte do R1.

---

## R1.2 · Até quando o dono pode corrigir

### O que foi medido

Não existe conceito de **mês fechado** no produto — já registrado em
`AUDITORIA-CICLO-DE-VIDA-FINANCEIRO.md`: *"nada distingue 'corrigir um lançamento
de ontem' de 'reescrever o resultado de um trimestre'."*

Dois fatos que reduzem o susto:

1. **A correção não move o fato de mês.** `PaymentDoc.date` não muda, e toda
   filtragem de período é por `date`. Um Pix de janeiro corrigido em dezembro
   continua em janeiro.
2. **O único número que se move é `feeAmount`** → `gatewayFees` → margem e
   resultado daquele mês. Receita, CMV, comissão e imposto **não mudam** — o
   imposto incide sobre bruto, e o bruto não muda.

Ou seja: o pior caso é o resultado de um mês antigo mudar pelo **delta de uma
taxa**, tipicamente alguns reais.

### As opções

| | Janela | Consequência |
|---|---|---|
| **A** | qualquer momento | Simples. Resultado de mês antigo pode mudar sem aviso |
| **B** | só o mês corrente | Alinha com o horizonte que o dono enxerga nas telas — todas são "do mês" |
| **C** | N dias | Número arbitrário que ninguém vai lembrar de justificar |

### Recomendação: **B — o mês corrente**

Não por rigor contábil, e sim porque **é a janela que o produto já usa em todo
lugar**: DRE, Fluxo, Despesas e Mensalistas são todos "do mês". Uma correção
fora dela é uma operação que nenhuma tela mostra.

E é reversível: começar restritivo e afrouxar é fácil; o contrário exige explicar
ao dono por que ele perdeu uma capacidade.

---

## R1.3 · Corrigir é alterar o fato ou somar um novo?

**A decisão mais importante das cinco**, e a única em que a doutrina do
repositório e a régua do dono apontam para lados opostos.

### A tensão, literal

`refunds.ts:30-39` declara a regra da casa:

> *"Corrigir histórico é somar fatos, nunca apagar."*

E a régua que você definiu para o R1 exige:

> *"Pix → dinheiro: pagamento corrigido, **NÃO duplicado**."*

As duas só se reconciliam se o "fato novo" for um **ajuste que todo leitor sabe
somar**. E aí está o custo.

### O custo real de cada desenho

| | Desenho | Leitores a mudar | Rastreabilidade |
|---|---|---|---|
| **A** | `update` no mesmo `pagamento_{bookingId}` | **zero** | Só via `audit_log` |
| **B** | fato de ajuste novo, com id próprio | **seis**: `taxasDePagamento`, `caixaDoDia`, `caixaDiario`, `movimentosDeCaixa`, `receitaDeServico`, `receitaDeProduto` | No próprio dado |

A assimetria é grande e vale explicar de onde vem: **não existe nenhum agregado
pré-computado no produto.** Nenhum snapshot mensal, nenhum contador, nenhum
documento de fechamento — verificado. Todo número é recalculado do zero a cada
render. Por isso `update` propaga sozinho para 100% das telas, e um fato de
ajuste obriga seis leituras a aprender a netar.

E há um risco específico do desenho B que o estorno não tem: o estorno é um
**evento econômico real** (dinheiro voltou), então somá-lo é natural. Uma
correção de rótulo não é evento econômico — o dinheiro entrou uma vez só. Um
"pagamento de ajuste de −R$ 1,75 de taxa" é um fato que nunca aconteceu no
mundo.

### Recomendação: **A, com `audit_log` obrigatório**

Com três travas que tornam a exceção segura:

1. **`update`, nunca `set` sem merge nem `delete`+`create`** — o `delete` faria
   `comissoesDeServico` cair no cadastro de hoje e ressuscitar o P1-7 em todo o
   histórico.
2. **Só quatro campos podem ser tocados**: `paymentMethod`, `feePct`,
   `feeAmount`, `netAmount`. `grossAmount`, `date`, `createdAt` e a identidade
   sobrevivem por não serem escritos.
3. **`audit_log` com de/para, quem e quando.** Hoje **a conclusão de um
   atendimento não escreve `audit_log` nenhum** — o evento que materializa
   dinheiro não deixa rastro. O R1 é o lugar certo para isso começar.

Se você preferir B por princípio, é defensável — mas então ela precisa ser uma
frente própria, com as seis leituras no escopo, e não um item dentro do R1.

---

# GRUPO B · Mensalista no `/agendar`

## A contradição, medida na tela

Com um cliente que **é** mensalista Ilimitado, o passo 3 mostra, ao mesmo tempo:

```
Você é mensalista · Ilimitado
"O que estiver incluído NÃO É COBRADO DE NOVO no salão"

  card do serviço      Total            R$ 50,00
  resumo               Corte            R$ 50,00
  resumo               30 min           R$ 50,00
  resumo               Pagamento        No salão
  política             "entre 24h e 6h: retemos 25% de taxa"
```

O card está certo. As quatro linhas ao redor dele dizem o contrário, a 40px de
distância.

---

## N7.1 · Como apresentar o preço para quem tem plano

### ⚠️ A armadilha que precisa entrar na decisão

**A tela não sabe se ESTE atendimento está coberto.** Quem decide é o
fechamento, no servidor, com a cota do mês (`decidirCobertura`). Para o plano
**Ilimitado** a resposta é sempre sim; para um plano com cota
(`servicesIncluded`), o 5º corte de um plano de 4 **é cobrado**.

Mostrar `Total R$ 0,00` a quem está na cota 5 seria a tela afirmando cobertura
que não existe — a mesma classe de defeito do D1, onde o web dizia 40% e o fato
nascia 0. Qualquer opção escolhida precisa ser **condicional ao tipo de plano**,
ou redigida como expectativa e não como fato.

### As opções

| | Apresentação | Avaliação |
|---|---|---|
| **A** | `Valor: R$ 0,00 · Pagamento: coberto pelo plano` | Esconde o valor econômico do benefício. O cliente esquece o que o plano vale |
| **B** | `Valor original R$ 50,00 · Coberto pelo plano −R$ 50,00 · Total R$ 0,00` | Mostra o benefício sem dizer que o corte custa zero |

### Recomendação: **B — e ela é consistente com o produto**

A sua preferência coincide com um **padrão que o produto já provou**: é
exatamente a forma da árvore do DRE, onde a devolução aparece como linha
assinada em vez de sumir do total (`Pomada 3 un. R$ 54,00 / Devolução −R$ 18,00
/ CMV R$ 36,00`). Usar a mesma gramática no lado do cliente é reforçar
identidade, não inventar uma.

Com duas condições, pela armadilha acima:

- **plano ilimitado** → pode afirmar a dedução;
- **plano com cota** → mostrar a posição (*"3 de 4 usados este mês"*) e não
  afirmar o total antes do fechamento.

E o resumo lateral precisa acompanhar: `Pagamento: No salão` vira algo como
`Coberto pelo plano`.

---

## N7.2 · Reembolso quando não houve pagamento

### O que foi medido

O passo 3 mostra a política de cancelamento **incondicionalmente** — inclusive
para quem não vai pagar nada. E `reservas/page.tsx` **já tem a frase certa** para
o caso `sem_pagamento`; o `/agendar` é que não a usa.

### Recomendação: **exatamente a sua formulação**

> *"Este atendimento foi coberto pelo plano e não possui valor pago para
> reembolso."*

E o sistema **não cria estorno financeiro** — coerente com o que o servidor já
faz, já que não existe `PaymentDoc` a estornar.

### Uma precisão a acrescentar

A regra é **por fato, não por visita**. Um mensalista que teve o corte coberto e
comprou uma pomada tem **dois** fatos: o corte sem pagamento e a venda com
pagamento. Cancelar a visita não pode arrastar a venda — ela tem estorno próprio,
que já funciona e está verificado.

---

# Resumo para decidir

| # | Decisão | Recomendação | Custo se adiar |
|---|---|---|---|
| **R1.1** | taxa na correção | **A** (tabela de hoje) + corrigir o texto da tela | o vazimento continua rodando |
| **R1.2** | janela | **B** (mês corrente) | idem |
| **R1.3** | alterar × somar | **A** (`update` + `audit_log`) | idem |
| **N7.1** | preço do mensalista | **B** (valor − dedução = total), condicional ao tipo de plano | contradição visível ao cliente no piloto |
| **N7.2** | reembolso de cobertura | sua formulação, por fato e não por visita | idem |

**Três achados que saíram desta análise e não estavam em lista nenhuma:**

1. O caminho de correção **já existe e vaza** — não decidir mantém o defeito.
2. A tela do Financeiro promete **versionamento de taxa que não existe**;
   `GatewayFeeDoc` é tipo órfão.
3. **A conclusão de um atendimento não escreve `audit_log`.** O evento que
   materializa dinheiro é o único sem rastro.
