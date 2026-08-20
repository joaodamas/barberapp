# R1 · Caso 2 — divergência de meio de pagamento

> Auditoria **somente leitura**. Nenhum arquivo de código, teste, regra ou
> script foi tocado. Nada foi executado — sem suíte, sem typecheck, sem build,
> sem emulador.
>
> Marcação: **[Ó]** lido no código · **[J]** julgamento · **[NV]** não verificado.

---

# 1 · Commit-base

```
nasci em      659091a   (main)
merge --ff-only hardening/p0-2026-08-17
HEAD          3f460e2   docs(changelog): 18/08 — o R1, e o dia em que a pergunta mudou três vezes
R1 mergeado   a9c5eca   (ancestral de 3f460e2)
```

Lidos antes de qualquer investigação: `docs/R1-BRIEFING.md`,
`docs/AUDITORIA-R1-N7.md`, `docs/DECISOES-ABERTAS.md`. Também
`docs/R1-DECISOES-ENCONTRADAS.md` (doc do repositório, mergeado em `a9c5eca`) e
`docs/ACTION-CENTER-CONTRATO.md`.

`docs/agent-reports/` **não existia** neste commit — foi criado por mim para
este arquivo. Nenhum relatório de outro agent foi aberto.

⚠️ **As linhas do enunciado são pré-R1.** O `a9c5eca` deslocou
`web/src/lib/action-center.ts`. As correspondências:

| enunciado | hoje |
|---|---|
| `action-center.ts:117` (filtro do card) | **`action-center.ts:132`** |
| `action-center.ts:290-318` (taxas não configuradas) | **`action-center.ts:313-341`** |
| `action-center.ts:301` | **`action-center.ts:324`** |

Todas as citações abaixo são do commit `3f460e2`.

---

# 2 · A causa — por que o produto não sabe

Em uma frase:

> **Todo registro de meio de pagamento no produto desce de uma única digitação
> humana, e não existe nenhuma segunda origem contra a qual compará-la.**

O caso 1 (vazio) é detectável porque a ausência é um fato do sistema: o campo
está nulo, e nulo é observável. O caso 2 (errado) não é detectável porque o
campo está preenchido — e o produto não tem, em lugar nenhum, um segundo
registro do mesmo evento nascido de fora do balcão.

Não é lacuna de tela. É propriedade da arquitetura de dados: o meio de pagamento
entra no sistema por um `<select>` e sai dele por cópia. Toda "segunda opinião"
que o produto parece ter é, quando puxada até a origem, a **mesma** digitação
reaparecendo.

```
dono escolhe no modal
       ↓
bookings.paymentMethod          (a digitação)
       ↓ trigger
payments.paymentMethod          (cópia da digitação)
       ↓ derivado
feePct · feeAmount · netAmount  (consequência aritmética da cópia)
       ↓ derivado
refunds.paymentMethod           (cópia da cópia)
       ↓ derivado
DRE · Caixa · Fluxo · Projeção  (leituras da cópia)
```

Nenhum nó desse grafo tem uma aresta de entrada vinda do mundo.

---

# 3 · Evidência

## 3.1 Os seis escritores de `paymentMethod` — todos digitados **[Ó]**

| # | Caminho | Tela que digita | Servidor que grava |
|---|---|---|---|
| 1 | **Atendimento** | `painel/(dashboard)/page.tsx:219` `concluirCom(metodo)` → `:228` | trigger → `payments.ts:79` |
| 2 | **Venda de produto** | `components/vender-produto.tsx:139` | `inventory.ts:586` valida → `:654`, `:445`, `:481` |
| 3 | **Mensalidade** | `components/gerir-mensalistas.tsx:120` | `mensalistas.ts:543` valida → `:582`, `:604`, `:613` |
| 4 | **Compra de estoque** | `components/entrada-de-estoque.tsx:75` | `inventory.ts:829` |
| 5 | **Livro caixa** | `components/livro-caixa.tsx:116` | `caixa.ts:300` valida → `:327` |
| 6 | **Correção (R1)** | `components/corrigir-pagamento.tsx:78` | `correcao-de-pagamento.ts:378` e `:383` |

Os seis leem a **mesma lista** `PAYMENT_METHODS` (`payment-method.ts:27`) e
todos passam por `metodoValido` ou equivalente. Validação de **forma**, nunca de
**verdade**: `metodoValido("pix")` responde "pix é um método existente", não
"foi assim que o cliente pagou".

A porta do balcão (`booking.ts:555-571`) cria a reserva com
`paymentMethod: null` — ela não digita método nenhum; a digitação continua sendo
a da conclusão.

## 3.2 O pagamento online **não existe** — o fato independente que faltava **[Ó]**

Era a hipótese mais promissora do enunciado, e ela cai:

```
functions/src/financial-events.ts:45   export type PaymentOrigin = "in_person" | "online";
functions/src/booking.ts:69-75         if (paymentOrigin && paymentOrigin !== "in_person")
                                         throw "Pagamento antecipado ainda não está disponível."
```

`"online"` existe **só como tipo**. Todo escritor crava `in_person`:

```
booking.ts:164 · booking.ts:570 · payments.ts:116 · financial-events.ts:225
web/src/app/(cliente)/agendar/page.tsx:143
```

