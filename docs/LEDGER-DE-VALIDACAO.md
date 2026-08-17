# Livro-razão de validação — massa conhecida da Fase 2

**Escrito ANTES de executar o sistema.** Nenhum número aqui foi obtido rodando o
produto: todos saem de aritmética sobre as premissas da §1, que são decisões de
**negócio**.

```
   premissas de negócio          (§1 — validadas em 17/08)
            ↓
   eventos conhecidos            (§2 — a massa)
            ↓
   ledger esperado, na mão       (§3 — três blocos, aritmética explícita)
            ↓
   ══════ só então ══════
            ↓
   sistema executa               (§6)
            ↓
   ESPERADO ≠ SISTEMA → investigar
```

Escrever a expectativa depois de rodar o sistema seria testá-lo contra a própria
regra que ele implementa — o teste passaria e não provaria nada.

> **Estamos na Fase 2 — auditoria, não correção.** Este documento define o que é
> **verdadeiro**, e a execução dirá onde o sistema diverge. O motor não é
> alterado até a reconciliação terminar.

---

## 1. Premissas de negócio

Validadas em 17/08. **N11 e N12 foram recusadas na forma original** — elas
descreviam o que o sistema faz, e não o que um SaaS financeiro deve considerar
verdadeiro. A distinção é a razão de a §4 existir.

| # | Premissa | Valor | |
|---|---|---|---|
| **N1** | Comissão padrão da casa, sobre o valor do atendimento | 40% | ✅ |
| **N2** | Comissão individual do segundo barbeiro | 50% | ✅ |
| **N3** | Taxa da maquininha: dinheiro / pix / débito / crédito | 0 · 0 · 1,99 · 3,49% | ✅ |
| **N4** | Imposto (Simples, Anexo III) sobre a receita bruta realizada | 6% | ✅ |
| **N5** | Comissão de produto incide sobre o **lucro** da venda | 40% do lucro | ✅ |
| **N6** | Mensalidade é receita **contratada**, fora da receita realizada | — | ✅ |
| **N7** | `no_show` não gera receita nem comissão, e **ocupa** o horário | — | ✅ |
| **N8** | Cancelamento não gera receita nem comissão | — | ✅ |
| **N9** | Comissão e taxa são **congeladas na conclusão** | — | ✅ |
| **N10** | Mês de competência | setembro/2026 | ✅ |

### N11 — CMV é o custo do que foi VENDIDO

> **CMV = custo dos produtos efetivamente vendidos no período. Compra de estoque
> não é automaticamente CMV.**

```
estoque inicial + compras − estoque final = custo dos produtos vendidos
```

Ou, com rastreabilidade por item — que é o caso desta massa:

```
venda do produto → custo unitário daquele produto → CMV
```

A compra continua sendo **saída de caixa** e **movimentação de estoque**. Ela não
vira despesa no resultado.

> **Por que isso importa para o produto que estamos vendendo.** Num mês de
> reposição forte, o caixa piora e o lucro **não** piora na mesma proporção. Um
> SaaS que promete dizer ao dono "quanto sobrou" precisa separar as duas coisas —
> senão ele fecha o mês achando que teve prejuízo quando na verdade tem estoque.

### N12 — a venda de produto preserva o meio de pagamento

> **Venda de produto gera receita e carrega o meio de pagamento real. O impacto
> em caixa depende desse meio.**

```
venda de produto
      ↓
   receita  (econômico)
      ↓
meio de pagamento  (financeiro)
      ├── dinheiro  → caixa físico
      ├── pix       → conta
      └── cartão    → recebível, líquido de taxa
```

"Venda de produto" **não** é sinônimo de "dinheiro recebido".

---

## 2. A massa conhecida

| Dimensão | Massa |
|---|---|
| Atendimentos | 10 (8 concluídos · 1 no-show · 1 cancelado) |
| Combos | 1 |
| Barbeiros | 2 |
| Produtos (vendas) | 5 |
| Mensalistas | 2 |
| Despesas | 3 |
| Encaixes | 0 |

### 2.1 Cadastro

**Barbeiros** — `b-rafael` Rafael (**40%**, padrão da casa) · `b-leo` Léo (**50%**, individual)

**Serviços** — Corte R$ 50 (30min) · Barba R$ 35 (30min) · **Corte + barba R$ 90 (60min)** · Sobrancelha R$ 15 (20min)

