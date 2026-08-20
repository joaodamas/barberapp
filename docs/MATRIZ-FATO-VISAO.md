# Matriz fato × visão — onde cada real aparece, e por quê

Fase 2.1. Continua a reconciliação de `LEDGER-DE-VALIDACAO.md`, sobre a mesma
massa conhecida e **sem alterar o motor**.

A pergunta não é *"cada tela mostra um número plausível?"*. É:

> Para cada real que entra no sistema, onde ele nasceu, onde foi parar, e por
> que aparece — ou por que não aparece — em cada visão.

Prova executável em `web/src/lib/__tests__/seis-visoes.test.ts` (**35 asserções**).
Cada visão é montada exatamente como a tela a monta: mesmas funções, mesmos
argumentos, com a linha do arquivo citada onde a expressão é peculiar.

---

## 1. Divergência não é sinônimo de erro

Duas telas mostrarem números diferentes pode ser cinco coisas. Classificar cada
caso **antes** de corrigir é o que impede de "consertar" uma diferença que
deveria existir.

| Classe | Significa | Exemplo nesta massa |
|---|---|---|
| **Granularidade** | recortes diferentes do mesmo fato | Dashboard é do **dia**; DRE é do **mês** |
| **Competência** | períodos diferentes | Projeção olha para **outubro**; DRE fecha **setembro** |
| **Conceito** | perguntas diferentes | mensalista é **contratado** na Projeção e **não realizado** no DRE |
| **Nomenclatura** | o número está certo, o rótulo não | "Despesas" exibindo o custo **total** |
| **Erro** | o número não sustenta o que afirma | produto entrando todo como dinheiro |

**Só a última exige correção de cálculo.** As quatro primeiras exigem, no
máximo, uma legenda — e às vezes nem isso.

---

## 2. A matriz

Massa: R$ 680,00 de receita realizada, R$ 348,00 deliberadamente fora dela.

| Fato | Dashboard | Financeiro | DRE | Fluxo | Projeção | Comissões |
|---|---|---|---|---|---|---|
| **Receita de serviço** R$ 390 | ✅ por dia | ✅ 390 | ✅ 390 | ✅ 390 (200 pix · 140 cartão · 50 din.) | — futuro | ✅ base 390 |
| **Receita de produto** R$ 290 | ⬜ não conhece | ✅ 290 | ✅ 290 | ⚠️ 290 **todo em dinheiro** | — futuro | ⬜ base própria |
| **Mensalistas** R$ 248 | ⬜ | 🔵 à parte | ❌ **dentro da árvore** | ⬜ fora | 🔵 **projetado** | ⬜ |
| **No-show** R$ 50 | ⚠️ **fica na previsão** | ⬜ fora | ⬜ fora | ⬜ fora | ⬜ | ⬜ fora |
| **Cancelamento** R$ 50 | ⬜ some | ⬜ fora | ⬜ fora | ⬜ fora | ⬜ | ⬜ fora |
| **CMV** | ⬜ | ⬜ | ⚠️ **180** (ledger: 116) | ⬜ | ⬜ | ⬜ |
| **Comissão** R$ 222,50 | ⬜ | ❌ **222,50 sob a loja** | ✅ 178,50 + 44 | ⬜ | ⬜ | ✅ por barbeiro |
| **Taxas** | ⬜ | ⬜ | ⚠️ **4** (ledger: 7,85) | ⬜ | ⬜ | ⬜ |
| **Imposto** | ⬜ | ⬜ | ⚠️ **41** (ledger: 40,80) | ⬜ | ⬜ | ⬜ |
| **Despesas** R$ 2.550 | ⬜ | ⚠️ **2.997,50** | ✅ 2.350 + 200 | ⬜ **não conhece saída** | ✅ 2.350 | ⬜ |

✅ correto · 🔵 correto e **deliberadamente diferente** · ⬜ ausente por desenho ·
⚠️ divergente · ❌ erro

---

## 3. Origem de cada real

### R$ 390,00 · receita de serviço

**Nasce** em 8 documentos de `bookings` com `status: "completed"`. Cada um vira,
na conclusão, um `payment` e uma `commission` congelados.

| Visão | Valor | Origem |
|---|---|---|
| Dashboard | por dia (90 no dia 03) | `caixaDoDia(agendados)`, filtrado por `isReceived` |
| Financeiro | 390 dentro de 680 | `receita.servicos` |
| DRE | 390 | idem, como filho de "Receita realizada" |
| Fluxo | 200 pix · 140 cartão · 50 dinheiro | `caixaDiario`, por `paymentMethod` |
| Comissões | base 390 | `comissoesDeServico`, soma das bases |

**Fecha nas cinco.** É o caminho mais sólido do produto.

### R$ 290,00 · receita de produto

**Nasce** em 5 `inventory_movements` com `kind: "venda"`.

| Visão | Valor | Observação |
|---|---|---|
| Dashboard | **ausente** | ⬜ desenho: o Dashboard é agenda, e `caixaDoDia` só recebe reservas |
| Financeiro | 290 | ✅ |
| DRE | 290 | ✅, com drill-down por movimento |
| Fluxo | 290 **em dinheiro** | ❌ **erro** — o meio de pagamento real se perde |
| Comissões | não entra na base | ✅ correto: produto paga sobre o **lucro** |

> **A ausência no Dashboard é decisão, não falha** — mas vale registrar: o dono
> que vende uma pomada às 10h não vê o valor no "caixa de hoje". Ele só aparece
> no fechamento do mês.

### R$ 248,00 · mensalistas — o caso mais instrutivo

**Nasce** em 2 documentos de `subscriptions` com `status: "ativo"`, **sem
nenhum recebimento associado**.