O próprio comentário em `booking.ts:66-68` diz que o caminho é para "quando o
gateway entrar". Não entrou. E não há gateway: a varredura por
`stripe|mercado ?pago|pagseguro|asaas|pagarme|cielo|stone|webhook|ofx|csv|
importar|open banking` sobre `functions/src` e `web/src` devolve **um único
webhook, o do WhatsApp** (`functions/src/whatsapp/webhook.ts:95`) — mensagem, não
dinheiro. **[Ó]**

`paymentGateways` (`business-rules.ts:213`, consumido em
`financeiro/page.tsx:282-296`) é **tabela de referência de mercado** para o dono
comparar preços de maquininha. Nenhum cálculo a lê, nenhuma conta é conectada.
**[Ó]** — a `AUDITORIA-R1-N7.md §1.5` já registrava isso e se confirma.

**Conclusão:** não há método vindo de gateway. A frente de pagamento online, se
um dia existir, seria a primeira fonte independente do produto — e é a única
mencionada no repositório que produziria naturalmente o fato que falta. **[J]**

## 3.3 Conciliação com extrato — **não existe** **[Ó]**

O produto **fala** em conciliar, em três lugares, e em todos os três o ato é
**humano e fora do sistema**:

```
analytics.ts:352-354    "o dono concilia com o extrato da maquininha, que é uma fila só"
analytics.ts:1204-1206  caixaDoDia usa grossAmount porque "é o que o dono compara com a
                         maquininha e a gaveta"
fluxo-de-caixa.ts:47    "o dono confere o Fluxo contra o extrato"
fluxo-de-caixa.ts:261-263  porMetodo agrupa débito+crédito "porque o extrato é uma fila só"
```

O sistema **prepara a coluna para a conferência e nunca recebe o resultado
dela.** Não há importação, upload, arquivo, campo ou coleção onde o extrato
entre. **[Ó]**

A palavra "reconciliação" no repositório se refere a outra coisa: bater o
sistema contra um **ledger calculado à mão** dentro dos testes
(`web/src/lib/__tests__/reconciliacao.test.ts`, `docs/LEDGER-DE-VALIDACAO.md`,
`docs/MAPA-DE-FONTES.md §6`). É verificação de fórmula, não conciliação
bancária. **[Ó]**

## 3.4 `caixaDoDia` × contagem física — a metade que falta **[Ó]**

`caixaDoDia` (`analytics.ts:1210-1228`) produz exatamente as colunas que uma
conferência de gaveta usaria: `pix`, `cartao`, `dinheiro`, `naoInformado`,
`total` — pelo **bruto**, "que é o que o dono compara com a maquininha e a
gaveta" (`analytics.ts:1204-1206`).

Falta o outro lado: **o valor contado nunca volta para o sistema.** Nada em
`web/src` ou `functions/src` calcula "quanto deveria haver na gaveta" nem
compara com um valor informado. Varredura por
`fechamentoDeCaixa|caixaFisico|cashCount|contagem|conferencia|reconcil`:
nenhuma ocorrência em código de produção. **[Ó]**

E o `livro-caixa.ts` **declara** essa fronteira:

```
web/src/lib/livro-caixa.ts:10-14
  "Esta camada não sabe somar o Fluxo de Caixa. Ela conhece só os lançamentos
   independentes — sangria, troco, aporte, pagamento de comissão, ajuste."
```

As duas metades do saldo de caixa (os pagamentos e os lançamentos
independentes) **nunca são somadas juntas por nenhuma leitura**. Sem o esperado,
não há o que comparar com o contado.

## 3.5 `movimentosDeCaixa` e o Livro Caixa — nenhum sinal **[Ó]**

`movimentosDeCaixa` (`fluxo-de-caixa.ts:111-160`) copia o método do pagamento
(`:138 metodo: p.paymentMethod ?? null`). É a mesma digitação, agrupada. Não
observa nada.

Achado colateral: `movimentosDeCaixa` **não tem consumidor de tela**. É calculado
em `use-financeiro.ts:142` e exposto em `:186`, e a única leitura é
`resumoDoFluxo`/`fluxoDiario`. A linha a linha com o método por movimento existe
no modelo e não chega ao dono. **[Ó]**

`cash_entries` é a coleção mais próxima de um fato físico, e ainda assim não
serve:

```
functions/src/caixa.ts:52-57    enum FECHADO: sangria · troco_inicial · aporte ·
                                pagamento_comissao · ajuste
functions/src/caixa.ts:11-13    "só existe quando há movimento de caixa que NÃO POSSUI
                                outro fato econômico que o represente"
web/src/lib/livro-caixa.ts:31   ajuste: "Correção de contagem — sobra ou falta encontrada
                                ao conferir"
```

O tipo `ajuste` é o **único ponto do produto onde uma contagem física
encosta**. Mas:

- é lançamento **manual e livre** — valor, direção e `reason` em texto
  (`caixa.ts:151-181`);
- **não referencia pagamento nenhum** — `CashEntryDoc` não tem `paymentId` nem
  `bookingId` (`caixa.ts:86-110`);
- **nada compara** o ajuste com um esperado. Ele registra a diferença; não a
  descobre, não a explica e não aponta para a causa.

