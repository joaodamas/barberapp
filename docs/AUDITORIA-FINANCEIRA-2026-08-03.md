# Auditoria do motor financeiro

**Data:** 2026-08-03 · **Escopo:** `analytics.ts`, `business-rules.ts`, `use-financeiro.ts`, telas financeiras, `functions/`, CI
**Método:** leitura integral da cadeia de cálculo + **execução**. Todo número deste documento saiu de um script rodando contra o código real, com uma barbearia de referência (168 atendimentos, ticket R$ 74, R$ 12.432 em serviços, R$ 950 de loja, R$ 4.230 de custo fixo, 2 mensalistas). Nada aqui é estimado por inspeção.

> **Contexto:** a [auditoria de 02/08](./AUDITORIA-2026-08-02.md) é da era do `mock-data`. O motor foi reescrito desde então — tudo agora desce de `bookings` + `expenses`, e as inconsistências de dado daquela auditoria sumiram junto com os literais. Esta auditoria é do motor novo, e os problemas mudaram de natureza: não são mais de **dado divergente**, são de **modelagem contábil**.

---

## Sumário executivo

| Severidade | Qtd. | Natureza |
|---|---|---|
| 🔴 Crítico | 4 | o número exibido está errado, e errado a favor do usuário |
| 🟠 Alto | 8 | erro de cálculo, bloqueio do recurso multi-período, indicador inflado |
| 🟡 Médio | 6 | aproximação frágil, código morto, linha zerada em tela |
| **Total** | **18** | |

**Estado da base:** saudável na engenharia. `tsc --noEmit` limpo, `eslint` limpo, `next build` gera as 19 rotas, 65 testes passam no `web` e 63 no `functions`. A persistência entrou, o repositório é escopado por barbearia, as Cloud Functions existem com testes. O trabalho da auditoria anterior foi feito.

**O problema desta auditoria é outro, e é mais sério do que qualquer item da anterior:**

> ### O DRE informa uma margem de contribuição de 94,6% e um resultado de 60% da receita.
> Para uma barbearia, a margem de contribuição real fica entre 45% e 65%, e o Sebrae aponta margem de lucro de **15% a 30%**. O motor está entregando um número **2 a 4 vezes acima da realidade do setor** — porque **o custo do trabalho não entra na conta**.

Isso não é um bug de arredondamento. É o número que a estratégia inteira do produto usa como diferencial ("todo concorrente vende agenda; nós mostramos a conta"), é o número que vai para os vídeos, e é o número que o dono vai levar para decidir preço. **Errado para cima é o pior tipo de erro num produto financeiro:** o dono se sente bem, toma decisão ruim, e quando o extrato não bate ele conclui — corretamente — que o sistema mente.

**As três coisas que eu corrigiria antes de qualquer outra:**

1. **F1** — comissão sobre serviço e pró-labore. Sem isso o DRE não pode ser mostrado a ninguém.
2. **F2** — a projeção não desconta custo variável; "Resultado projetado" e "Resultado do mês" são grandezas diferentes com o mesmo nome.
3. **F4** — os 37 testes que provam o isolamento entre barbearias **não rodam no CI**. A documentação afirma que o isolamento está "provado por 37 testes"; hoje eles são pulados em silêncio.

---

## 🔴 Críticos

### F1 · O custo do trabalho não entra no DRE

**Onde:** `web/src/lib/analytics.ts:174-182`, `web/src/lib/db/use-financeiro.ts:41-47`

```ts
// analytics.ts — comissão calculada SÓ sobre o lucro da loja
const lucroLoja = Math.max(receita.produtos - cmv, 0);
const commissions = Math.round((lucroLoja * policies.commissionSplit.barberPct) / 100);

const payroll = params.payroll ?? 0;          // ← nenhum chamador passa
const gatewayFees = params.gatewayFeesTotal ?? 0;  // ← nenhum chamador passa
```

Confirmado por busca: **`payroll` e `gatewayFeesTotal` não são fornecidos por nenhum chamador em todo o `src`.** O único caller (`use-financeiro.ts`) passa apenas `receita`, `expenses`, `movements`, `periodo` e `policies`.

