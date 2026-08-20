# Auditoria de densidade — o que a tela mostra × o que o dono decide

> **Subordinado a `docs/UI-UX-GUIDELINES.md`.** A régua é a §2:
>
> *A interface não deve mostrar tudo que o sistema sabe. Deve mostrar o que o
> dono precisa decidir.*

Equipe **DENSITY-01** · Rodada 3.3 · 18/08/2026.
Arquivos tocados: `painel/(dashboard)/page.tsx`, `financeiro/page.tsx`,
`numeros/page.tsx`, `mensal/page.tsx` e um teste novo.
**Nenhum cálculo foi alterado. Nenhum componente base foi alterado. Nenhuma
rota mudou.**

---

## A pergunta que governa cada linha

> **Se eu sou o dono da barbearia, qual decisão essa informação me permite
> tomar?**

Um elemento sai da tela por **uma** de duas razões, e as duas precisam estar
escritas na coluna "Recomendação":

1. outro elemento já permite a **mesma** decisão — é consolidação, e o número
   continua na tela;
2. o elemento não permite decisão nenhuma — e aí a justificativa é nominal, não
   estética.

**"Tem muitos cartões" não é razão.** Nenhuma linha desta auditoria recomenda
remoção por contagem.

---

## Contagem medida — 18/08/2026

Contada como o dono vê, não como o `grep` vê: `QuickLinkCard` é um componente
usado quatro vezes, e `GerirMensalistas` desenha quatro blocos dentro do Mensal.

| Tela | Blocos que o dono lê |
|---|---|
| **Financeiro · Resumo** | 8 `KpiTile` + 3 cartões de seção + 4 cartões de atalho = **15** |
| **Números** | 5 cartões de indicador + 5 cartões de conteúdo = **10** |
| **Hoje** | 4 cartões de indicador + 2 cartões + agenda + *n* itens de ação = **7 + n** |
| **Mensalistas** | 3 indicadores + 2 blocos (MRR, régua) + 2 tabelas = **7** |

O Financeiro é o pior caso e é o achado nº 1 da auditoria de UI/UX de 17/08,
que o `DESIGN-SYSTEM.md` §3 já registrava em `KpiTile`: *"Não use mais de
quatro numa primeira leitura. O Financeiro tem oito hoje."*

---

## 1 · Hoje — `painel/(dashboard)/page.tsx`

| Elemento | Que DECISÃO permite tomar | Duplica outro? | Recomendação |
|---|---|---|---|
| KPI **"previsto hoje"** (`previsaoHoje`) | nenhuma que a linha "Previsão do dia" não permita — é o mesmo número sem a comparação que o torna decisão | **SIM, literal.** Mesma variável `previsaoHoje`, mesma tela, 48 linhas abaixo | **ÓBVIA · REMOVER o KPI.** É o exemplo nomeado em guidelines §13. O número fica onde ele é comparado com o recebido |
| KPI **"atendimentos"** (`agendados.length`) | quantas cadeiras giram hoje — dimensiona o dia | parcial: sai do mesmo par (`agendados`, `totalSlots`) que gera ocupação e horários livres | **JULGAMENTO** — ver P-1 |
| KPI **"ocupação"** (`agendados/totalSlots`) | o dia está cheio? decide promover ou não | parcial: é `1 − livres/totalSlots`, aritmeticamente redundante com os outros dois | **JULGAMENTO** — ver P-1 |
| KPI **"horários livres"** (`totalSlots − agendados`) | **posso encaixar quem acabou de ligar?** É a decisão mais operacional da tela | parcial (idem) | **MANTER.** Dos três, é o único que o dono usa com o telefone na mão |
| Card **"Previsão × recebido"** · linha *Previsão do dia* | quanto o dia ainda promete | é o outro lado da duplicação do KPI | **MANTER** — aqui o número vira decisão (barra recebido ÷ previsto) |
| Card **"Previsão × recebido"** · linha *Recebido até agora* (`caixaHoje.total`) | estou no ritmo do que a agenda prometia? | não | **MANTER** |
| Card **"Caixa de hoje"** (pix / cartão / dinheiro) | quanto tem na gaveta; o que concilio no extrato da maquininha | é a **decomposição** de "Recebido até agora", em outro cartão — e as três parcelas **não fecham o total** | **JULGAMENTO** — ver P-2. E ver **STOP-1**: os filhos não somam o cabeçalho |
| Seção **"Precisa de você"** | o que fazer agora, item a item | não | **MANTER** — é a única parte da tela que já é decisão pronta |
| Tabela **"Agenda do dia"** | quem vem, a que horas, quanto, em que situação | não | **MANTER** |