Um "ajuste: sobra de R$ 50 em dinheiro" no mesmo dia de um atendimento de R$ 50
marcado como Pix é **coincidência aritmética**, não evidência: o valor não
identifica o fato, dois atendimentos de R$ 25 produzem a mesma sobra, e uma
sangria mal contada produz a mesma sobra sem nenhum método errado. **[J]**

## 3.6 Taxa configurada × taxa aplicada — o par erra **junto** **[Ó]**

A ideia é atraente e não funciona. A taxa não é observada: é **derivada** do
método pela mesma função pura em todos os caminhos —
`taxaDoMetodo` (`financial-events.ts:163-168`) dentro de `valoresDoPagamento`
(`payments.ts:69-85`).

```
método errado (pix) → taxa do pix → feeAmount coerente com pix → netAmount coerente
```

O par `(paymentMethod, feePct)` de um pagamento em caso 2 é **internamente
consistente**. Comparar `feePct` gravado com `taxaDoMetodo(método, tabela de
hoje)` detectaria só uma coisa: **que a tabela de taxas mudou desde a
conclusão** — que é o que a R1.1 decidiu conviver sem versionar. Não diz nada
sobre a realidade do balcão.

O card **"taxas não configuradas"** (`action-center.ts:313-341`) também não
serve, e vale ser preciso sobre o porquê:

```
action-center.ts:318-319   todasZeradas = todas as taxas em zero
action-center.ts:321-326   usouCartao = existe pagamento débito/crédito no período
```

Ele detecta **ausência de configuração**, não erro de registro. Um atendimento
marcado Pix e pago em dinheiro não muda nenhuma das duas condições. E ele lê
`p.paymentMethod` — ou seja, **também confia na digitação**: se o dono marcar
crédito por engano com as taxas zeradas, o card acende avisando de um cartão que
nunca passou. É o risco 🟡 que `AUDITORIA-R1-N7.md §5.3` já registrou, visto
do outro lado. **[Ó]**

## 3.7 Estornos — cópia, não testemunha **[Ó]**

```
functions/src/refunds.ts:386   const metodo = pagamentoSnap.get("paymentMethod") ?? null
functions/src/refunds.ts:234   paymentMethod: params.metodo        (documentoDeEstorno)
```

`RefundDoc.paymentMethod` **é lido do próprio `PaymentDoc`**. O dono nunca
informa por onde o dinheiro voltou. O estorno herda o erro em silêncio e o
propaga para `inventory_movements` (`refunds.ts:484`).

Consequência que o R1 já trata: por isso ele **recusa** corrigir pagamento já
estornado (`correcao-de-pagamento.ts:195`, `FRASE_DA_RECUSA.ja_estornado:219`).
Mas para **detecção** o estorno é inútil — ele não tem opinião própria.

Nota **[J]**: um estorno com método informado independentemente *seria* uma
segunda origem parcial (o dinheiro que volta sai por algum canal real). Hoje o
produto joga essa informação fora ao copiá-la.

## 3.8 Comissão — não pode discordar **[Ó]**

```
functions/src/financial-events.ts:218-221
  commissionPct, commissionBase: valor, commissionAmount: (valor × pct)/100
```

A base é o **bruto**, e o método não entra na conta. A comissão é numericamente
cega ao meio de pagamento — não serve nem como sinal nem como consequência.
Mesmo para o imposto: incide sobre bruto, e o bruto não muda
(`DECISOES-ABERTAS.md`, confirmado em `analytics.ts:596-735`).

## 3.9 A única inconsistência entre dois documentos que existe — e ela **não** é o caso 2 **[Ó]**

O produto tem, sim, **duas cópias** do meio de pagamento do atendimento:

```
bookings.paymentMethod    estado operacional   6 leituras, nenhuma soma dinheiro
payments.paymentMethod    fato econômico       6 leituras de dinheiro
```

Uma divergência entre as duas **é** um fato detectável, e o R1 acabou de
transformá-la em invariante (`correcao-de-pagamento.ts:378,383` — as duas na
mesma transação). Mas ela detecta o **vazamento pré-R1** e a escrita direta em
`bookings`, não o caso 2:

> No caso 2 os dois documentos dizem **"pix"**, concordam perfeitamente, e estão
> **errados juntos**. Concordância não é verdade.

A porta por onde uma divergência nova ainda pode nascer continua aberta:

```
firestore.rules:246   allow update, delete: if isStaffOf(barbershopId);   // bookings
firestore.rules:315   allow write: if false;                              // payments
```

Qualquer staff pode escrever `bookings.paymentMethod` direto pelo SDK; `payments`
não. O invariante do R1 é sustentado pelo **caminho de código**, não pelas
regras. **[Ó]** — `booking.ts:952` já diz *"interface não é guarda"*.

## 3.10 O cliente vê, e não tem como contestar **[Ó]**

É o único ponto do produto em que um **segundo ser humano** é exposto ao dado:

```
web/src/app/(cliente)/reservas/page.tsx:374   labelDoPagamento(b.paymentOrigin, b.paymentMethod)
web/src/app/(cliente)/reservas/page.tsx:320   "Valor pago" × "A pagar no salão"
web/src/app/(cliente)/page.tsx:104            idem
```

Um cliente que pagou em dinheiro e vê **"Pix"** na tela dele está olhando para o
erro. Não existe nenhum caminho de contestação, aviso, "não foi assim" ou
ocorrência — varredura por `client_occurrences`: coleção morta, registrada em
`BACKLOG-FASE-3.md` como gap de produto. **[Ó]**