**Resultado medido:**

```
Receita de serviços        R$ 12.432,00
Receita bruta              R$ 13.650,00
Comissões lançadas         R$    140,00   ← 40% sobre R$ 350 de lucro da LOJA
Folha (payroll)            R$      0,00
Taxas de gateway           R$      0,00
Custo variável total       R$    740,00
Margem de contribuição     R$ 12.910,00   (94,6%)
Resultado do mês           R$  8.159,00   (60% da receita)
```

**Os R$ 12.432 de serviço — 91% da receita — não geram um centavo de custo de mão de obra.**

Três defeitos distintos, empilhados:

**(a) A base da comissão está errada.** A pesquisa de mercado é consistente: a comissão do barbeiro no Brasil é de **35% a 60% sobre o faturamento do serviço** — não sobre lucro bruto, e não só sobre produto. É a maior linha de custo de uma barbearia com equipe. Aplicando 40% sobre serviços, o resultado do exemplo cai de **R$ 8.159 para R$ 3.186**.

**(b) A operação solo não tem pró-labore.** O DRE renderiza a linha *"(−) Custo de Folha (Mão de Obra) (operação solo)"* — e ela é **sempre R$ 0,00**. O comentário do `business-rules.ts` diz o oposto do que o código faz:

> *"Mesmo na operação solo, o rateio é registrado: separa o 'salário do dono como barbeiro' do resultado da empresa — essencial para o DRE refletir a realidade."*

Sem separar, "Resultado do Mês" não é lucro da empresa: é lucro **mais** o salário do dono, somados, apresentados como se fossem lucro. O dono acha que a barbearia dá 60% de margem quando ela dá 15% e paga um salário.

**(c) Taxa de gateway nunca é aplicada.** A tela de Financeiro exibe uma tabela de taxas por gateway "para comparação", e o DRE tem a linha "Taxas de gateway" — sempre zerada. Com Pix a 0,99% e crédito a 3,15%, sobre R$ 13.650 isso é R$ 135 a R$ 430/mês que não aparecem.

**Correção:**

```ts
// 1. Comissão sobre o serviço, no rateio do tenant
const receitaServico = receita.servicos + receita.encaixes;
const commissionsServico = (receitaServico * policies.commissionSplit.barberPct) / 100;

// 2. Operação solo: o rateio vira pró-labore, não some
const payroll = params.payroll ?? (isSolo ? commissionsServico : 0);
const commissions = isSolo ? commissionsLoja : commissionsServico + commissionsLoja;

// 3. Taxa efetiva por meio de pagamento, sobre o que passou por gateway
const gatewayFees = somaTaxasPorMetodo(bookings, tenant.gatewayFees);
```

**Decisão de produto necessária:** na operação solo, o rateio de 40% deve aparecer como **pró-labore no custo fixo** (recomendado — é o que torna o resultado comparável com o de uma barbearia com equipe) ou como **comissão no custo variável**? A escolha muda a margem de contribuição, que é o indicador de topo da tela. Recomendo pró-labore: o dono-barbeiro trabalha independentemente do volume, então é custo fixo, e é assim que o resultado fica comparável entre operações.

---

### F2 · "Resultado projetado" e "Resultado do mês" não são a mesma grandeza

**Onde:** `web/src/lib/analytics.ts:461` vs `:186`

```ts
// projeção
const net = bookingRevenue + subscriptionCharge - fixedExpense;
```

A projeção subtrai **apenas despesa fixa recorrente**. Não subtrai CMV, comissão, taxa de gateway, despesa eventual nem imposto.

**Medido, mesma barbearia, mesmo mês:**

```
Resultado projetado (tela Projeção):  R$ 9.781,00
Resultado do mês    (tela DRE):       R$ 8.159,00

Ignorados pela projeção:
  custo variável      R$ 740,00
  imposto             R$ 521,00
  despesa eventual    R$ 150,00
```

E note que os R$ 8.159 do DRE **já estão errados por F1**. Corrigido F1, a distância entre as duas telas passa de 20% para mais de 200%.