---

## 2 · Financeiro · Resumo — `financeiro/page.tsx`

### Seção "Financeiro"

| Elemento | Que DECISÃO permite tomar | Duplica outro? | Recomendação |
|---|---|---|---|
| KPI **"Receita realizada"** (`r.grossRevenue`) | quanto o mês produziu | **SIM, três vezes.** (a) frase do cartão de equilíbrio logo abaixo; (b) `Quanto sobrou` usa o MESMO rótulo e o mesmo valor; (c) **Números** chama o mesmo `receita.bruta` de *"Faturamento"* | **ÓBVIA** para (a) — remover da frase. (b) é hierarquia legítima (resumo → detalhe). (c) é **JULGAMENTO** + handoff **UX-05** — ver P-6 |
| KPI **"Custo total"** (`r.totalCost`) | quanto o mês custou | **SIM** — repetido na frase do cartão abaixo | **ÓBVIA** — remover da frase |
| KPI **"Resultado"** (`r.result`) | sobrou ou faltou dinheiro no mês | **SIM, duas vezes na mesma tela**: na frase abaixo, e no atalho *"Quanto sobrou"* | **ÓBVIA** para a frase. O atalho é **JULGAMENTO** — ver P-3 |
| KPI **"Margem"** (`r.marginPct`) | sobrou quanto por real faturado — decide preço | **SIM** — repetido na frase | **ÓBVIA** — remover da frase |
| Card **"Ponto de equilíbrio"** · dia + barra + etiqueta | **a partir de que dia do mês eu trabalho para mim.** É a informação mais própria da tela | não | **MANTER** |
| Card **"Ponto de equilíbrio"** · frase final | nenhuma. Reenuncia em prosa os **quatro** KPIs que estão 40px acima, na mesma ordem | **SIM — os quatro, literalmente** | **ÓBVIA · REMOVER a frase.** Zero número sai da tela |
| Card **"De onde vem o dinheiro"** | de onde vem o faturamento — onde eu aperto | a linha *"Produtos (loja)"* é o mesmo `receita.produtos` do KPI "Faturamento da loja" | **MANTER o cartão.** A árvore precisa fechar (D6/P1-2). Quem sai é o KPI — ver P-4 |
| Card **"Taxas por método"** (`paymentGateways`) | **nenhuma.** É uma tabela de preço da Stone e da InfinitePay **fixa no código**, não as taxas desta barbearia. As reais moram em `policies.paymentFees` e já entram no "Custo total" ao lado, congeladas | não duplica — **contradiz** | **JULGAMENTO forte · candidato nº 1 a sair.** Ver **STOP-2** |
| Atalho **"Quanto sobrou"** (`operatingResult`) | ir ao detalhe do resultado | **SIM** — mesmo número do KPI "Resultado", sob outro nome, na mesma tela | **JULGAMENTO** — ver P-3 |
| Atalho **"Fluxo de Caixa"** (`cashFlowMonthTotal`) | nenhuma confiável: o número **não existe na tela de destino**, que hoje encabeça *"Sobrou no caixa"* (`fluxo.saldo`) | não | **JULGAMENTO** + **STOP-3** |
| Atalho **"Despesas"** (`expensesTotal`) | nenhuma confiável: soma **todas** as despesas, sem recorte de período — diverge do que o "Custo total" acima conta | não | **JULGAMENTO** + **STOP-3** |
| Atalho **"Projeção"** (`projectedResult`) | quanto devo ter em caixa em 30 dias | não | **MANTER** |