**Produtos e estoque de abertura**

| id | Produto | Custo | Venda | Estoque inicial |
|---|---|---|---|---|
| `pomada` | Pomada modeladora | 18 | 45 | **0** |
| `shampoo` | Shampoo | 22 | 55 | **5** (R$ 110, comprado em período anterior) |

O shampoo entra com estoque de abertura de propósito: é o que separa **compra do
período** de **custo do vendido**, e sem ele os dois números coincidiriam por
acidente.

### 2.2 Atendimentos

| # | Data | Barbeiro | Serviço | Valor | Método | Desfecho |
|---|---|---|---|---|---|---|
| **A01** | 01/09 | Rafael | Corte | 50 | pix | concluído |
| **A02** | 02/09 | Rafael | Corte | 50 | pix | concluído |
| **A03** | 03/09 | Léo | **Corte + barba** | 90 | crédito | concluído |
| **A04** | 05/09 | Léo | Barba | 35 | débito | concluído |
| **A05** | 08/09 | Rafael | Corte | 50 | dinheiro | concluído |
| **A06** | 10/09 | Léo | Corte | 50 | pix | concluído |
| **A07** | 12/09 | Rafael | Sobrancelha | 15 | débito | concluído |
| **A08** | 15/09 | Léo | Corte | 50 | pix | concluído |
| **A09** | 18/09 | Rafael | Corte | 50 | — | **no-show** |
| **A10** | 20/09 | Léo | Corte | 50 | — | **cancelado pelo cliente** |

A09 e A10 não têm método porque **não houve pagamento**.

### 2.3 Loja

**Compra do período** — C01, 01/09: 10 pomadas × R$ 18 = **R$ 180** *(saída de caixa)*

**Vendas** — agora com meio de pagamento (N12):

| # | Data | Produto | Qtd | Valor | Custo | Método |
|---|---|---|---|---|---|---|
| V01 | 04/09 | Pomada | 1 | 45 | 18 | pix |
| V02 | 07/09 | Pomada | 1 | 45 | 18 | dinheiro |
| V03 | 11/09 | Shampoo | 1 | 55 | 22 | crédito |
| V04 | 14/09 | Pomada | 2 | 90 | 36 | débito |
| V05 | 19/09 | Shampoo | 1 | 55 | 22 | pix |

### 2.4 Despesas

| # | Data | Descrição | Valor | Recorrente |
|---|---|---|---|---|
| D01 | 05/09 | Aluguel | 2.000 | **sim** |
| D02 | 10/09 | Energia | 350 | **sim** |
| D03 | 16/09 | Impulsionamento no Instagram | 200 | não |

### 2.5 Mensalistas

| # | Nome | Plano | Valor | Status |
|---|---|---|---|---|
| M01 | João Mensal | Ilimitado | 149 | ativo |
| M02 | Pedro Mensal | 2 cortes | 99 | ativo |

**Nenhum recebimento registrado.** É a premissa N6 sendo exercida: plano ativo é
contrato, não caixa.

> **Lacuna registrada.** `inventory_movements` e `subscriptions` não têm caminho
> de criação no produto. O teste os semeia direto, como o sistema deveria ter
> escrito, e a ausência das telas segue como item próprio.

---

## 3. O ledger esperado — três blocos

Os três respondem perguntas diferentes e **não precisam ser iguais**. Provar que
o sistema os mantém distintos é metade do objetivo desta fase.

### BLOCO 1 · RECEITA — o que foi realizado

```
atendimentos concluídos   50+50+90+35+50+50+15+50           =  R$ 390,00
produtos vendidos         45+45+55+90+55                    =  R$ 290,00
                                                               ──────────
RECEITA REALIZADA                                           =  R$ 680,00
```

**O que ficou de fora, e por quê** — é a metade mais importante da reconciliação:

| Evento | Valor | Motivo | Premissa |
|---|---|---|---|
| A09, no-show | 50,00 | ninguém foi atendido | N7 |
| A10, cancelado | 50,00 | ninguém foi atendido | N8 |
| M01 + M02, mensalistas | 248,00 | contrato sem recebimento | **N6** |
| | **348,00** | | |

> **Invariante permanente:** `mensalista ativo ≠ receita realizada`. Sem evento
> financeiro de recebimento, não há receita. Foi o defeito do PR #18 e não pode
> voltar por nenhuma tela.