O KPI se chama **"Resultado projetado"**, com legenda "acumulado nos 30 dias". Um dono que compare as duas telas encontra dois "resultados" diferentes para períodos vizinhos, sem nenhuma explicação na interface.

**Agravante de comunicação:** na mesma linha de KPIs, "Receita já confirmada" soma **somente** dias confirmados, enquanto "Resultado projetado" usa o acumulado que **inclui estimativa**. Dois números lado a lado com regras de inclusão opostas.

**Correção:** aplicar à projeção a mesma cadeia do DRE — margem de contribuição sobre a receita projetada, depois fixo, depois imposto. E renomear: ou as duas telas dizem "Resultado", com a mesma definição, ou a projeção passa a dizer **"Saldo de caixa projetado"**, que é o que ela realmente calcula.

---

### F3 · Receita de mensalista ignora o período consultado

**Onde:** `web/src/lib/analytics.ts:76-78`

```ts
const mensalistas = subscribers
  .filter((s) => s.status === "ativo")     // ← nenhum filtro de período
  .reduce((s, sub) => s + sub.price, 0);
```

**Medido:** consultando **janeiro/2026**, sem uma única reserva no mês, com assinantes cujo `nextCharge` é **agosto/2026**:

```
mensalistas: R$ 268,00 | receita bruta: R$ 268,00
```

Todo mês do histórico recebe o MRR de **hoje**. Consequências em cadeia:

- O DRE de qualquer mês passado é inflado pela base de assinantes atual.
- A comparação "mês vs. mês anterior" da tela Números fica distorcida — os dois meses recebem o mesmo bloco de mensalidade, escondendo exatamente o crescimento que o indicador existe para mostrar.
- Um mês anterior à existência do clube de assinatura aparece com receita de clube.

**Correção:** derivar de cobranças efetivamente realizadas no período (`payments`/`subscriptions` com data), não da foto atual de assinantes ativos. Enquanto a cobrança recorrente não existir, o mês corrente pode usar a projeção do MRR — mas **meses fechados precisam usar o que foi cobrado**, e a diferença precisa estar rotulada na tela.

---

### F4 · Os 37 testes de isolamento entre barbearias não rodam no CI

**Onde:** `.github/workflows/ci.yml`, `functions/src/__tests__/firestore-rules.test.ts`

**Medido:**

```
functions: Test Files 1 failed | 4 passed (5)
           Tests  63 passed | 37 skipped (100)
           Error: connect ECONNREFUSED 127.0.0.1:8080
```

Os testes de Security Rules exigem o emulador do Firestore. O workflow de CI roda `npm ci`, `npm run typecheck` e `npm run test` — **e não sobe emulador nenhum**. Os 37 testes são pulados.

Isso importa porque a [`ESTRATEGIA-SAAS.md`](./ESTRATEGIA-SAAS.md) e o [`PLANOS-E-FUNCIONALIDADES.md`](./PLANOS-E-FUNCIONALIDADES.md) afirmam textualmente *"multi-barbearia com isolamento provado por 37 testes de regra ✅"*. Hoje essa afirmação não é verificada por nenhum pipeline: uma alteração nas `firestore.rules` que vaze o financeiro de uma barbearia para outra passa no CI verde.

**Correção:** adicionar o passo do emulador ao job de functions e **falhar o build se algum teste for pulado**:

```yaml
- run: npm i -g firebase-tools
- run: firebase emulators:exec --only firestore "npx vitest run"
```

E `--passWithNoTests=false` + verificação explícita de contagem, para que "pulado" nunca mais seja confundido com "passou".

---

## 🟠 Altos

### F5 · Mensalista é cobrado uma única vez em janelas longas

**Onde:** `web/src/lib/analytics.ts:453-455`

```ts
const subscriptionCharge = ativos
  .filter((s) => s.nextCharge === date)     // ← igualdade com UMA data
  .reduce((s, sub) => s + sub.price, 0);
```

**Medido, janela de 90 dias:**

```
cobranças de mensalista em 90 dias: 1  → data: 2026-08-10
MRR de R$ 268 vira R$ 268 em 3 meses (esperado: ~R$ 804)
```