### Seção "Comercial"

| Elemento | Que DECISÃO permite tomar | Duplica outro? | Recomendação |
|---|---|---|---|
| KPI **"Crescimento líquido de mensalistas"** | **nenhuma.** A legenda diz *"+N novos"*, e `newSubscribers` é `subscribers.filter(status === "ativo").length` — o total de ativos, não os novos do mês. `SubscriberDoc` não guarda `createdAt` nem `canceledAt`, e `analytics.ts` documenta exatamente essa ausência | não | **JULGAMENTO · candidato a sair** + **STOP-4**. Afirma o que não aconteceu (guidelines §9) |
| KPI **"Mensalidade média"** (`mrr.billed / ativos`) | o plano está bem precificado? | não literalmente, mas `mrr.billed` é `receita.mensalistas` — **MRR contratado**, a fonte que `MAPA-DE-FONTES.md` §3 marca como *"nunca pode entrar"* em receita | **JULGAMENTO** — ver P-5 |
| KPI **"Inadimplência"** (soma de `suspenso × price`) | quanto preciso cobrar | **duplica a DECISÃO** de *"Em aberto"* em Mensalistas, com número diferente e **sem lastro de fatura** | **JULGAMENTO** — ver P-5 |
| KPI **"Faturamento da loja"** (`receita.produtos`) | quanto a loja rendeu | **SIM, literal** — é a linha *"Produtos (loja)"* da composição, na mesma tela | **JULGAMENTO** — ver P-4 (a legenda carrega `commissionsLoja`, que só existe aqui **nesta tela**; na DRE ela já aparece na árvore de comissões) |

---

## 3 · Números — `numeros/page.tsx`

| Elemento | Que DECISÃO permite tomar | Duplica outro? | Recomendação |
|---|---|---|---|
| KPI **"Faturamento"** (`kpis.revenue`) | o mês foi melhor ou pior que o anterior | **SIM** — é `receita.bruta`, o mesmo número que o Financeiro chama de *"Receita realizada"*. O que é próprio daqui é o **`Delta`**, não o valor | **JULGAMENTO** + handoff **UX-05** — ver P-6 |
| KPI **"Atendimentos"** | o volume subiu ou caiu | não | **MANTER** |
| KPI **"Ticket médio"** | posso subir preço? | não | **MANTER** |
| KPI **"Ocupação"** | preciso de mais cadeira, ou de mais divulgação? | não (é do mês; o de Hoje é do dia) | **MANTER** |
| KPI **"Taxa de no-show"** | preciso de confirmação ou de entrada? | valor e direção repetidos no insight abaixo | **MANTER** o KPI |
| Card **"Top serviços"** | o que eu promovo, o que eu tiro do cardápio | não | **MANTER** |
| Card **"Recorrência de clientes"** | **quem eu chamo hoje** | população sobreposta à tela Clientes (fora deste ownership — registrado) | **MANTER** |
| Card **"Mapa de calor"** | onde estão as brechas da agenda | não | **MANTER** |
| Card **Insight 1** (pico e brecha) | a mesma decisão do mapa de calor, com **os mesmos números**: `peak.pct` é a maior célula da grade imediatamente acima, e o rodapé da grade já diz *"os claros são as brechas pra promover"* | **SIM, literal** | **ÓBVIA · FUNDIR no rodapé do mapa.** Nenhuma palavra é perdida — a frase passa a morar no cartão que é dono do dado |
| Card **Insight 2** (no-show) · 1ª frase | direção e percentuais que o `Delta` do KPI já dá; **acrescenta** `noShowCount`, `lateCancelCount` e `totalBookings`, que não estão em nenhum outro lugar | parcial | **JULGAMENTO** — ver P-7 |
| Card **Insight 2** · 2ª frase (*"A confirmação por WhatsApp… é o maior fator de redução"*) | nenhuma — é **conselho fixo**, idêntico em qualquer mês e em qualquer barbearia. Não é fato desta operação | não | **JULGAMENTO · candidato a sair** — ver P-7 |