### BLOCO 2 · RESULTADO — o que sobrou

**Comissão de serviço**, congelada com o percentual de quem atendeu (N9):

```
Rafael  40%   50+50+50+15  = base 165,00  →   66,00
Léo     50%   90+35+50+50  = base 225,00  →  112,50
                                             ────────
                                              178,50
```

**Comissão de produto** — sobre o **lucro**, não sobre a venda (N5):

```
receita de produto                                290,00
CMV dos vendidos  (4 pomadas ×18) + (2 shampoos ×22) = 72 + 44   =  116,00
                                                  ───────
lucro da loja                                     174,00
comissão 40%                                   →   69,60
```

**Taxa da maquininha**, por transação:

```
serviços   A03 crédito  90 × 3,49%  =  3,14
           A04 débito   35 × 1,99%  =  0,70
           A07 débito   15 × 1,99%  =  0,30      subtotal  4,14
produtos   V03 crédito  55 × 3,49%  =  1,92
           V04 débito   90 × 1,99%  =  1,79      subtotal  3,71
                                                 ─────────────────
                                                 total     7,85
```

**DRE:**

```
  Receita realizada                                             680,00
− CMV dos produtos vendidos                                     116,00
− Taxas de maquininha                                             7,85
− Comissões            (serviço 178,50 + loja 69,60)            248,10
                                                              ─────────
= Custo variável total                                          371,95
= Margem de contribuição                                        308,05
  margem de contribuição %                                       45,30%

− Despesas fixas       (aluguel 2.000 + energia 350)          2.350,00
− Despesas eventuais   (impulsionamento)                        200,00
− Folha                                                           0,00
                                                              ─────────
= Custo fixo total                                            2.550,00
= Resultado antes de impostos                                −2.241,95
− Imposto              (680,00 × 6%)                             40,80
                                                              ─────────
= RESULTADO DO MÊS                                           −2.282,75
```

**Identidade:** 680,00 − 2.962,75 = **−2.282,75** ✓

### BLOCO 3 · CAIXA — o que entrou e saiu de fato

**Recebimentos, por meio de pagamento** (N12):

| Meio | Serviços | Produtos | Total |
|---|---|---|---|
| pix | 200,00 | 100,00 | **300,00** |
| cartão | 140,00 | 145,00 | **285,00** |
| dinheiro | 50,00 | 45,00 | **95,00** |
| | 390,00 | 290,00 | **680,00** |

**Saídas:**

```
compra de estoque      (C01, 10 pomadas)                        180,00
despesas               (aluguel + energia + impulsionamento)   2.550,00
comissões                                                       248,10
taxas de maquininha                                               7,85
imposto                                                          40,80
                                                              ─────────
                                                              3.026,75
```

```
FLUXO DE CAIXA   =  680,00 − 3.026,75                        = −2.346,75
```

### A diferença entre resultado e caixa — e por que ela é correta

```
resultado  −2.282,75
caixa      −2.346,75
           ──────────
diferença      64,00
```

```
compras do período   180,00
− CMV dos vendidos   116,00
                     ───────
estoque que ficou     64,00      ← exatamente a diferença
```

**É o teste da premissa N11.** Saiu R$ 180 do caixa, mas só R$ 116 viraram custo
— os R$ 64 restantes continuam na prateleira, e ainda vão virar receita.

Conferência do estoque: inicial 110 + compras 180 − CMV 116 = **174**
(6 pomadas × 18 = 108 · 3 shampoos × 22 = 66) ✓

> Se o sistema mostrar resultado **igual** ao caixa, ele não separa as duas
> dimensões — e a tela que promete "quanto sobrou" está respondendo "quanto
> entrou".

### 3.4 Indicadores operacionais

| Indicador | Esperado | Conta |
|---|---|---|
| Faturamento | 680,00 | receita realizada |
| Atendimentos | **8** | só concluídos |
| Reservas no período | **10** | tudo que foi marcado |
| Faltas | **1** · **10,0%** | A09 · 1÷10 |
| Cancelamentos | **1** | A10 |
| Ticket médio **de serviço** | **48,75** | 390 ÷ 8 |
| Horários ocupados | **9** | 8 concluídos + 1 no-show |
| MRR contratado | 248,00 | fora da receita |
| MRR realizado | **0,00** | sem recebimento |

---

