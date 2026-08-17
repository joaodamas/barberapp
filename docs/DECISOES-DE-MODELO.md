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

**Isso vira uma decisão da Rodada 3, não um resíduo a remover:** o Fluxo de
Caixa é **derivado** dos fatos ou **materializado** em `cash_entries`? A
resposta provável é *derivado para o que tem fato, `cash_entries` para o que não
tem* — mas é decisão, e fica registrada como tal.

**Nenhuma das duas é para apagar.**

---

## O que ainda não está decidido

| # | Pergunta |
|---|---|
| — | Fluxo de Caixa: derivado, materializado, ou os dois? |
| — | Existe "mês fechado"? Sem ele, nada distingue corrigir ontem de reescrever um trimestre |
| — | Reversão de atendimento deixa rastro? Hoje apaga sem registro de quem desfez |

---

*Decisões de 17/08/2026, sobre `f93edd9`.*