| Visão | Aparece? | Classe |
|---|---|---|
| Financeiro | 🔵 sim, em cartão próprio ("MRR contratado") | **conceito** — correto |
| DRE | 🔵 sim, em "Receita contratada" | **conceito** — correto |
| DRE, árvore de receita | ❌ **sim, entre os filhos da receita realizada** | **erro** |
| Fluxo | ⬜ não | correto |
| Projeção | 🔵 **sim, como cobrança futura** | **competência** — correto |
| Receita realizada | ⬜ **não**, em nenhuma tela | **a invariante** |

**A mesma mensalidade aparece em três lugares por três motivos diferentes, e
dois estão certos.** Ela é contrato (Financeiro), é expectativa de caixa
(Projeção) e **não** é receita (DRE). O único erro é a árvore do DRE, que a lista
sob um cabeçalho que não a contém — os filhos somam 928 sob um total de 680.

> A regra a preservar, escrita: **contratado projeta, realizado fatura.**

### R$ 50,00 · no-show

**Nasce** em 1 `booking` com `status: "no_show"`, sem `payment` nem `commission`.

Fica fora de receita, fluxo e comissão — correto em todas. **Mas permanece na
"Previsão do dia" do Dashboard**, porque `previsaoHoje` soma os mesmos
`agendados` que a agenda usa, e `no_show` ocupa a cadeira (corretamente).

Resultado: depois de o dono marcar "não veio", o recebido cai para zero e a
previsão continua nos R$ 50 — a barra mostra 0% de um valor que já se sabe que
não virá.

### R$ 50,00 · cancelamento

Sai de tudo, inclusive da agenda do dia, porque `cancelled_by_client` libera o
horário. **Correto em todas as visões.**

### CMV, taxas e imposto

Aparecem **só no DRE**. Nenhuma outra visão os expõe, o que significa que uma
divergência neles é invisível fora dele — e é exatamente onde estão D3, D1 e D5.

### R$ 2.550,00 · despesas

| Visão | Valor | Classe |
|---|---|---|
| DRE | 2.350 fixas + 200 eventuais | ✅ |
| Projeção | 2.350 (só as recorrentes vigentes) | ✅ correto: eventual não se repete |
| Financeiro | **2.997,50** sob o rótulo "Despesas" | ⚠️ **nomenclatura** |
| Fluxo | **ausente** | ⚠️ **conceito** |

O KPI "Despesas" do Financeiro mostra `totalCost` — CMV, taxas, comissões e
imposto incluídos. O número está certo para o que ele é; o rótulo descreve outra
coisa. O dono pensa "aluguel e luz", que somam 2.550.

---

## 4. Achados novos desta rodada

Nenhum estava na auditoria nem no ledger.

| # | Achado | Classe | Onde |
|---|---|---|---|
| **D9** | O KPI "Despesas" do Financeiro mostra o **custo total** (2.997,50), não as despesas (2.550) | nomenclatura | `financeiro/page.tsx:64` |
| **D10** | A **previsão do dia não desconta a falta confirmada** — os R$ 50 do no-show continuam previstos depois de o dono marcar "não veio" | **erro** | `painel/page.tsx:86` |
| **D11** | O **Fluxo de Caixa não conhece saída** — é faturamento diário por meio, com nome de fluxo de caixa | conceito | `fluxo-caixa/page.tsx` |
| **D12** | A **venda de produto não aparece no Dashboard** — o dono não vê no caixa do dia o que vendeu no balcão | desenho | `painel/page.tsx:131` |

**D10 é o único erro de cálculo dos quatro**, e é barato: `previsaoHoje` deve
somar apenas o que ainda pode virar receita, excluindo `no_show`.

**D11 é a mesma família de D8** — o produto não tem, em lugar nenhum, um número
que responda *"quanto sobrou no caixa"*. A tela que leva esse nome responde
*"quanto entrou"*.

---

## 5. O que a matriz permite afirmar

✅ **Para cada real da massa, sabemos onde nasceu, onde foi parar e por que
aparece ou não em cada visão.** As 35 asserções cobrem os 10 fatos nas 6 visões.

✅ **As invariantes financeiras entre telas valem** (I1, I2, I3, I5, I6, I7).
A única que falha é **I4** — a árvore do DRE não soma o próprio cabeçalho.

✅ **Nenhuma divergência é inexplicada.** Das 12, cinco são erro (D2, D4, D6, D9
parcial, D10), quatro são modelagem (D3, D7, D8, D11), duas são precisão (D1,
D5) e uma é desenho (D12).

❌ **O que ainda não sabemos:** se uma pessoa consegue alimentar esse modelo sem
conhecer a arquitetura. É o Day in the Life, e é a próxima etapa.

---

## 6. Classificação consolidada

| Achado | Classe | Prioridade provisória |
|---|---|---|
| D3 · CMV = compras | modelo financeiro | 🔴 decisão de release |
| D8 · resultado × caixa | modelo financeiro | 🔴 decisão de release |
| D11 · Fluxo sem saída | modelo financeiro | 🔴 mesma família de D8 |
| D4 · meio de pagamento na venda | modelo | 🟠 P1 |
| D7 · taxa sobre produto | modelo | 🟠 P1 |
| D2 · ticket de serviço | semântica | 🟠 P1 · uma linha |
| D6 · mensalista na árvore do DRE | erro | 🟠 P1 · uma linha |
| D10 · previsão não desconta falta | erro | 🟠 P1 · uma linha |
| D9 · "Despesas" = custo total | nomenclatura | 🟡 P2 · um rótulo |
| D12 · produto fora do Dashboard | desenho | 🟡 P2 · decisão de produto |
| D1 / D5 · arredondamento | precisão | 🟡 P2 |

---

*Executado em 17/08/2026 sobre `caca7ae`, sem alteração do motor financeiro.*