Em 30 dias o defeito é invisível — cada assinante tem exatamente uma cobrança na janela. **Em qualquer horizonte maior ele subestima a receita recorrente em proporção direta ao horizonte:** o trimestre perde 2/3, o ano perde 11/12.

Isto **bloqueia diretamente o recurso de projeção trimestral/semestral/anual** — ver [`PROJECAO-E-INSIGHTS.md`](./PROJECAO-E-INSIGHTS.md).

---

### F6 · Despesa fixa vencendo dia 29, 30 ou 31 desaparece em meses curtos

**Onde:** `web/src/lib/analytics.ts:457-459`

```ts
const fixedExpense = recorrentes
  .filter((e) => Number(e.date.slice(-2)) === d.getDate())
  .reduce((s, e) => s + e.value, 0);
```

O vencimento é o **dia do mês da data original**. Setembro não tem dia 31 — a despesa nunca é lançada.

**Medido**, com "Contador R$ 400" vencendo dia 31:

```
despesa fixa em 2026-08: R$ 4.080,00   ← inclui o contador
despesa fixa em 2026-09: R$ 3.680,00   ← contador sumiu
despesa fixa em 2026-10: R$ 3.680,00   ← sumiu de novo (outubro TEM dia 31)
```

Outubro tem 31 dias e mesmo assim ficou de fora — porque a janela de 90 dias iniciada em 01/08 termina em 29/10, antes do dia 31. Mas setembro é o caso puro: o dia não existe.

Aluguel vencendo dia 30 some em fevereiro; qualquer coisa no dia 31 some em quatro meses do ano.

**Correção:** `Math.min(diaDoVencimento, diasNoMes(d))` — o padrão de mercado é antecipar para o último dia útil disponível.

---

### F7 · `diasNoMes` lê o dia final da data, não a duração do período

**Onde:** `web/src/lib/analytics.ts:191`

```ts
const diasNoMes = Number(periodo.fim.slice(-2));
```

Funciona por coincidência: em um período mensal, o último dia **é** a quantidade de dias. Em qualquer outro período, não.

**Medido**, período 01/07 – 30/09 (92 dias):

```
diasNoMes calculado: 30     (esperado: 92)
breakEvenDay: 13
```

`diasNoMes` alimenta `breakEvenDayFor`, então o ponto de equilíbrio de um trimestre sai calculado como se o trimestre tivesse 30 dias.

**Este é o segundo bloqueio estrutural do recurso multi-período.** A função `resultadoDoMes` recebe um `Periodo` genérico e assume mês em silêncio.

**Correção:** contar dias de fato entre `inicio` e `fim`, e renomear para `diasNoPeriodo`.

---

### F8 · O ponto de equilíbrio não usa margem de contribuição

**Onde:** `web/src/lib/analytics.ts:216-220`

```ts
function breakEvenDayFor(receita, custo, diasNoMes) {
  const dia = Math.ceil(safeDiv(custo, receita / diasNoMes));
  return dia > 0 && dia <= diasNoMes ? dia : null;
}
```

Isso responde *"em que dia do mês a receita acumulada cobre o custo total, se a receita for uniforme"*. Não é o ponto de equilíbrio — é um dia de cobertura.

Dois defeitos:

**(a) A fórmula está conceitualmente errada.** Ponto de equilíbrio é `custo fixo ÷ margem de contribuição %`. Aqui divide-se **custo total** (que já inclui o custo variável) pela receita média diária, misturando uma grandeza que escala com a receita numa conta que assume receita conhecida.

**Medido:**
```
breakEvenDay exibido:              dia 13
Receita de equilíbrio correta:     custo fixo R$ 4.230 ÷ 94,6% = R$ 4.472
```

**(b) A tela nunca mostra o número que o dono precisa.** Ele não decide com "dia 13". Ele decide com **"você precisa faturar R$ X por mês"** e **"são Y atendimentos ao ticket atual"**. Esses dois números não existem em lugar nenhum do produto — e são exatamente o que a estratégia de conteúdo promete mostrar ([roteiro A2](./marketing/ROTEIROS-VIDEOS.md)).