---

## 4 · Mensalistas — `mensal/page.tsx` + `GerirMensalistas`

Esta é a tela com **dois blocos de indicadores** e **três leituras do mesmo
conjunto de faturas**.

| Elemento | Que DECISÃO permite tomar | Duplica outro? | Recomendação |
|---|---|---|---|
| KPI **"Faturado"** (`resumo.faturado`) | quanto emiti neste mês | não | **MANTER** — sai da fatura, que é o fato |
| KPI **"Recebido"** (`resumo.recebido`) | **quanto entrou de verdade** — o único da tela com lastro de pagamento | não | **MANTER** |
| KPI **"Em aberto"** (`resumo.emAberto`) | quanto tenho a cobrar | duplica a **decisão** do KPI "Inadimplência" do Financeiro, com outro número | **MANTER aqui** (é o que tem lastro); o outro é que precisa decidir — P-5 |
| Tabela de **faturas da competência** | de quem eu cobro — e recebo no mesmo lugar | não | **MANTER** |
| Card **"MRR cobrável / contratado"** | quanto a assinatura vale por mês | **duplica a pergunta** de "Faturado", com fonte diferente: `subscribers.price × status === "ativo"`, que `MAPA-DE-FONTES.md` §3 lista como *"nunca pode entrar"*. Os dois blocos podem divergir e o dono não tem como saber qual crer | **JULGAMENTO** + **STOP-5** |
| Card **"Régua de cobrança"** (7 baldes) | quem está a quantos dias do vencimento | **terceira** leitura do mesmo conjunto de faturas — os mesmos documentos já estão resumidos em "Em aberto" e listados na tabela com `dueDate` | **JULGAMENTO** — ver P-8 |
| Tabela **"Assinantes"** | quem é meu mensalista e em que status | a coluna *"Próxima cobrança"* responde o que a tabela de faturas já responde com `dueDate` — e o faz por derivação (`billingDay`), não pelo fato | **JULGAMENTO** — ver P-8 |

---

# FASE 2 · Decisão

## As ÓBVIAS — implementadas nesta branch

Todas são **duplicação literal**: a mesma variável renderizada duas vezes na
mesma tela. **Nenhum número sai da tela em nenhuma delas.**

| # | Tela | O que sai | O que garante que nada se perde |
|---|---|---|---|
| **O-1** | Hoje | KPI *"previsto hoje"* | `previsaoHoje` continua no cartão "Previsão × recebido", ao lado do recebido — que é onde ele vira decisão. É o caso nomeado em guidelines §13 |
| **O-2** | Financeiro | frase final do cartão de ponto de equilíbrio | Os quatro números (`grossRevenue`, `totalCost`, `result`, `marginPct`) continuam nos quatro `KpiTile` imediatamente acima, na mesma ordem. A frase não trazia nenhum quinto número |
| **O-3** | Números | cartão *Insight 1* | A frase inteira — pico e brecha, com dia, hora e percentual — passa para o rodapé do mapa de calor, junto da legenda que já estava lá. Nenhuma palavra removida |

Efeito na contagem: Financeiro 15 → 15 blocos (a frase não era bloco, mas
quatro repetições dentro de um), Hoje 7 → 6, Números 10 → 9.

**A densidade real que cai não é a contagem de cartões — é a de repetições.**
O Financeiro tinha 4 dos seus 8 KPIs impressos duas vezes; agora tem zero.

## As DE JULGAMENTO — propostas, não implementadas

Cada uma exige saber o que o dono valoriza. Nenhuma foi tocada.