E o WhatsApp **não** conta: `notifyBookingCreated` é `onDocumentCreated`
(`whatsapp/notify.ts:29`) e só dispara na criação, quando `paymentMethod` é
sempre `null` — o template sai literalmente com *"pagar no salão"*
(`whatsapp/templates.ts:110-115`). **Nenhuma mensagem do produto afirma ao
cliente como ele pagou.** **[Ó]**

## 3.11 Venda de produto na mesma visita — o vínculo existe e está morto **[Ó]**

```
functions/src/inventory.ts:541,656   registrarVenda aceita bookingId
web/src/components/vender-produto.tsx   NENHUMA ocorrência de bookingId
```

O modelo prevê ligar a venda ao atendimento; a tela **nunca envia**. Então nem a
correlação fraca "dois pagamentos da mesma visita com métodos diferentes" está
disponível — e, mesmo se estivesse, métodos diferentes na mesma visita são
**normais**, não suspeitos. **[J]**

## 3.12 A assimetria de consequência, medida

### Quais leituras se movem quando o método está errado **[Ó]**

| Leitura | Move? | Onde |
|---|---|---|
| `taxasDePagamento` → DRE `gatewayFees` | ✅ soma `feeAmount` | `analytics.ts:583-592`, `:647`, `:715` |
| `caixaDiario` | ✅ valor (`netAmount`) **e** coluna | `analytics.ts:350`, `:368-370` |
| `movimentosDeCaixa` → `resumoDoFluxo.porMetodo` | ✅ valor e coluna | `fluxo-de-caixa.ts:137-138`, `:264-267` |
| Projeção de caixa | ✅ derivada de `caixaDiario` | `use-financeiro.ts:132` |
| `caixaDoDia` (Hoje) | ⚠️ **coluna migra, total NÃO muda** | `analytics.ts:1210-1228` (bruto) |
| DRE: `grossRevenue`, `tax`, `cmv`, comissão | ❌ | bruto não muda; comissão é sobre bruto |

### A assimetria que importa não é Pix→dinheiro × dinheiro→Pix **[J]**

Os dois sentidos movem o mesmo delta com sinal trocado. A assimetria real é
**outra, e é a mais desconfortável**:

```
erro que ENVOLVE dinheiro       →  a gaveta fica sobrando ou faltando
                                   um humano contando ACHA — fora do sistema

erro entre pix ↔ débito ↔ crédito →  a gaveta fica intacta
                                   só o extrato acharia — e o produto não o tem
```

**Dinheiro é a única coluna com contrapartida física.** E o crédito, que
tipicamente carrega a **maior** taxa (é a premissa de `financial-events.ts:158-161`
e da tabela de `business-rules.ts:213`), é justamente onde um erro não deixa
rastro nenhum:

> **A metade do caso 2 com maior consequência financeira é exatamente a metade
> sem qualquer traço físico.** **[J]**

Uma ressalva que reduz o susto de hoje, e não a natureza do problema:
`DEFAULT_PAYMENT_FEES` (`tenant.ts:153`) e `SEM_TAXA` (`financial-events.ts:55`)
são **zero nas quatro chaves**. Com taxas zeradas, o caso 2 **não move dinheiro
nenhum** — move só a coluna. Todo o dano financeiro do caso 2 é proporcional à
taxa configurada. **[Ó]** Quantas barbearias têm taxa preenchida: **[NV]**.

## 3.13 Precedentes de detecção no Action Center — **cinco de cinco são ausência** **[Ó]**

| Avaliador | Linha | Detecta o quê | Base |
|---|---|---|---|
| `semServicoCadastrado` | `:350-369` | não há serviço ativo | **ausência** |
| `fechamentosPendentes` | `:132` | `completed && !paymentMethod && !coberto` | **ausência de campo** |
| `desfechosEsquecidos` | `:186` | data passada + status em aberto | **ausência de desfecho** |
| `atendimentosAtrasados` | `:284-287` | relógio > tolerância + em aberto | **ausência de desfecho** |
| `taxasNaoConfiguradas` | `:318-326` | taxas zeradas **e** cartão usado | **ausência de configuração** (cruza duas fontes) |

`taxasNaoConfiguradas` é o único que cruza duas fontes — e mesmo ele cruza
**configuração × fato**, e o que afirma é que algo **falta**. Nenhum avaliador
do produto, em nenhum momento da sua história, afirmou que **um campo
preenchido está errado**. Não há precedente. **[Ó]**

E o contrato **proíbe** que se invente um:

```
docs/ACTION-CENTER-CONTRATO.md §1.1
  invariante 2 — "Ação não executável pelo sistema nunca é crítica."
  invariante 3 — "insufficient NUNCA gera ação. Alerta falso destrói a
                  confiança no produto."
                  real → pode gerar ação
                  estimated → pode aparecer; nunca como crítico
                  insufficient → não entra
```

Qualquer alarme de caso 2 construído sobre coincidência de valores seria
`insufficient` — e `insufficient` **não entra**. Um alerta "este Pix pode ter
sido dinheiro" que acerta às vezes é exatamente o alarme falso que o invariante
3 existe para barrar. **[J]**

## 3.14 Onde o caso 2 pode ser corrigido hoje — a porta existe e **quase não alcança** **[Ó]**