**Correção:** expor `breakEvenRevenue`, `breakEvenAppointments` e manter `breakEvenDay` como leitura secundária.

---

### F9 · Ticket médio contaminado por produto e mensalidade

**Onde:** `web/src/lib/analytics.ts:252`

```ts
avgTicket: Math.round(safeDiv(params.receita.bruta, params.receita.atendimentos)),
```

`receita.bruta` inclui produtos e mensalidades; `atendimentos` conta **apenas** reservas concluídas.

**Medido:**
```
R$ 13.650 / 168 atendimentos = R$ 81,00
ticket de serviço correto      = R$ 74,00
superestimado em R$ 7,00 (9,5%)
```

O erro cresce com a maturidade da barbearia: quanto melhor o clube de assinatura e a loja — exatamente o que o produto incentiva —, mais inflado fica o ticket. Uma barbearia com clube forte pode ver ticket 40% acima do real.

**Correção:** `avgTicket = (servicos + encaixes) / atendimentos`, e expor `receitaPorCliente` como indicador separado, que é o que de fato inclui produto e assinatura.

---

### F10 · Mapa de calor divide por semanas com reserva, não por semanas do período

**Onde:** `web/src/lib/analytics.ts:377-383`

```ts
semanas.add(`${b.date.slice(0, 4)}-${semanaDoAno(b.date)}`);  // só quando HÁ reserva
const totalSemanas = Math.max(semanas.size, 1);
```

O denominador conta apenas as semanas em que houve alguma reserva **em qualquer horário**, não as semanas do período.

**Medido**, uma única reserva em julho inteiro (segunda 06/07, 09:00):

```
ocupação segunda 09:00: 100%
```

Julho tem ~4,4 semanas. Uma reserva deveria dar ~23%. **O mapa mostra 100%.**

O impacto vai além do mapa: os "Insights automáticos" da tela Números derivam de `peak` e `idle` do heatmap. Numa barbearia nova ou num mês fraco — precisamente quem mais precisa do insight — o painel afirma "100% de ocupação" num horário que teve um cliente.

**Correção:** denominador = número de ocorrências daquele dia da semana dentro do período (contadas do calendário, não do dado).

---

### F11 · Dia com reserva pequena não recebe complemento da média

**Onde:** `web/src/lib/analytics.ts:450-451`

```ts
const isEstimate = !isClosed && confirmado === 0;
const bookingRevenue = isClosed ? 0 : confirmado || media(dow);
```

A regra é binária: se houver **qualquer** valor confirmado, o dia é tratado como fechado em receita.

**Medido:**
```
2026-08-03  rev = R$  40,00  estimado=false   ← 1 reserva de R$40, dia inteiro pela frente
2026-08-04  rev = R$ 469,00  estimado=true
2026-08-05  rev = R$ 481,00  estimado=true
```

O dia 03 tem uma reserva de R$ 40 marcada e projeta R$ 40. Os dias vizinhos, **sem nenhuma reserva**, projetam R$ 469 e R$ 481.

Como as reservas se concentram nos próximos dias e rareiam adiante, isso produz um viés sistemático: **quanto mais próximo o dia, mais subestimada a receita** — e é justamente o curto prazo que o dono usa para decidir. O "Ponto mais apertado" tende a cair sempre nos primeiros dias, por artefato de cálculo.

**Correção:** `max(confirmado, media(dow))` para dias futuros, ou o modelo mais correto — confirmado + (média × fração da jornada ainda não reservada).

---

### F12 · `policies.openWeekdays` é código morto que aparenta ser configuração

**Onde:** `web/src/lib/tenant.ts:57`, `web/src/lib/business-rules.ts:79`

Busca em todo o `src`: `policies.openWeekdays` **não é lido por nenhuma tela ou função**. Quem manda é `tenant.schedule.weekdays` — é o que o onboarding grava (`passo-horarios.tsx:139`) e o que `slots.ts` e `use-financeiro.ts` consomem.