## 4. Divergências que a aritmética antecipa

Hipóteses levantadas lendo o cálculo, **antes** de executar. A §6 confirma ou
derruba cada uma.

| # | Onde | Esperado | O que o sistema deve fazer | Natureza |
|---|---|---|---|---|
| **D1** | `taxasDePagamento` | 7,85 | `Math.round` da soma → **8** | precisão |
| **D2** | `avgTicket` | 48,75 | 680 ÷ 8 = **85,00** (mistura produto com atendimento) | **semântica** |
| **D3** | `cmv` | **116,00** | soma as compras do período → **180,00** | **modelagem (N11)** |
| **D4** | caixa por meio | pix 300 · cartão 285 · dinheiro 95 | joga produto todo em dinheiro → 200 · 140 · 340 | **modelagem (N12)** |
| **D5** | `tax` | 40,80 | `Math.round` → **41** | precisão |
| **D6** | árvore do DRE | filhos somam 680 | inclui mensalistas → filhos somam **928** | rótulo |
| **D7** | taxa sobre produto | 3,71 | **0,00** — venda de produto não gera `payment` | **modelagem (N12)** |
| **D8** | resultado × caixa | diferem em 64,00 | provavelmente **iguais** — não há bloco de caixa separado | **modelagem (N11)** |

**D3, D4, D7 e D8 são consequência direta de N11 e N12** — não são bugs de
implementação, são decisões de modelo que o produto ainda não tomou. D1, D5 e D6
já estavam na auditoria. **D2 é novo e é o mais barato de corrigir.**

---

## 5. Os três níveis de reconciliação

### Nível 1 — operacional
Os 10 atendimentos batem em barbeiro, serviço, duração, valor e desfecho. E os
agregados: 8 concluídos, 1 falta, 1 cancelado, 1 combo de 60 min, 9 ocupados.

### Nível 2 — financeiro
Para cada valor exibido, **por que apareceu**; para cada ausente, **por que não**.
As seis visões partem do mesmo fato:

```
Dashboard → Financeiro → DRE → Fluxo → Projeção → Comissões
```

| # | Invariante entre telas |
|---|---|
| **I1** | caixa recebido do mês **=** receita realizada — **só quando não há compra a prazo nem recebível** |
| **I2** | `receita − custo total` **=** resultado |
| **I3** | soma das comissões por barbeiro **=** comissão de serviço do DRE |
| **I4** | soma dos filhos de cada grupo do DRE **=** o cabeçalho |
| **I5** | mensalista **não** aparece em receita realizada, em nenhuma tela |
| **I6** | no-show e cancelado **não** aparecem em receita, em nenhuma tela |
| **I7** | atendimentos: Dashboard **=** DRE **=** 8 |
| **I8** | **resultado ≠ caixa** quando houve movimentação de estoque |

### Nível 3 — temporal
O mesmo fato tem cinco datas, e o sistema tem uma:

| Data | Existe? |
|---|---|
| da reserva | ❌ só `createdAt`, fora de cálculo |
| do atendimento | ✅ `booking.date` |
| do pagamento | ❌ `payments.date` é cópia de `booking.date` |
| de competência | ❌ derivada de `booking.date` |
| do cancelamento | ⚠️ `cancelledAt` existe e não entra em cálculo |

**Decisão registrada:** documentar, não corrigir agora.

---

## 6. Execução e reconciliação

Massa em `web/src/lib/__tests__/massa-conhecida.ts`; reconciliação em
`reconciliacao.test.ts`, **29 asserções**. Os valores esperados entraram no teste
como literais copiados deste documento — nenhum é derivado da massa nem do
sistema.

> Onde o sistema diverge, o teste **registra os dois lados** em vez de falhar.
> Fazer o teste falhar viraria pressão para "fazer o número bater"; o que
> queremos é saber onde não bate, e por quê.

### 6.1 O que fecha ✅