Mapeando todos os pontos, como pedido:

| # | Ponto | Detecta? | Corrige? | Onde |
|---|---|---|---|---|
| 1 | Botão **"Corrigir pagamento"** na linha | ❌ | ✅ | `painel/(dashboard)/page.tsx:763-769` |
| 2 | Card crítico "Registrar pagamento" | só o caso 1 | aponta para a mesma porta | `action-center.ts:132`, `:150` |
| 3 | `executarIntencao` sobre `completed` | ❌ | ✅ roteia | `page.tsx:342` |
| 4 | Callable `corrigirPagamentoDeAtendimento` | ❌ | ✅ | `correcao-de-pagamento.ts:425` |
| 5 | `audit_log` | ❌ (registra depois) | — | `correcao-de-pagamento.ts:390-395` |
| 6 | `caixaDoDia` / Fluxo `porMetodo` | ❌ (só expõe a coluna) | — | `analytics.ts:1210`, `fluxo-de-caixa.ts:264` |

**A porta é uma só, e está presa ao dia de hoje:**

```
page.tsx:77    const bookings = todas.filter((b) => b.date === hoje);
page.tsx:98    const bookingsDoDia = bookings.slice().sort(...)
page.tsx:619   {bookingsDoDia.map((booking) => {  ...  botão em :763
page.tsx:117   avaliarOperacao({ bookings, ... })   ← o card também só recebe HOJE
```

O botão só existe na tabela do painel **Hoje**, e a tabela só contém
`b.date === hoje`. `useBookings()` traz `todas` (`page.tsx:65`) e `todas` só é
usada por `desfechosEsquecidos` (que trata `confirmed`/`confirmed_by_client`,
nunca `completed`) e por `executarIntencao` (`page.tsx:319`).

**Consequência:** o servidor aceita corrigir qualquer pagamento do **mês
corrente** (R1.2 — `correcao-de-pagamento.ts:146-148`), mas a interface só
oferece a porta para **hoje**. Um caso 2 percebido no dia 20 sobre um
atendimento do dia 5 **não tem por onde ser corrigido**, mesmo estando dentro da
janela que a decisão concedeu. **[Ó]**

Isso importa desproporcionalmente para o caso 2: por natureza ele é descoberto
**depois** — na conferência da gaveta à noite, no extrato da semana seguinte.
No dia, ninguém tem por que suspeitar. **[J]**

Nota menor **[Ó]**: `hoje` no painel é `toISODate(new Date())` (`page.tsx:76`),
o relógio do dispositivo — decisão já documentada e deliberada em
`action-center.ts:222-230` ("é o relógio do balcão"). Não é defeito; é a
fronteira do dia da porta.

---

# 4 · Arquivos envolvidos

**Onde o método nasce e é gravado**
```
web/src/app/painel/(dashboard)/page.tsx        219-232 · 316-344 · 763-769 · 76-98 · 117
web/src/components/corrigir-pagamento.tsx      40-90
web/src/components/vender-produto.tsx          139
web/src/components/gerir-mensalistas.tsx       120
web/src/components/entrada-de-estoque.tsx      75
web/src/components/livro-caixa.tsx             116
functions/src/correcao-de-pagamento.ts         146-148 · 172-211 · 282-399 · 425-484
functions/src/financial-events.ts              45 · 55 · 163-168 · 185-228 · 425-470 · 513
functions/src/payments.ts                      50-116
functions/src/booking.ts                       28-33 · 66-75 · 164 · 555-571
functions/src/inventory.ts                     586 · 654 · 829
functions/src/mensalistas.ts                   543 · 582 · 604 · 613
functions/src/caixa.ts                         52-57 · 86-110 · 120-124 · 151-181 · 276-338
functions/src/refunds.ts                       204-240 · 386 · 484
```

**Onde ele é lido**
```
web/src/lib/action-center.ts                   132 · 313-341 · 417-451
web/src/lib/analytics.ts                       295-386 · 583-592 · 1180-1228
web/src/lib/fluxo-de-caixa.ts                  111-160 · 249-280
web/src/lib/livro-caixa.ts                     10-14 · 17-32
web/src/lib/booking-status.ts                  128-173
web/src/lib/payment-method.ts                  9-36
web/src/lib/db/use-financeiro.ts               132 · 142 · 186
web/src/app/(cliente)/page.tsx                 104
web/src/app/(cliente)/reservas/page.tsx        42 · 320 · 374
web/src/app/painel/(dashboard)/financeiro/page.tsx     282-296
functions/src/whatsapp/notify.ts               29 · 53
functions/src/whatsapp/templates.ts            70-115
```

**Regras**
```
firestore.rules   226-247 (bookings: update por qualquer staff)
                  268-269 (cash_entries: write false)
                  313-316 (payments: write false)
                  341-345 (audit_log: write false, imutável)
```

**Documentos**
```
docs/ACTION-CENTER-CONTRATO.md   §1.1 invariantes 2 e 3 · §4.1 · §4.10 · §8
docs/R1-BRIEFING.md              §1 · §6 item 1 · §7
docs/AUDITORIA-R1-N7.md          §1.5 · §5.3 · §8.3
docs/R1-DECISOES-ENCONTRADAS.md  "O que continua aberto" item 2
docs/MAPA-DE-FONTES.md           §5 · §6
```