Idem para `business-rules.isOpenOn()`: definida, exportada, nunca usada (a única referência é uma reimplementação local no teste de slots).

Dois campos para o mesmo fato, num objeto que a documentação vende como "13 políticas configuráveis por barbearia". Uma barbearia que abrir aos domingos terá `schedule.weekdays` correto e `policies.openWeekdays` mentindo — e o próximo desenvolvedor tem 50% de chance de ler o errado.

**Correção:** remover `openWeekdays` de `TenantPolicies` e `isOpenOn` de `business-rules`. Fonte única: `schedule.weekdays`.

---

## 🟡 Médios

### F13 · O DRE exibe duas linhas permanentemente zeradas
`dre/page.tsx:289-294` e `:129-131` renderizam "Custo de Folha (Mão de Obra)" e "Taxas de gateway", ambas sempre R$ 0,00 (consequência de F1). Uma linha de custo zerada num demonstrativo comunica "aqui não há custo", não "ainda não implementado". Enquanto F1 não for corrigido, ocultar a linha é mais honesto que exibi-la zerada.

### F14 · Capacidade mensal usa 4,3 semanas fixas e ignora o mês em curso
`use-financeiro.ts:56` — `capacidadeDiaria(schedule) * diasAbertos * 4.3`. Dois efeitos: (a) fevereiro e meses de 31 dias recebem a mesma capacidade; (b) no **mês corrente** a ocupação é medida contra a capacidade do mês inteiro — no dia 3, o painel mostra ~10% de ocupação e o dono lê isso como agenda vazia. A capacidade precisa ser proporcional aos dias **decorridos** quando o período é o mês em curso.

### F15 · O mapa de calor fixa segunda a sábado no código
`analytics.ts:363` — `const dias = ["Seg", ..., "Sáb"]` e `if (dow === 0) continue`. Uma barbearia que abra aos domingos (e `schedule.weekdays` permite) tem todo o movimento de domingo descartado do mapa e dos insights. O eixo precisa vir de `schedule.weekdays`.

### F16 · `semanaDoAno` não é a semana ISO
`analytics.ts:388-392` usa uma aproximação por dias corridos desde 1º de janeiro. Divergiria da semana ISO na virada de ano e em anos que começam no meio da semana. Hoje só alimenta o denominador do heatmap — que será substituído por F10 —, mas se for reaproveitado para agrupamento semanal vira erro visível.

### F17 · CMV é o custo das **compras** do período, não do que foi **vendido**
`analytics.ts:167-169` soma os movimentos `kind === "compra"` do período. Uma reposição de estoque de R$ 3.000 feita em julho entra inteira no CMV de julho, ainda que 90% seja vendido nos meses seguintes. A linha se chama "(−) Custo de Mercadoria Vendida" no DRE.
Efeito: o mês da compra parece ruim, os seguintes parecem ótimos, e a margem da loja oscila sem relação com o negócio. **Correção:** custear a venda pelo `cost` do produto (`ProductDoc.cost` já existe) no momento do movimento `venda`.

### F18 · A projeção aprende só com o mês corrente
`use-financeiro.ts:87` passa `historico: caixa`, e `caixa` é o `caixaDiario` **do mês consultado**. No dia 2 do mês, a média por dia da semana é calculada sobre um ou dois dias de dado. Para uma projeção de 30 dias — e mais ainda para as janelas longas pedidas — a base precisa ser dos últimos 60 a 90 dias.

---

## O que está bem feito e não deve regredir

Vale registrar, porque é o que torna as correções acima baratas:

1. **Tudo desce de duas fontes.** `bookings` + `expenses` alimentam DRE, caixa, projeção e indicadores. É o que fez as inconsistências da auditoria anterior sumirem — e é por isso que os 18 achados de hoje são consertáveis em pontos únicos.
2. **Funções puras e testáveis.** `analytics.ts` não toca no Firestore. Cada bug deste documento foi reproduzido em um teste de 10 linhas.
3. **A classificação de recorrência por hábito do cliente** (`recorrenciaDeClientes`) é genuinamente melhor que o padrão do mercado, que usa prazo fixo. Quem vem a cada 7 dias e sumiu há 20 não é o mesmo caso de quem vem a cada 40.
4. **`isReceived` distingue regime de caixa de competência** — Pix e cartão contam ao confirmar, dinheiro só ao concluir. É a distinção certa e raramente feita.
5. **Comentários que explicam o porquê**, não o quê — inclusive registrando erros passados ("o custo fixo ficava 45% inflado"). Preservar.

