# Decisões de modelo — Fase 3

> Decisões fechadas pelo dono do produto, com o que cada uma implica. Este
> arquivo é a fonte: quando a implementação divergir daqui, a implementação está
> errada.

---

## D18 · Serviço coberto por plano ilimitado → **opção B**

**A regra.** O atendimento de mensalista mantém valor econômico operacional e
**não gera segunda receita realizada**.

```
BOOKING do mensalista · valor R$ 50
   ├── ocupação           SIM
   ├── produção da cadeira SIM
   ├── comissão            SIM
   ├── ticket operacional  SIM
   └── receita no DRE      NÃO
```

**Como.** Uma marca explícita **no fato**, conceitualmente
`includedInSubscription: true`, gravada no momento da criação da reserva.

**O que fica proibido.** Descobrir isso retrospectivamente cruzando plano +
booking + assinatura no `analytics`. O fato carrega a decisão que valia naquele
momento — se o cliente cancelar o plano em novembro, o corte de setembro não
pode mudar de natureza.

**Também fica proibido** zerar `value` no booking. Isso apagaria a comissão do
barbeiro, o ticket e a produção da cadeira junto com a receita.

**Teste obrigatório.** Mensalista paga R$ 149 + dois cortes de R$ 50 → o DRE
**não** pode mostrar R$ 249 de receita. E os R$ 100 **continuam** existindo para
comissão e ocupação.

---

## D20 · Receita realizada de mensalista → **fatura efetivamente paga**

```
CONTRATADO                        REALIZADO
subscription.status === "ativo"   subscription_invoice.status === "paga"
        ↓                                 ↓
     MRR / projeção              pagamento → receita realizada
```

**A regra que isto implementa**, já extraída na auditoria:

> **Contratado projeta. Realizado fatura/pagamento.**

**O que isto resolve.** Os R$ 248 deixam de ser derivados de uma caixinha
marcada, sem destruir a informação de MRR — que continua existindo, com nome
próprio, em outro lugar.

**O que isto NÃO é.** Não é trocar uma linha de `status === "ativo"` por uma
consulta de faturas pagas. A árvore financeira inteira precisa estar definida
antes, porque a mesma troca muda receita, imposto e margem.

---

## D22 · Estorno → **evento novo, nas três origens**

**A regra.** Nunca apagar o fato original.

```
fato original    permanece, auditável
      ↓
refund           evento novo, dinheiro devolvido
      ↓
realizado        reduzido pelo evento, não pela remoção
```

Vale igual para **atendimento**, **produto** e **mensalidade**.

**Consequência para o atendimento.** `bookings.refundedAmount` deixa de ser
informação solta e passa a ter lastro financeiro — hoje o produto calcula a
devolução corretamente e a grava num campo que nenhuma linha lê.

**Por que evento e não edição.** O comentário de `decidirEfeito` já dizia:
*"histórico financeiro se corrige somando, não apagando"*. A decisão apenas
torna verdadeira uma regra que o produto afirmava e não cumpria.

---

## D23 · Desfazer venda → **estorno + ajuste de estoque**

```
venda original      permanece no histórico
      ↓
refund              devolução financeira
      ↓
movimento ajuste    devolve as unidades ao estoque
```

**Usa `kind: "ajuste"`**, que já existe em `TipoDeMovimento` e nunca foi
gravado. Inventar uma segunda semântica para o mesmo verbo seria criar o
problema que esta auditoria passou a Fase 3 inteira desfazendo.

**O pagamento original permanece.** O estorno representa a devolução; somá-los
dá o líquido. Apagar o pagamento faria a taxa de maquininha sumir junto — e a
maquininha cobrou.

---

## O que a implementação de D22/D23 decidiu além do desenho

Quatro perguntas que só apareceram ao escrever o código. Ficam aqui porque
mudam o que o produto afirma, não só como ele funciona.

### N13 · A taxa da maquininha **não volta**

O estorno grava `feeAmount: 0` e devolve o **bruto**. A adquirente reteve a
taxa quando o dinheiro entrou; devolvê-lo ao cliente não a traz de volta.

O efeito é que o par se resolve sem campo especial:

```
pagamento   +43,43 líquido   (bruto 45,00 − taxa 1,57)
estorno     −45,00
──────────────────────────
saldo        −1,57           = exatamente a taxa perdida
```

**Nenhuma fórmula da Rodada 3.2 precisa saber que houve estorno para chegar
nesse número.** É o teste de um fato bem posto: a perda emerge da soma.

### O estorno **não substitui** o `delete` que já existe

`decidirEfeito` apaga `payments` e `commissions` quando uma reserva sai de
`completed` para um estado operacional. Isso continua certo e **precisa
continuar existindo**: ali o dono marcou como concluído por engano, o
atendimento **não aconteceu**, e o fato nunca deveria ter nascido.

```
marcação errada   →  o fato não existiu   →  delete é correção
atendimento real  →  o fato existiu       →  estorno, e o original fica
```

Apagar o que não ocorreu é correção; apagar o que ocorreu é perda de
histórico. São três casos, não dois, e o estorno é o terceiro.

### Comissão: **produto reverte, serviço não**

| origem | comissão | por quê |
|---|---|---|
| **produto** | reverte (linha negativa) | a mercadoria voltou para a prateleira — não houve venda |
| **serviço** | **não muda** | o atendimento aconteceu e o barbeiro trabalhou |
| mensalidade | não existe | — |