---

# 5 · Existe fato detectável?

## **NÃO.**

**Não existe, hoje, nenhum fato no sistema que permita detectar que o meio de
pagamento informado está errado.**

Escrevo com todas as letras, como pedido: **não é "difícil", não é "poderia se
houvesse", não é "parcialmente".** É **não**. O produto registra a afirmação do
dono sobre como o cliente pagou e não possui nenhuma outra observação do mesmo
evento. Um caso 2 é, para o sistema, indistinguível de um registro correto — não
por falta de tela, mas porque o dado que os separaria nunca foi coletado.

O teste que uso para responder: **existe algum bit no Firestore cujo valor seria
diferente se o cliente tivesse pagado em dinheiro em vez de Pix, e que não
descenda da digitação do dono?** A resposta é não, e nenhum candidato abaixo
sobreviveu.

## O que foi considerado e descartado

| # | Candidato | Verdicto | Por quê |
|---|---|---|---|
| 1 | **Método vindo de gateway** (`paymentOrigin: "online"`) | ❌ **não existe** | `booking.ts:69-75` recusa; todo escritor crava `in_person`. Tipo sem caminho **[Ó]** |
| 2 | **Conciliação com extrato** | ❌ **não existe** | Nenhuma importação, upload, arquivo ou webhook financeiro. O único webhook é o do WhatsApp **[Ó]** |
| 3 | **`caixaDoDia` × contagem física** | ❌ **meia ponte** | O esperado existe (`analytics.ts:1210`); o contado nunca entra. Nada compara **[Ó]** |
| 4 | **Livro Caixa / `cash_entries`** | ❌ | Enum fechado que exclui atendimento por construção (`caixa.ts:52-57`). Não observa pagamento **[Ó]** |
| 5 | **`ajuste` de contagem** | ❌ **não é evidência** | Manual, livre, sem `paymentId`, sem esperado a comparar. Casar valor com pagamento é coincidência **[J]** |
| 6 | **`movimentosDeCaixa`** | ❌ | Copia `p.paymentMethod` (`fluxo-de-caixa.ts:138`). Mesma digitação agrupada **[Ó]** |
| 7 | **Taxa configurada × taxa aplicada** | ❌ | `feePct` é **derivado** do método (`payments.ts:74`). O par erra junto e continua coerente **[Ó]** |
| 8 | **Card "taxas não configuradas"** | ❌ | Detecta configuração ausente, não registro errado — e ele mesmo confia em `p.paymentMethod` (`action-center.ts:321-326`) **[Ó]** |
| 9 | **`RefundDoc.paymentMethod`** | ❌ | Cópia do pagamento (`refunds.ts:386` → `:234`). Herda o erro **[Ó]** |
| 10 | **Comissão** | ❌ | Base é o bruto; método não entra (`financial-events.ts:218-221`) **[Ó]** |
| 11 | **Imposto / DRE bruto** | ❌ | Incidem sobre bruto, que não muda **[Ó]** |
| 12 | **`audit_log`** | ❌ para detectar | Registra a correção **depois** que um humano descobriu (`correcao-de-pagamento.ts:390`). E nenhuma tela o lê **[Ó]** |
| 13 | **`bookings` × `payments`** | ⚠️ **é fato, mas de outro problema** | Detecta o vazamento pré-R1 e escrita direta em `bookings` (`firestore.rules:246`). No caso 2 os dois concordam e erram juntos **[Ó]** |
| 14 | **Venda de produto na mesma visita** | ❌ | `bookingId` nunca é enviado pela tela; e métodos diferentes na mesma visita são normais **[Ó]/[J]** |
| 15 | **O cliente como testemunha** | ❌ hoje | Ele **vê** o método (`reservas/page.tsx:374`) e não tem caminho de contestação. O WhatsApp só fala na criação, com método nulo **[Ó]** |
| 16 | **Heurística de valor/horário** | ❌ inadmissível | Seria `insufficient`, e o invariante 3 do Action Center o barra na porta **[Ó]/[J]** |

### O que a resposta "não" **não** significa

Não significa que o dano seja invisível **ao dono**. Significa que ele é
invisível **ao produto**. A gaveta continua sobrando ou faltando à noite, e o
extrato da maquininha continua discordando no fim da semana — o dono pode
descobrir, e descobre por fora. O que não existe é o sistema **saber**, e por
isso não existe alerta possível sem antes existir coleta.

---

# 6 · Recomendação — o que seria possível, e o custo

**Não escolho.** As seis opções abaixo são apresentadas com o custo real e a
consequência de cada uma. Duas delas (C e D) não detectam o caso 2 e entram
porque resolvem defeitos reais que apareceram na auditoria.

### A · Não construir alarme — assumir que o caso 2 não é detectável

| | |
|---|---|
| **Custo** | zero |
| **Entrega** | a porta do R1 é a resposta inteira; a descoberta continua humana |
| **Consequência** | o item 1 de `R1-BRIEFING.md §6` permanece aberto e continua bloqueando o piloto, como está registrado |
| **A favor** | é a única opção honesta enquanto não houver coleta. Inventar alarme sobre coincidência viola o invariante 3 do Action Center |
| **Contra** | *"erro financeiro silencioso que você não quer descobrir depois que uma barbearia já começou a usar"* — a frase do próprio briefing continua verdadeira |