---

## Validação do que ainda não subiu para produção

Checklist para exercitar antes do primeiro cliente externo. Cada item foi escolhido porque a auditoria mostrou que a lógica correspondente ou não é coberta por teste, ou depende de infraestrutura ausente.

### Bloqueadores de correção (fazer antes de validar)

- [ ] **F1** — comissão de serviço + pró-labore + taxa de gateway no DRE
- [ ] **F2** — projeção com custo variável e imposto, ou renomeada para "saldo de caixa"
- [ ] **F3** — mensalista por cobrança realizada, não por foto de assinantes
- [ ] **F4** — emulador no CI, falhando quando houver teste pulado

### Regras de segurança e isolamento

- [ ] Rodar os 37 testes com emulador **localmente** e confirmar 37 passando, não pulados
- [ ] Dono da barbearia A tenta ler `/barbershops/B/expenses` → negado
- [ ] Cliente final autenticado tenta ler `bookings` de outro cliente → negado
- [ ] Usuário sem claim tenta escrever em qualquer subcoleção → negado
- [ ] `platformAdmin` acessa duas barbearias → permitido
- [ ] Confirmar que os índices declarados em `firestore.indexes.json` cobrem toda query com `where` + `orderBy` (uma query sem índice falha só em produção, com dado real)

### Provisionamento e onboarding

- [ ] Cadastro self-service cria tenant, grava slug atômico e concede o claim
- [ ] Slug duplicado é rejeitado sem criar tenant órfão
- [ ] Slug reservado (`www`, `app`, `admin`, `api`) é rejeitado
- [ ] Onboarding gravando `schedule.weekdays` reflete de fato na grade de horários e na projeção
- [ ] Trial de 7 dias: `trialDaysLeft` na virada do dia, e o que acontece **no dia 8** (o comportamento de expiração não tem teste)

### Motor financeiro — com dado real, não fixture

- [ ] Mês com receita zero e despesas lançadas → DRE sem `NaN`, sem divisão por zero
- [ ] Mês com prejuízo → imposto não é cobrado (coberto por teste ✅) e a projeção não fica positiva
- [ ] Barbearia nova, sem histórico → projeção mostra vazio útil, não R$ 0,00 travestido de previsão
- [ ] Despesa recorrente vencendo dia 31 → conferir em setembro (**F6**)
- [ ] Dois assinantes com `nextCharge` em meses diferentes → conferir a soma em 90 dias (**F5**)
- [ ] Conferir o DRE de um mês fechado **contra o extrato bancário real da barbearia parceira**. É a única validação que importa de verdade

### PWA, cache e multi-tenant

- [ ] Duas barbearias no mesmo navegador → nenhum vazamento de cache entre origens
- [ ] `skipWaiting` durante deploy com aba aberta → sem tela branca
- [ ] Instalação do PWA por subdomínio → ícone e nome corretos por barbearia
- [ ] Modo offline → telas que já carregaram continuam legíveis

### O que não pode ser validado porque não existe

Registrado para não ser confundido com "não testado":

| Módulo | Situação |
|---|---|
| Envio de WhatsApp | templates e validação existem; client, webhook e gatilhos, não |
| Gateway de pagamento | nenhuma cobrança real |
| Estorno via API | o cancelamento calcula a devolução; ninguém devolve |
| Cobrança recorrente de mensalista | régua é visual |
| NFS-e, fechamento em PDF | inexistentes |

---

## Plano de correção priorizado

### P0 — antes de mostrar o DRE a qualquer pessoa (2–3 dias)