### P-1 · Hoje: três KPIs saem do mesmo par de números

`atendimentos`, `ocupação` e `horários livres` derivam todos de (`agendados`,
`totalSlots`). Quaisquer dois determinam o terceiro.

- **Decisão de cada um:** *quantas cadeiras giram* / *o dia está cheio* /
  *posso encaixar agora*.
- **Proposta:** manter **horários livres** (a decisão de balcão) e
  **atendimentos** (o volume), e mover **ocupação** para Números, onde ela já
  existe no recorte mensal com comparação — que é onde ocupação vira decisão.
- **Por que não implementei:** decidir que ocupação do dia não vale um KPI é
  saber que o dono olha o dia pela brecha, não pela taxa. Não sei isso.

### P-2 · Hoje: "Caixa de hoje" é a decomposição de "Recebido até agora"

Dois cartões adjacentes: um mostra o total, o outro as três parcelas.

- **Proposta:** um cartão só — previsão (barra) → recebido → aberto por meio.
- **Por que não implementei:** é fusão de composição, não duplicação de número.
  E depende de **STOP-1** ser resolvido antes: hoje as parcelas não fecham o
  total, e fundir os dois cartões tornaria o buraco visível sem explicá-lo —
  que é pior que os dois cartões separados.

### P-3 · Financeiro: os atalhos repetem os KPIs

*"Quanto sobrou"* mostra `operatingResult`, o mesmo número do KPI *"Resultado"*,
com outro nome, na mesma tela.

- **Proposta:** o cartão de atalho carrega o número **de destaque da tela de
  destino** — ou nenhum. Um atalho de navegação não precisa antecipar o
  resultado que já está no topo da mesma tela.
- **Por que não implementei:** decidir se atalho leva número é decisão de
  produto, e os quatro atalhos são o caminho para as telas de financeiro
  avançado.

### P-4 · Financeiro: "Faturamento da loja" × "Produtos (loja)"

Mesmo `receita.produtos`, duas vezes na tela.

- **Proposta:** sai o **KPI**, fica a linha da composição — a árvore precisa
  fechar (é o D6/P1-2). A legenda do KPI carrega `r.commissionsLoja`, que nesta
  tela só existe aí; ela já aparece na DRE, dentro da árvore de comissões.
- **Por que não implementei:** perder `commissionsLoja` do Resumo é uma
  decisão sobre quanto o Resumo deve responder sozinho. E o bloco Comercial
  cairia para 3 KPIs, o que interage com P-5.

### P-5 · O bloco "Comercial" do Financeiro responde perguntas de Mensalistas

Quatro KPIs, e **três** deles são sobre mensalistas — a mesma decisão que a
tela Mensalistas responde com fonte melhor:

| KPI no Financeiro | fonte | equivalente em Mensalistas | fonte |
|---|---|---|---|
| Crescimento líquido | status, sem data | — | — |
| Mensalidade média | `subscribers.price` | — | — |
| Inadimplência | `suspenso × price` | **Em aberto** | faturas |

- **Proposta:** o bloco Comercial sai do Financeiro. Mensalista se decide em
  Mensalistas, loja se decide na Loja, e o Resumo volta a ser *"quanto sobrou
  este mês"* — que é a pergunta que a `ARQUITETURA-DE-NAVEGACAO.md` atribui a
  ele.
- **Por que não implementei:** é a maior mudança de composição da rodada e
  redefine o que o Financeiro é. Precisa de decisão do dono.

### P-6 · O mesmo `receita.bruta` com dois nomes em duas telas

`"Receita realizada"` (Financeiro, DRE) e `"Faturamento"` (Números) são o mesmo
número. Guidelines §8: *duas telas mostrando o mesmo número com nomes
diferentes é defeito*.

- **Proposta:** um nome só, decidido por **UX-05**, que está fazendo a
  auditoria de vocabulário. Não proponho qual — não é meu ownership.