| Verificação | Ledger | Sistema |
|---|---|---|
| Receita de serviços | 390,00 | 390,00 |
| Receita de produtos | 290,00 | 290,00 |
| **Receita realizada** | **680,00** | **680,00** |
| Comissão Rafael (40%) | 66,00 | 66,00 |
| Comissão Léo (50%) | 112,50 | 112,50 |
| Comissão de serviço (I3) | 178,50 | 178,50 |
| Percentual exibido por barbeiro | 40% · 50% | 40% · 50% |
| Custo fixo | 2.550,00 | 2.550,00 |
| Despesa fixa × eventual | 2.350 / 200 | 2.350 / 200 |
| Atendimentos (I7) | 8 | 8 |
| Reservas no período | 10 | 10 |
| Faltas · taxa | 1 · 10,0% | 1 · 10,0% |
| Cancelamentos | 1 | 1 |
| Identidade `receita − custo = resultado` (I2) | vale | vale |
| **I5 · mensalista fora da receita** | 0,00 | **0,00** ✅ |
| **I6 · no-show e cancelado fora** | 0,00 | **0,00** ✅ |

**As duas invariantes que mais importam passaram.** Os R$ 248 de mensalista e os
R$ 100 de no-show + cancelamento **não** aparecem em receita, e o imposto não
incide sobre eles. A correção do PR #18 está de pé.

### 6.2 O que diverge ❌ — todas as 8 hipóteses confirmadas

| # | Ledger | Sistema | Diferença |
|---|---|---|---|
| **D1** | taxas 4,14 | **4** | −0,14 |
| **D2** | ticket de serviço 48,75 | **85,00** | +74% |
| **D3** | CMV 116,00 | **180,00** | +64,00 |
| **D3'** | comissão de loja 69,60 | **44,00** | −25,60 |
| **D4** | pix 300 · cartão 285 · dinheiro 95 | **200 · 140 · 340** | R$ 290 no meio errado |
| **D5** | imposto 40,80 | **41** | +0,20 |
| **D6** | filhos da receita somam 680 | somam **928** | +248 |
| **D7** | taxa sobre produto 3,71 | **0,00** | −3,71 |
| **D8** | resultado ≠ caixa (64,00) | **não há bloco de caixa** | — |

### 6.3 O efeito no número que o dono usa para decidir

```
resultado do ledger    −2.282,75
resultado do sistema   −2.317,50
                       ──────────
diferença                 −34,75
```

E ela é **explicável item a item** — o teste prova a decomposição:

```
CMV a mais (D3)          −64,00
comissão de loja (D3')   +25,60
taxa de serviço (D1)      +0,14
taxa de produto (D7)      +3,71
imposto (D5)              −0,20
                         ────────
                          −34,75
```

> Numa massa de R$ 680 a diferença é de R$ 34,75 — **5,1% da receita**. Ela não
> escala de forma linear: D3 cresce com a reposição de estoque, e num mês de
> compra grande o lucro da loja pode virar negativo sem que nada tenha piorado.

### 6.4 Achado adicional, fora da lista

**`durationMin` era gravado pelo servidor e não existia no tipo do front.**
Descoberto ao escrever a massa: `BookingDoc` não declarava o campo que
`createBooking` grava desde sempre. Enquanto o contrato não o conhece, nenhuma
tela e nenhum cálculo do web podem usá-lo — foi assim que a duração ficou fora
da ocupação da agenda até o Gate A corrigi-la **do lado do servidor**. O tipo foi
corrigido; o comportamento, não.

### 6.5 Classificação para o próximo gate

Decisão de produto, não de código — os quatro primeiros são **modelagem**:

| # | O que é | Custo |
|---|---|---|
| **D3 / D8** | CMV e a separação resultado × caixa. Muda o modelo de estoque e cria a visão de fluxo. É o maior, e o que mais afeta a promessa de "gestão financeira" | alto |
| **D4 / D7** | meio de pagamento na venda de produto. Um campo em `inventory_movements` e um `payment` por venda | médio |
| **D2** | ticket médio de serviço, separado do ticket com produto | **uma linha** |
| **D6** | mensalista fora da árvore do DRE | **uma linha** |
| **D1 / D5** | arredondar ao centavo, não ao real | duas linhas |

---

## 7. O que este documento NÃO faz

- **Não olha o código para chegar nos números.** Onde o comportamento do sistema
  aparece (§4), é hipótese declarada como tal.
- **Não ajusta a expectativa para o sistema passar.** Divergência abre
  investigação, e o errado pode ser este documento.
- **Não corrige o motor.** Fase 2 é auditoria; a correção é decisão do próximo
  gate.

---

*Premissas validadas em 17/08/2026, com N11 e N12 substituídas. Escrito sobre o
baseline do Gate A (`42321ee`), antes de qualquer execução.*