### B · Fechamento de caixa: transformar a conferência da gaveta em fato do sistema

O dono digita, no fim do expediente, **quanto tem de dinheiro na gaveta**. O
sistema calcula o esperado (`caixaDoDia().dinheiro` + `cash_entries` de dinheiro
do dia) e compara.

| | |
|---|---|
| **Custo** | **alto.** Coleção nova + callable + tela + o modelo do "esperado", que hoje não existe (`livro-caixa.ts:10-14` diz explicitamente que as duas metades não se somam) |
| **Entrega** | **o primeiro fato do produto independente da digitação.** Uma diferença de caixa é evidência real |
| **Alcance** | **só erros que envolvem dinheiro.** Pix ↔ débito ↔ crédito continuam invisíveis — e é aí que a taxa é maior |
| **Já preparado** | `ajuste` (`caixa.ts:57`) existe e é literalmente *"sobra ou falta encontrada ao conferir"* — o lugar onde a diferença aterrissa já está modelado |
| **Risco** | a diferença **não identifica o pagamento culpado**. Ela diz "faltam R$ 50", não "o atendimento do Marcos foi em dinheiro". O salto de um para o outro é inferência, e inferência é `insufficient` |
| **Decisão embutida** | 🔴 o que fazer com a diferença: virar `ajuste` (que não toca o pagamento) ou abrir a porta de correção? São tratamentos **opostos** do mesmo dinheiro. Ver §7 |

### C · Estender o alcance da porta ao mês corrente

| | |
|---|---|
| **Custo** | **baixo.** A callable já aceita o mês inteiro (`correcao-de-pagamento.ts:146-148`); falta só a UI. `useBookings()` já traz `todas` (`page.tsx:65`) |
| **Entrega** | **não detecta nada.** É a diferença entre "corrigível em tese" e "corrigível de fato" |
| **A favor** | o caso 2 é descoberto dias depois por natureza. Uma porta que só existe hoje serve mal justamente ao caso para o qual foi criada. E o servidor **já concedeu** essa janela |
| **Contra** | uma lista de atendimentos concluídos do mês é tela nova, com decisões de UX próprias, e o §8 do contrato do Action Center barra histórico dali |
| **Observação** | vale para o **caso 1 também**: um `completed` sem método de anteontem hoje não aparece em card nenhum (`page.tsx:117` só passa `bookings` de hoje) **[Ó]** |

### D · Varredura `bookings.paymentMethod` × `payments.paymentMethod`

| | |
|---|---|
| **Custo** | **baixo a médio.** Comparação de dois campos que a tela já carrega |
| **Entrega** | **não detecta o caso 2** (os dois concordam e erram juntos). Detecta o **resíduo do vazamento pré-R1** e qualquer escrita direta futura em `bookings` — que as regras permitem a qualquer staff (`firestore.rules:246`) |
| **Confiança** | **`real`** — é a única inconsistência entre dois documentos disponível no produto, e ela é objetiva |
| **A favor** | o R1 criou o invariante mas ninguém o verifica em dado vivo; o histórico anterior a `a9c5eca` pode ter divergências gravadas, e **quantas é [NV]** |
| **Contra** | responde a outra pergunta. Entrar como resposta ao caso 2 seria dar por resolvido o que não está |

### E · Conciliação com o extrato da maquininha / Pix

| | |
|---|---|
| **Custo** | **muito alto.** Frente inteira: entrada do extrato (importação ou integração), casamento por valor+data, tratamento de divergência, e nada no produto está preparado — não há gateway, upload nem parser |
| **Entrega** | **o único desenho que detecta a metade invisível** (pix ↔ débito ↔ crédito), que é onde a taxa dói mais |
| **Observação** | o produto **já orienta o dono a fazer isso à mão** e desenhou as colunas para essa conferência (`analytics.ts:352-354`, `fluxo-de-caixa.ts:47`, `:261-263`). O passo que falta é o extrato entrar |
| **Contra** | é maior que o R1 inteiro, e depende de decisões de integração que ninguém tomou |

### F · Recibo ao cliente + caminho de contestação

| | |
|---|---|
| **Custo** | **médio.** Mensagem pós-conclusão (o catálogo WhatsApp já existe) + um caminho de "não foi assim" + a ocorrência do lado do dono |
| **Entrega** | põe um **segundo humano** olhando o dado — o único que sabe a verdade além de quem digitou |
| **A favor** | o cliente **já vê** o método hoje (`reservas/page.tsx:374`) sem poder dizer nada. A informação está exposta e desperdiçada |
| **Contra** | 🔴 é decisão de produto de peso: afirmar ao cliente *"você pagou Pix"* transforma um registro interno em declaração ao cliente, com toda a régua da §27 por cima; e convidar contestação cria um fluxo de disputa que o produto não tem. Template novo exige aprovação da Meta (`templates.ts`) |
| **Contra 2** | não fecha nada sozinho: cliente que não abre o app não testemunha |

### Uma observação transversal, e não é escolha

Sem **B**, **E** ou **F**, nenhum alarme de caso 2 pode ter confiança `real` — e
`insufficient` não entra no Action Center por invariante. **Alarme exige coleta
antes.** Qualquer desenho que pule essa etapa está inventando o alerta que o
enunciado pediu para não inventar. **[J]**