- **Nota de densidade:** o valor **deve** aparecer nas duas telas. O que Números
  acrescenta é o `Delta` contra o mês anterior, e essa é uma decisão diferente
  ("melhorei?"). O defeito é o nome, não a presença.

### P-7 · Números: o segundo insight

- A 1ª frase repete direção e percentual que o `Delta` do KPI já dá, mas
  acrescenta `noShowCount`, `lateCancelCount` e `totalBookings` — que não estão
  em nenhum outro lugar do produto. **Proposta:** virar legenda do KPI
  "Taxa de no-show", que é onde o número já mora.
- A 2ª frase é **conselho fixo**, idêntico em todo mês e em toda barbearia.
  Não é fato desta operação e não permite decisão. **Proposta:** sai.
- **Por que não implementei:** mover as três contagens para a legenda de um
  `KpiTile` é mudança de composição de um bloco que não é meu (`KpiTile` é de
  UX-04), e cortar a frase de conselho depende de saber se ela existe como
  orientação deliberada ao dono iniciante.

### P-8 · Mensalistas: três leituras do mesmo conjunto de faturas

"Em aberto" (valor) + "Régua de cobrança" (contagem por estágio) + tabela de
faturas (item a item, com `dueDate`) respondem à mesma decisão — *de quem eu
cobro hoje*.

- **Proposta:** a régua vira o **filtro** da tabela, em vez de um bloco
  paralelo: tocar em "D+5" filtra a lista. Uma leitura, com o corte por
  estágio preservado.
- **Por que não implementei:** exige interação nova, e o bloco vive parte em
  `mensal/page.tsx` (meu) e parte em `gerir-mensalistas.tsx` (**não é meu**).

---

# FASE 3 · O que foi ao código

Só as três ÓBVIAS. Diff em `painel/(dashboard)/page.tsx`,
`financeiro/page.tsx` e `numeros/page.tsx`, mais
`web/src/lib/__tests__/densidade.test.ts`, que trava as três contra
reintrodução — a duplicação de `previsaoHoje` já estava listada como proibida
em guidelines §13 e voltou a existir mesmo assim, o que é a prova de que
combinar não basta.

`mensal/page.tsx` **não foi alterado**: nenhuma das duplicações dele é literal.

---

# STOP-THE-LINE

Cinco achados que a auditoria encontrou e que **não são densidade** — são
integridade. Reportados pela regra 16.

## STOP-1 · Hoje: os filhos não somam o cabeçalho

```
Recebido até agora   = caixaDoDia().total      → TODAS as reservas recebidas
Caixa de hoje        = pix + cartao + dinheiro → só as com paymentMethod
```

`caixaDoDia` (em `analytics.ts`) soma o total sobre `recebidas` inteiro, mas as
três parcelas filtram por `paymentMethod`. Um atendimento concluído **sem meio
informado** entra no total e em nenhuma parcela. A tela mostra R$ 300 recebidos
e R$ 250 distribuídos, sem uma linha que explique os R$ 50.

É o defeito do CMV que guidelines §10.5 usa como exemplo: o cabeçalho certo, o
filho errado, e nenhum teste pega.

`caixaDiario` — a função irmã, usada no Fluxo — **já tem** o balde
`naoInformado` exatamente por isso, e o comentário dela diz por quê: *"o `else`
engolia o nulo e afirmava espécie"*. `caixaDoDia` não recebeu a mesma correção.

**Fora do meu ownership** (`analytics.ts`). **Handoff: FIN-01 / FIN-02.**

## STOP-2 · Financeiro: "Taxas por método" mostra preço de vendedor, não fato

O cartão lista as taxas da **Stone** e da **InfinitePay** a partir de
`paymentGateways`, uma constante fixa em `business-rules.ts`. A barbearia que
está olhando pode não usar nenhuma das duas.

E o produto **decidiu o contrário** em `tenant.ts`:

> *"Taxa é contrato de cada barbearia com a maquininha dela; chutar uma média
> de mercado faria o DRE debitar dinheiro que talvez não seja cobrado. Zero é
> honesto."*

O motor se recusa a inventar taxa; a tela exibe uma tabela de duas marcas. É a
mesma forma do exemplo proibido em guidelines §13 — *"Simulador da Loja
anunciando 40% numa barbearia onde ninguém tem 40%"*.

O rodapé agrava: *"as taxas são versionadas por data de vigência e não afetam
transações já registradas"* descreve `payments.feeAmount`, que é verdade — e
não é o que o cartão está mostrando.

**Recomendação:** ou o cartão passa a ler `policies.paymentFees` (as desta
barbearia), ou sai. Precisa de decisão — **UI DECISION REQUIRED** abaixo.

## STOP-3 · Financeiro: dois atalhos anunciam número que o destino não tem

| atalho | mostra | o destino encabeça |
|---|---|---|
| Fluxo de Caixa | `cashFlowMonthTotal` = soma de `caixa[].total` (só **entradas**, pelo líquido) | **"Sobrou no caixa"** = `fluxo.saldo` = entradas − saídas |
| Despesas | `expensesTotal` = **todas** as despesas, sem recorte de período | o DRE conta recorrentes vigentes + eventuais do período |

O dono lê um valor, clica, e vê outro. A Rodada 3.2 acabou de criar
`fluxo.saldo` — o atalho ficou apontando para o número anterior.

`useFinanceiro` **já expõe** `fluxo`, então a correção do primeiro é de uma
linha nesta tela. Não a fiz porque **trocar qual número o cartão mostra é
decisão**, e a fronteira com FIN-01/UX-02 é literalmente esse contrato.

## STOP-4 · Financeiro: "Crescimento líquido" afirma o que não aconteceu

```ts
newSubscribers: ativos.length,           // TODOS os ativos
caption: `+${newSubscribers} novos · −${cancellations} cancelamento(s)`
```

Uma barbearia com 40 mensalistas antigos e nenhum novo no mês lê **"+40
novos"**. `SubscriberDoc` não tem `createdAt` nem `canceledAt` — e
`analytics.ts` documenta essa ausência exata ao explicar por que o MRR
contratado é recortado pela data de referência.

O número **não pode ser calculado** com o modelo atual. Guidelines §9: *o
sistema não pode afirmar que algo aconteceu quando não aconteceu.*

**Recomendação:** o KPI sai enquanto o fato não existir. Requer decisão (é
remoção de conteúdo, não consolidação) — está em P-5.

## STOP-5 · Mensalistas: dois blocos, duas fontes, para a mesma pergunta

`MRR cobrável` sai de `subscribers.price × status === "ativo"`.
`MAPA-DE-FONTES.md` §3, coluna *"Nunca pode entrar"*, linha "Receita
mensalidade": **`subscriptions.price · status === "ativo"`**.

O bloco "Faturado / Recebido / Em aberto" logo acima já sai das faturas — a
fonte que o mapa manda usar. Os dois vivem na mesma tela e podem divergir sem
que nada na interface diga qual tem lastro.

**Handoff: FIN-02** (é decisão de modelo, não de composição).

---

# UI DECISION REQUIRED