Descontar o barbeiro por um estorno de serviço transformaria uma decisão
comercial da barbearia em desconto no acerto de outra pessoa. Quem quiser
descontar faz isso no acerto, conscientemente. **A tela diz isso antes de
confirmar**, em vez de deixar o dono descobrir no fim do mês.

A reversão de produto **recalcula** com a quantidade devolvida e o percentual
congelado no documento original — nunca nega o valor cheio (quebraria o
parcial) nem relê o cadastro do barbeiro (recriaria o P1-7 na porta de saída).

### A fatura de mensalidade continua **paga**

Ela FOI paga. Reabri-la apagaria a informação de que houve pagamento — a mesma
correção-por-apagamento que esta rodada recusa. O estorno é o segundo fato.

---

## D24 · Despesa → **dívida consciente, registrada**

**Não** haverá versionamento de despesa nesta rodada.

**O que fica registrado, e precisa aparecer no produto:**

> Despesa é editável e o produto **não tem fechamento de período**. Enquanto
> isso for verdade, **o sistema não pode prometer contabilidade histórica
> imutável.**

Isso não é só nota interna: se alguma tela ou texto sugerir que o histórico é
imutável, a frase é falsa e entra na mesma categoria de D14.

**Dívida de UI/UX registrada:** normalizar a apresentação de
`ExpenseDoc.payment` (`"Pix" | "Boleto" | "Cartão" | "Transferência"`) para o
vocabulário de `PaymentMethod`, **sem alterar o contrato agora**.

---

## D25 · `cash_entries` e `client_occurrences` → **investigado, e não são resíduo**

A pergunta era se pertencem ao produto. **Pertencem, e o PRD as descreve.**

### `client_occurrences` — produto previsto, não implementado

PRD §13:

> *"falta/cancelamento tardio sem pagamento antecipado, **usada para acionar a
> exigência automática de pagamento**"*

E `ACTION-CENTER-CONTRATO.md` a coloca no Bloco 3, junto da entidade Cliente —
que **agora existe** (G3). O template `pagamento_antecipado_exigido` já está no
catálogo e nada o dispara.

**Classificação:** gap de produto, Bloco 2. Não é para remover.

### `cash_entries` — é a peça do livro caixa

PRD §11 descreve o livro caixa com todas as entradas e saídas, e §13 lista
`cash_entries (fluxo de caixa)`.

E há uma razão pela qual ela não pode ser substituída por derivação: **existem
movimentos de caixa sem outro fato por trás** — sangria, troco inicial, aporte
do dono, pagamento de comissão ao barbeiro. Nenhum deles é atendimento, venda,
mensalidade ou despesa; nenhum é derivável.

**Nenhuma das duas é para apagar.** A pergunta que restava — derivado ou
materializado — está respondida na decisão seguinte.

---

## Fluxo de Caixa → **híbrido**

Nem tudo derivado, nem tudo materializado.

**Derivado**, porque tem lastro próprio: atendimento, venda, mensalidade,
despesa, compra de estoque, estorno.

**Materializado em `cash_entries`**, porque **não tem outro fato por trás**:
sangria · troco inicial · aporte do dono · pagamento de comissão ao barbeiro ·
ajuste manual de caixa.

```
Fluxo de Caixa = fatos financeiros derivados
               + movimentos de caixa independentes
```

Preserva auditabilidade sem criar uma segunda cópia de tudo — materializar o
que já é derivável abriria a possibilidade de as duas versões divergirem, que é
o defeito que esta auditoria passou a fase inteira desfazendo.

**`cash_entries` herda as mesmas exigências de G1/G2:** fato explícito, origem
clara, valor congelado e idempotência quando aplicável.

---

## Fechamento de período → **distinção mínima, agora**

Não vira módulo contábil. Precisa de duas situações:

| | |
|---|---|
| **Aberto** | opera e corrige conforme as regras de cada fato |
| **Fechado** | não se reescreve silenciosamente |

> **Depois do fechamento, o passado não é editado. O presente corrige o passado
> por meio de um novo fato.**

Conversa diretamente com D22 e D23: a correção depois do fechamento **é** o
estorno.

---

## Rastro de reversão → **nunca DELETE, nunca UPDATE disfarçado**

Proibido:

```
venda            → DELETE
pagamento        → DELETE
despesa antiga   → UPDATE para fingir que nunca existiu
```

Obrigatório:

```
FATO ORIGINAL
     └── REVERSÃO / ESTORNO
              └── novo fato financeiro
```

Para venda:

```
Venda R$ 90  →  Estorno R$ 90  →  Ajuste de estoque +2
```

**O critério de aceitação:** o produto precisa conseguir responder *"por que o
faturamento daquele dia caiu R$ 90?"* — e a resposta é um evento, não um buraco.

### Consequência sobre o que existe hoje

`decidirEfeito` **apaga** `comissao_{bookingId}` e `pagamento_{bookingId}` ao
desfazer uma conclusão. Isso passa a ser **exceção documentada** — correção de
digitação num fato que nunca existiu — e não o padrão. Tudo que já produziu
efeito econômico se corrige somando.

---

## O que ainda não está decidido

| # | Pergunta |
|---|---|
| — | O que exatamente marca um período como fechado, e quem fecha |
| — | Reversão de digitação deixa rastro de quem desfez? |

---

*Decisões de 17/08/2026, sobre `f93edd9`.*