---

# 7 · Decisões de domínio que apareceram

Cinco. Nenhuma foi tomada por mim.

| # | Decisão | Por que não posso derivar |
|---|---|---|
| **1** | **A conferência da gaveta deve virar fato do sistema?** (opção B) | É criar uma obrigação operacional nova para o dono — contar e digitar todo dia. O produto nunca pediu nada assim; é decisão de produto, não de código |
| **2** | **O que fazer com a diferença encontrada:** virar `ajuste` de caixa, ou apontar para a correção de um pagamento? | São **tratamentos opostos**: o `ajuste` reconhece a diferença sem tocar no fato (`caixa.ts:57`); a correção reescreve o fato (`correcao-de-pagamento.ts:378`). Escolher errado ou faz o caixa fechar com o DRE errado, ou reescreve um pagamento por inferência |
| **3** | **A porta de correção deve alcançar o mês corrente na tela?** (opção C) | O servidor **já concedeu** a janela (R1.2), a tela **não a oferece**, e o `R1-DECISOES-ENCONTRADAS.md` não registra isso como escolha. Não sei se é decisão consciente ou consequência de a porta ter nascido na tabela do Hoje |
| **4** | **O cliente pode ser transformado em testemunha?** (opção F) | Afirmar ao cliente como ele pagou é declaração de produto sujeita à §27, e abrir contestação cria um fluxo de disputa. Fora do alcance de qualquer derivação |
| **5** | **A varredura `bookings` × `payments` (D) entra como item do Action Center?** | Ela detecta um problema **real e diferente** do caso 2. Entrar agora pode dar a impressão de que o caso 2 foi endereçado. É decisão de escopo, e a nomenclatura do item é decisão de produto |

Registro também, sem tratar como decisão nova, um **defeito** que apareceu e que
pertence à lista de correções, não a esta auditoria:

- **D-g** — o card crítico do caso 1 só enxerga reservas de **hoje**
  (`page.tsx:117` passa `bookings`, filtrado em `page.tsx:77`). Um `completed`
  sem método de um dia anterior do mesmo mês não gera card nem tem linha na
  tabela — **o caso 1 também tem um buraco de alcance**, e ele não está
  registrado em documento nenhum que eu tenha lido. **[Ó]**

---

# 8 · O que eu **não** consegui verificar

1. **Nada foi executado.** Sem suíte, sem typecheck, sem lint, sem build, sem
   emulador. Auditoria estática, por instrução. **[NV]**
2. **Estado dos dados em produção.** Quantos pagamentos estão em caso 2 é
   **inobservável por construção** — é a própria tese deste relatório. Quantos
   `bookings.paymentMethod` divergem de `payments.paymentMethod` (resíduo do
   vazamento pré-R1) **é** observável e **não foi medido**. **[NV]**
3. **Se alguma barbearia tem `policies.paymentFees` preenchido.** Com as taxas
   zeradas (o padrão — `tenant.ts:153`), o caso 2 hoje move **só a coluna** e
   nenhum centavo. Isso muda a gravidade, não a natureza. **[NV]**
4. **A tela.** Não abri o produto. Se `caixaDoDia` "se lê" como correto quando a
   coluna migra sem o total mudar é verificação de §19, do orquestrador. **[NV]**
5. **`docs/agent-reports/`.** Não existia no commit-base; não abri arquivo de
   nenhum outro agent, conforme a instrução.
6. **O experimento que provaria o §3.12, descrito em vez de rodado:**
   duas barbearias com `paymentFees` distintos, um atendimento de R$ 50 concluído
   como `pix`, e a mesma correção para `cash`; comparar `taxasDePagamento`,
   `caixaDiario`, `resumoDoFluxo.porMetodo` e `caixaDoDia` antes e depois. A
   previsão pelo código é: DRE e Fluxo mudam de valor, `caixaDoDia` muda de
   coluna com **total idêntico**, comissão e imposto não se movem. Não rodei —
   não é meu papel nesta onda.
7. **Se `expenses` (D24, sem congelamento — `MAPA-DE-FONTES.md §5`) poderia
   conter um segundo registro do mesmo dinheiro** capaz de servir de sinal. Li o
   suficiente para ver que `metodoDaDespesa` (`fluxo-de-caixa.ts:101`) reduz
   `payment` a `"pix" | null` e que despesa não referencia atendimento; não
   aprofundei. **[NV]** — julgo improvável. **[J]**

---

# 9 · Resumo em cinco linhas

1. **Commit-base `3f460e2`**, com `a9c5eca` (R1) como ancestral.
2. **Não existe fato detectável.** Todo registro de meio de pagamento desce de
   uma digitação; não há segunda origem. Dezesseis candidatos considerados,
   dezesseis descartados.
3. O R1 deu a **porta** e ela alcança **só o dia de hoje** — enquanto o servidor
   concede o **mês corrente**. Isso serve mal justamente ao caso que é
   descoberto dias depois.
4. A metade **invisível** do caso 2 (pix ↔ cartão) é a metade de **maior**
   consequência financeira; a metade com traço físico é a que envolve dinheiro.
5. **Alarme exige coleta antes.** Sem B, E ou F, qualquer alerta seria
   `insufficient` — e o invariante 3 do Action Center o barra na porta.