```
UI DECISION REQUIRED

- contexto:     O cartão "Taxas por método" no Financeiro · Resumo lista as
                taxas da Stone e da InfinitePay a partir de uma constante fixa
                em `business-rules.ts`. É a única coisa na tela que não sai de
                um fato desta barbearia, e o próprio produto declara em
                `tenant.ts` que não inventa taxa de mercado — as reais moram em
                `policies.paymentFees` e já entram no "Custo total" ao lado,
                congeladas por pagamento.

- problema:     O dono não toma nenhuma decisão com ele. Se a taxa mostrada não
                é a dele, a decisão que ele tomar é errada; se é, o número já
                está no Custo total com lastro. E o seletor entre dois gateways
                sugere uma configuração que a tela não grava.

- proposta:     (a) o cartão passa a ler `tenant.policies.paymentFees` e vira
                    "as suas taxas", com link para Ajustes quando estiverem
                    zeradas; ou
                (b) o cartão sai do Resumo. A comparação entre maquininhas é
                    conteúdo de venda, não de operação diária.
                Recomendo (b) para esta tela e (a) em Ajustes, onde a taxa é
                configurada.

- impacto:      (a) muda o que o cartão mostra, sem mudar cálculo nenhum;
                (b) o Resumo perde um bloco e nenhum número com lastro.
                Nenhuma das duas toca `analytics.ts` nem `business-rules.ts`.

- componentes afetados:
                `financeiro/page.tsx` apenas. `paymentGateways` continua
                existindo para quem mais a consuma.
```

---

# Regra 19 — o que precisa ser olhado em tela

**Nada aqui está VERIFICADO.** Não tenho navegador. As três consolidações estão
**IMPLEMENTADAS** e **TESTADAS**.

| Tela | O que abrir | O que observar especificamente |
|---|---|---|
| **Hoje** `/painel` | mobile (360px) **e** desktop | A linha de indicadores passou de 4 para 3 cartões. No celular a grade é `grid-cols-2` — com 3 itens, o terceiro ocupa meia largura e sobra um vão à direita. **Confirmar se o vão é aceitável ou se a grade precisa virar 3 colunas no celular.** É o único risco visual das três mudanças |
| **Hoje** `/painel` | qualquer largura | O valor previsto continua visível **uma** vez, no cartão "Previsão × recebido". Confirmar que ele não some quando não há agenda |
| **Hoje** `/painel` | com um atendimento concluído **sem** informar o meio | STOP-1: "Recebido até agora" maior que a soma de Pix + Cartão + Dinheiro, sem explicação. Medir a diferença |
| **Financeiro** `/painel/financeiro` | desktop | O cartão de ponto de equilíbrio agora termina na barra. Confirmar que ele não ficou **curto demais** ao lado dos blocos vizinhos — a frase removida ocupava duas linhas, e o `Card` pode precisar de `padding` diferente |
| **Financeiro** `/painel/financeiro` | qualquer | Os quatro números da frase removida continuam legíveis nos KPIs acima: Receita realizada, Custo total, Resultado, Margem |
| **Financeiro** `/painel/financeiro` | numa barbearia com `paymentFees` zeradas | STOP-2: o cartão "Taxas por método" exibindo 0,99% / 1,99% enquanto o Custo total debita R$ 0,00 de taxa |
| **Financeiro** `/painel/financeiro` | numa barbearia com mensalistas antigos e nenhum novo | STOP-4: "Crescimento líquido" mostrando "+N novos" onde N é o total de ativos |
| **Números** `/painel/numeros` | desktop **e** mobile | A seção "Insights automáticos" tem **um** cartão agora, num grid `md:grid-cols-2` que virou coluna única. Confirmar que o cartão ocupa a largura inteira e não meia |
| **Números** `/painel/numeros` | desktop | O rodapé do mapa de calor tem três frases (legenda + pico + brecha). Confirmar que não ficou denso demais nem quebrou o `overflow-x` da grade |
| **Números** `/painel/numeros` | mês **sem** atendimento | O rodapé do mapa cita `peak.day`/`peak.hour`, que vêm de `heatCells[0]` quando a grade é vazia. A tela já é protegida por `semDados`, mas confirmar num mês com pouquíssimo movimento |
| **Mensalistas** `/painel/mensal` | qualquer | **Não foi alterada.** Observar STOP-5: "MRR cobrável" e "Faturado" lado a lado, e se eles batem |

---

*DENSITY-01 · 18/08/2026. Auditoria antes do código; três consolidações
literais implementadas; oito propostas de julgamento e cinco stop-the-line
entregues sem implementação.*