| # | Ação | Por quê |
|---|---|---|
| **F1** | Comissão sobre serviço, pró-labore na operação solo, taxa de gateway | O número exibido está 2–4× acima da realidade |
| **F4** | Emulador no CI + falhar em teste pulado | O isolamento entre barbearias não é verificado |
| **F3** | Mensalista por período | Contamina todo o histórico |
| **F13** | Ocultar linhas zeradas até F1 entrar | Honestidade da tela |

### P1 — antes do recurso multi-período (3–5 dias)

| # | Ação |
|---|---|
| **F7** | `diasNoPeriodo` contado de fato — **bloqueia trimestre/semestre/ano** |
| **F5** | Recorrência mensal de assinatura — **bloqueia trimestre/semestre/ano** |
| **F6** | Vencimento com `min(dia, últimoDiaDoMês)` |
| **F2** | Projeção com custo variável e imposto |
| **F11** | `max(confirmado, média)` nos dias futuros |
| **F18** | Base histórica de 60–90 dias |

### P2 — qualidade de indicador (2–3 dias)

| # | Ação |
|---|---|
| **F8** | `breakEvenRevenue` + `breakEvenAppointments` na tela |
| **F9** | Ticket de serviço separado de receita por cliente |
| **F10** | Denominador do heatmap pelo calendário |
| **F14** | Capacidade proporcional aos dias decorridos |
| **F17** | CMV pelo custo do produto vendido |

### P3 — higiene (1 dia)

| # | Ação |
|---|---|
| **F12** | Remover `policies.openWeekdays` e `isOpenOn` |
| **F15** | Eixo do heatmap vindo de `schedule.weekdays` |
| **F16** | Semana ISO, se for reaproveitada |

**Regra de teste:** cada correção acima entra com o teste que reproduz o defeito **antes** da correção. Os nove scripts que produziram as evidências deste documento viram testes de regressão — é uma hora de trabalho e fecha permanentemente a classe de bug mais cara do produto.

---

## Anexo — o que foi verificado por execução

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` (web) | ✅ 0 erros |
| `npm run build` (web) | ✅ 19 rotas, todas `ƒ` dinâmicas |
| `npx vitest run` (web) | ✅ 65 testes, 5 arquivos |
| `npx vitest run` (functions) | ⚠️ 63 passaram, **37 pulados**, 1 arquivo falhou (emulador ausente) |
| Comissão sobre R$ 12.432 de serviço | R$ 0 · comissão total lançada: R$ 140 (só loja) |
| `payroll` / `gatewayFeesTotal` fornecidos por algum chamador | **0 ocorrências** |
| Margem de contribuição resultante | 94,6% (referência de setor: 45–65%) |
| Resultado do mês / receita | 60% (Sebrae: 15–30%) |
| Receita de mensalista em janeiro/2026 sem reservas | R$ 268 |
| Ticket médio calculado vs. ticket de serviço | R$ 81 vs. R$ 74 (+9,5%) |
| Resultado projetado vs. resultado do DRE | R$ 9.781 vs. R$ 8.159 |
| Cobranças de mensalista em janela de 90 dias | 1 (esperado ~3 por assinante) |
| Despesa fixa de dia 31 em setembro | ausente |
| `diasNoMes` em período de 92 dias | 30 |
| Ocupação do heatmap com 1 reserva no mês | 100% |
| Dia com 1 reserva de R$ 40 vs. dias vizinhos estimados | R$ 40 vs. R$ 469 / R$ 481 |
| `policies.openWeekdays` lido por alguma tela | **0 ocorrências** |

---

## Referências

- [`PROJECAO-E-INSIGHTS.md`](./PROJECAO-E-INSIGHTS.md) — especificação do multi-período e dos insights de mercado
- [`AUDITORIA-2026-08-02.md`](./AUDITORIA-2026-08-02.md) — auditoria anterior (era do mock)
- [`PLANOS-E-FUNCIONALIDADES.md`](./PLANOS-E-FUNCIONALIDADES.md) — inventário e planos
- [`ESTRATEGIA-SAAS.md`](./ESTRATEGIA-SAAS.md) — arquitetura multi-tenant
- [`marketing/`](./marketing/) — o conteúdo que depende destes números estarem certos
