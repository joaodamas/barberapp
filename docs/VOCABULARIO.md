# Vocabulário do painel — auditoria transversal

> **Subordinado a `docs/UI-UX-GUIDELINES.md`.** §8 (*nome de menu é nome de
> negócio, não de sistema*; *uma informação mora em um lugar*), §9 (microcopy e
> concordância) e §7 (os três estados) são o contrato; este documento é o
> resultado de aplicá-lo rota a rota.

Equipe **UX-05** · Rodada 3.2 · 18/08/2026. Nenhuma rota mudou de lugar,
nenhum cálculo foi tocado, nenhum componente ganhou ou perdeu estrutura.
**Só linguagem.**

---

## Por que esta passagem existiu

Em 17/08 a verificação em tela achou três defeitos de linguagem e cada um foi
corrigido **no ponto onde apareceu** (`9c1fc33`):

1. o menu dizia "Quanto sobrou" e a tela dizia "DRE Gerencial";
2. "1 dias com movimento";
3. o estado vazio do Fluxo prometia menos do que o produto faz.

Os três são o mesmo defeito em três disfarces: **a cadeia que leva o dono de um
nome até uma tela não estava sendo verificada em lugar nenhum.** Corrigir onde
apareceu conserta a tela; não impede que exista nas outras vinte.

Esta auditoria percorreu, para cada rota do painel, a cadeia completa:

```
nav-items → h1 da tela → sobretítulo → rótulo de KPI → texto de botão
          → estado vazio → estado de erro → tela bloqueada por plano
```

Achou **cinco quebras de nome**, **nove `(s)`**, **oito contagens sem
concordância**, **quatro ocorrências de "DRE" em tela**, e **duas portas que não
abrem** — texto mandando o dono a uma tela que não faz o que o texto promete.

---

## 1 · A cadeia, rota a rota

`✓` = já estava coerente e foi verificado. `→` = corrigido nesta passagem.

| rota | menu (UX-01) | tela bloqueada | `h1` | resultado |
|---|---|---|---|---|
| `/painel` | Hoje | — | *(a data)*, sobretítulo "Hoje" | ✓ |
| `/painel/financeiro` | Financeiro · Resumo | — | Financeiro | ✓ |
| `/painel/financeiro/dre` | Quanto sobrou | Quanto sobrou | Quanto sobrou | ✓ (fechado em `9c1fc33`) |
| `/painel/financeiro/fluxo-caixa` | Fluxo de caixa | Fluxo de caixa | ~~Fluxo de **C**aixa~~ | → **Fluxo de caixa** |
| `/painel/financeiro/projecao` | Projeção de caixa | Projeção de caixa | ~~Projeção de **C**aixa~~ | → **Projeção de caixa** |
| `/painel/financeiro/despesas` | Despesas | ~~Controle de despesas~~ | Despesas | → bloqueio vira **Despesas** |
| `/painel/clientes` | Clientes | — | Clientes | ✓ |
| `/painel/loja` | Loja | Loja | Loja | ✓ |
| `/painel/mensal` | Mensalistas | Mensalistas | ~~**Mensal**~~ | → **Mensalistas** |
| `/painel/numeros` | Números | — | Números | ✓ |
| `/painel/configuracoes` | Ajustes · Taxas e regras | — | ~~**Configurações**~~ | → **Ajustes** |
| `/painel/servicos` | Serviços | — | Serviços | ✓ |
| `/painel/equipe` | Equipe | — | Equipe | ✓ |

### As cinco quebras, e o que cada uma custava

**`Mensal` → `Mensalistas`.** A pior das cinco, e exatamente o defeito que
`9c1fc33` corrigiu no DRE. O menu diz "Mensalistas", o `RecursoBloqueado` diz
"Mensalistas", o componente se chama `GerirMensalistas`, a landing diz
"mensalistas" — e a tela dizia "Mensal". UX-01 já tinha registrado o porquê da
renomeação do menu (*"adjetivo sem substantivo — mensal o quê"*, colidindo com o
fechamento do mês do Financeiro); faltava a tela acompanhar.

O sobretítulo e o título também estavam **invertidos** em relação a todas as
outras telas: o pequeno trazia o nome ("Mensalistas") e o grande trazia o
adjetivo. Passou a ser "Receita que se repete" em cima e "Mensalistas" no
título — o padrão do resto do painel, onde o pequeno é contexto e o grande é
nome.

**`Configurações` → `Ajustes`.** O menu tem **dois** nomes para esta rota — o
pai "Ajustes" e o filho "Taxas e regras" — e a tela não usava nenhum dos dois.
Três nomes para um lugar só. Agora o título é "Ajustes" (o pai) e o
sobretítulo é "Taxas e regras" (o filho), cada um no seu papel. O botão deixou
de dizer "Salvar configurações" e diz "Salvar alterações", que é o que ele faz
sem disputar o nome da tela.

**`Fluxo de Caixa` → `Fluxo de caixa`** e **`Projeção de Caixa` → `Projeção de
caixa`.** Só a caixa alta, e é tentador chamar de detalhe. Não é: em cada uma
delas **três pontos** escreviam de um jeito (menu, bloqueio de plano, atalho do
Resumo) e a tela de destino do outro. É a assinatura de um nome que ninguém
verificou, e é como "DRE Gerencial" começou.

**`Controle de despesas` → `Despesas`** no `BloqueioPlano`. Quem tem o plano via
"Despesas"; quem não tem via "Controle de despesas" — e é justamente quem não
tem que está tentando descobrir o que é a tela.

### O que deliberadamente **não** foi renomeado

| | por quê |
|---|---|
| **Fluxo de caixa** | Vocabulário real de dono de pequeno negócio, e `lib/fluxo-de-caixa.ts` é escrito com esse nome. Justificativa completa em `ARQUITETURA-DE-NAVEGACAO.md`. Só a caixa alta mudou. |
| **Números** | *"Vamos ver os números do mês"* é fala de dono. Nenhum candidato sobreviveu ao teste — ver UX-01. |
| **Resumo** = `h1` "Financeiro" | O filho aponta para a rota do pai; UX-01 decidiu que são a mesma tela vista de dois lugares, e por isso o "Mais" do celular não repete o filho. Um `h1` "Resumo" criaria a segunda tela que a decisão nega. |
| **Sangria**, **competência**, **ponto de equilíbrio** | Termos técnicos que o produto **explica onde usa** (`livro-caixa.tsx` traz `EXPLICACAO_DO_TIPO`). Explicar é a alternativa certa a traduzir quando o termo é o correto. |
| **Pix · Débito · Crédito · Dinheiro** | Nomes dos instrumentos. Não há sinônimo de dono. |

---

## 2 · Palavras de sistema que estavam em tela

### `DRE` — quatro ocorrências, todas fora da tela que tem o nome

O menu e a tela do DRE já dizem "Quanto sobrou" desde `9c1fc33`. A palavra
continuava viva em **quatro outras telas**, ensinando ao dono o termo do
contador dele justamente onde ele não pediu por ele:

| onde | era | virou |
|---|---|---|
| `financeiro/page.tsx` — estado vazio | "o DRE e o ponto de equilíbrio se montam sozinhos" | "o **resultado do mês** e o ponto de equilíbrio…" |
| `financeiro/despesas/page.tsx` — caixa "Recorrente" | "entra como custo fixo no DRE" | "…no **resultado do mês**" |
| `equipe/page.tsx` — ajuda do salário | "custo de folha no DRE" | "custo de folha no **resultado do mês**" |
| `configuracoes/page.tsx` — alarme de taxa | "o DRE mostra o lucro sem descontar" | "o **resultado do mês** mostra…" |

O estado vazio do Financeiro é o caso mais grave dos quatro: é a **primeira**
tela que um dono novo vê no financeiro, e era ali que ele aprendia a sigla.

"Resultado do mês" foi escolhido em vez de "Quanto sobrou" porque nos quatro
casos a palavra aparece **dentro de uma frase**, não como nome de destino — e
"Quanto sobrou" só funciona como nome próprio. É também o rótulo do KPI que já
está na tela do Resumo ("Resultado") e o subtítulo que a própria tela do DRE
usa.

### `MRR` → "Mensalidade de quem está ativo"

`mensal/page.tsx`. `navegacao.test.ts` já proíbe "MRR" em rótulo de menu, pela
mesma razão que "DRE" saiu: é vocabulário de quem **vende** SaaS, não de quem
tem barbearia. O número é a soma da mensalidade dos ativos, e é isso que o
rótulo passou a dizer. A barra ao lado continua comparando com o contratado.

### `no-show` → "falta"

`numeros/page.tsx`. O KPI dizia "Taxa de no-show" e o cartão logo abaixo
chamava a mesma coisa de "faltas" — **dois nomes para o mesmo fato, na mesma
tela.** O produto inteiro já diz falta: o botão da agenda ("Não veio"), o
diálogo ("Marcar falta?"), o motor do Action Center ("Marcar falta").

### `Insights automáticos` → "O que os números dizem"

Mesma tela. Era o rótulo mais de sistema do painel: descrevia **como** o texto
foi produzido em vez de dizer **o que ele responde**.

### `Status` → "Situação"

`mensal/page.tsx`. As outras duas tabelas do painel — a agenda de Hoje e as
mensalidades na mesma tela — já diziam "Situação". Esta era a única em inglês.

### `Reserva confirmada` → "Atendimento marcado"

`marcar-no-balcao.tsx`. O botão que abre o fluxo diz "Marcar atendimento" e a
agenda ao lado fala em horário e atendimento; só a confirmação usava "reserva",
que é a palavra do app do **cliente**.

### `Assinantes` → "Mensalistas"

`mensal/page.tsx`. Segunda palavra para a mesma pessoa, na tela que agora se
chama Mensalistas do menu ao título.

### `pra` → "para"

`numeros/page.tsx`, legenda do mapa de calor. §9 pede português correto.

---

## 3 · A regra de pluralização

`web/src/lib/plural.ts` · teste em `web/src/lib/__tests__/plural.test.ts`
(13 casos).

```
n === 1            →  singular
qualquer outro n   →  plural   (inclusive 0 e negativos)
```

Três funções, e **nenhuma deduz o plural**:

| função | devolve | para quê |
|---|---|---|
| `plural(n, sing, plur)` | só a palavra | o número já está na frase — ao lado de `un.`, `min`, `%` |
| `contar(n, sing, plur)` | `"3 dias"` | a esmagadora maioria dos casos |
| `contarDeTotal(p, t, sing, plur)` | `"1 de 3 serviços"` | X de Y — concorda com **Y** |

### As três decisões que o teste registra

**Zero é plural.** "0 dias", nunca "0 dia". Quem escreve `n < 2` acerta o zero
por acidente e erra o negativo; o teste existe para que a regra seja decisão e
não coincidência de operador.

**Negativo concorda pela grandeza**, não pelo sinal: `Math.abs(n) === 1`.
"−1 dia", "−2 dias". Aparece em saldo e em variação, que chegam com sinal.

**As duas formas são sempre explícitas.** Português não permite deduzir:
mês → meses, visível → visíveis, un. → un. Um deduplicador que acerta 80%
produz "mêss" e "visívels" no resto, e esse defeito é pior que o que resolve
porque *parece* automatizado e passa na revisão.

**Abreviação de unidade é invariável** — `un.`, `min`, `h`, `%`, `R$`. O que
concorda é o verbo ao lado: `1 un. voltou` / `2 un. voltaram` (§9 das
guidelines, literalmente).

### Os nove `(s)` — a desistência de concordar

Nenhum foi economia de esforço: cada um devolve a conta para quem lê.

| arquivo | era |
|---|---|
| `clientes/page.tsx` | `{n} cadastrado(s)` |
| `financeiro/page.tsx` | `{n} cancelamento(s)` · `{n} mensalista(s) ativo(s)` |
| `financeiro/despesas/page.tsx` | `{n} lançamento(s) em agosto` |
| `loja/page.tsx` | `{n} produto(s) abaixo do estoque mínimo` |
| `servicos/page.tsx` | `{n} serviço(s) **visível(is)**` · `dos {n} serviço(s) visíveis` · `{n} linha(s) sem nome não são salvas` |
| `page.tsx` (Hoje) | `E mais {n} pendência(s)` |
| `gerir-mensalistas.tsx` | `{n} mensalidade(s)` · `{n} confirmada(s)` |
| `comecar/passo-servicos.tsx` | `Continuar com {n} serviço(s)` |

Dois merecem nota. **`visível(is)`** é o pior da lista — ninguém lê isso e
entende. E o do **onboarding** é o mais caro: é o primeiro texto que um dono
novo lê no produto, e "um serviço só" é o estado mais provável naquele momento.

### As oito contagens que nem `(s)` tinham

| arquivo | era | com 1 dava |
|---|---|---|
| `numeros/page.tsx` | `{s.count} atendimentos` | "1 atendimentos" |
| `numeros/page.tsx` | `{c.visits} visitas` | "1 visitas" |
| `numeros/page.tsx` | `{n} faltas e {n} cancelamentos tardios em {n} agendamentos` | três de uma vez |
| `financeiro/page.tsx` | `{n} lançamentos` | "1 lançamentos" |
| `projecao/page.tsx` | `próximos {n} dias` (rótulo do gráfico) | "1 dias" |
| `equipe/page.tsx` | `Atende {n} de {n} serviços` | "1 de 1 serviços" |
| `servicos/page.tsx` | `{nomes} dura mais que o expediente` | com dois nomes, "A, B dura" |
| `servicos/page.tsx` | `…nenhum horário para esse serviço` | com dois, "esses serviços" |

O caso da Equipe é o que melhor mostra por que a regra precisava de teste: a
barbearia com **um serviço só** não é hipótese de laboratório — é o estado
inicial de toda barbearia que acaba de entrar, e "Atende 1 de 1 serviços" é o
que ela lia no primeiro dia.

### As quatro correções que já estavam certas — e por que viraram helper

`clientes/page.tsx` (duas vezes), `vender-produto.tsx`, `desfazer-venda.tsx` e
o `9c1fc33` no Fluxo já tinham o ternário certo, escrito à mão, cada um do seu
jeito. Não estavam errados; estavam **soltos**. Uma regra que mora em cinco
cópias é uma regra que a sexta tela não vai seguir — e as oito da tabela acima
são a prova de que a sexta tela já tinha acontecido oito vezes.

---

## 4 · Estados vazios — as treze telas

A régua de `UI-UX-GUIDELINES.md` §7: o vazio diz **o que é aquilo** e **o que
fazer para sair dele**. E não pode prometer nem mais nem menos do que o sistema
entrega.

| tela | diz o que é | diz o que fazer | veredito |
|---|---|---|---|
| Hoje · agenda | ✓ | ✓ "Marcar atendimento" | ✓ |
| Financeiro · resumo | ✓ | ✓ "Lançar despesas" | → tirado o "DRE" |
| Quanto sobrou | ✓ | ✓ | ⚠ **contém "DRE"** — arquivo de FIN-02, ver §6 |
| Fluxo de caixa | ✓ | ✓ | ✓ (reescrito em `9c1fc33`) |
| Projeção de caixa | ✓ | ✓ "Lançar despesas" | ✓ |
| Despesas · tabela | ✓ (com o mês) | ✗ **faltava** | → aponta o botão "Nova despesa" |
| Clientes | ✓ | ✓ | ✓ |
| Loja · produtos | ✓ | ✓ | ✓ |
| Loja · vender | ✓ (dois casos distintos) | ✓ | ✓ |
| Mensalistas · lista | ✓ | ✗ **porta falsa** | → ver STOP 1 |
| Mensalistas · faturas | ✓ (com o mês) | ✗ faltava | → aponta "Emitir mensalidades" |
| Mensalistas · filtro | ✓ | ✗ faltava | → 'Toque em "Todos"' |
| Números | ✓ (com o mês) | ✓ "Ir para Hoje" | ✓ |
| Equipe | ✓ | ✓ "Adicionar barbeiro" | ✓ |
| Serviços | usa `Aviso`, não vazio | — | ✓ por desenho: é alarme, não ausência |
| Livro caixa | — | — | ⚠ **não tem vazio** — ver §6 |

### O que mudou, e por quê

**Despesas.** "Nenhuma despesa lançada em agosto." dizia metade do contrato. O
botão que resolve está no topo da mesma tela e o vazio não o mencionava — e a
consequência de não lançar é o resultado do mês sair errado, que é o que a
frase agora diz.

**Mensalistas · faturas** e **Mensalistas · filtro.** Mesma metade faltando. No
filtro há um agravante: é vazio de *recorte*, não de dado — existe mensalista,
só não naquele status — e sem dizer a saída o dono lê como se a lista tivesse
sumido.

### O estado de erro de Despesas

Era a única das treze telas com `status` que escrevia o erro à mão em vez de
usar `ErroAoCarregar`, e dizia só o **fato**: "Não foi possível carregar os
lançamentos." Faltavam as outras duas partes que o Design System §3 exige — a
consequência (*"nada foi perdido"*) e a saída. Sem a segunda, o dono que abre o
mês e vê a tabela em branco não sabe se perdeu lançamento. O texto agora diz as
três; **a troca pelo componente não foi feita** porque é estrutura, e está
registrada em §6.

### `oQue` nos esqueletos — catorze chamadas, zero preenchidas

O Design System §3 é explícito: *"Todos aceitam `oQue`, e **passe sempre**:
quem enxerga sabe pela posição do bloco o que está chegando; quem ouve recebia
só 'carregando'."* Nenhuma das catorze chamadas de `LoadingRows` no produto
passava. As **oito do painel** passaram a passar — "sua agenda", "seus
clientes", "os mensalistas", "seus produtos", "seus números", "sua equipe", "o
resumo financeiro", "a projeção", "o caixa do mês". As do app do cliente estão
fora do meu ownership (§6).

`ErroAoCarregar oQue="o caixa do período"` virou `"o caixa do mês"`: a tela
inteira fala em mês — o cabeçalho diz "Histórico diário · agosto" e o vazio diz
"neste mês".

---

## 5 · Um número, dois nomes

**"previsto hoje" × "Previsão do dia (agenda confirmada)"** — `page.tsx`, tela
Hoje. É o exemplo que **§13 das guidelines lista como proibido**, e é a mesma
variável `previsaoHoje` nos dois lugares: um KPI no topo e uma linha no bloco
"Previsão × recebido", a menos de uma tela de distância um do outro. O dono que
comparasse os dois valores concluiria que um deles está errado.

UX-01 declarou o `STOP` e apontou para UX-03; a tela é `page.tsx` sob
`painel/**`, e é texto. **Fechado aqui.** Os dois passaram a dizer "previsão do
dia". O qualificador "(agenda confirmada)" saiu porque o parágrafo logo abaixo
já explica melhor do que ele: *"A previsão desconta faltas e cancelamentos."*

**"Fechamento do mês" × "Quanto sobrou"** — `financeiro/page.tsx`. Dois botões
(desktop e celular) diziam "Fechamento do mês" e "Ver fechamento do mês", e
levavam à mesma tela que o cartão logo abaixo já chamava de "Quanto sobrou".
Terceiro nome para o mesmo destino, e o mais confuso dos três porque
"Fechamento de agosto" é o **sobretítulo desta própria tela**. Os dois botões
passaram a dizer "Ver quanto sobrou". Era o item pendente da tabela de handoff
de `ARQUITETURA-DE-NAVEGACAO.md`.

**"Adicionar produto" × "Novo Produto" × "Cadastrar produto"** — `loja/page.tsx`.
Três nomes para um gesto só: o botão da tela, o título do diálogo e o botão de
confirmar dentro dele. Os três dizem "Adicionar produto".

**"Nova Despesa" × "Editar Despesa"** — caixa alta no meio da frase é convenção
de inglês. O resto do painel escreve "Marcar atendimento", "Lançar despesas",
"Adicionar barbeiro". Viraram "Nova despesa" e "Editar despesa" — os únicos dois
`title` em Title Case que restavam no produto.

---

## 6 · `STOP` — o que esta equipe não pôde ou não deve resolver

### STOP 1 · Não existe tela que crie plano de mensalista

**A mais séria das duas portas falsas, e a única que o produto promete duas
vezes.**

```
mensal/page.tsx        EmptyState actionLabel="Criar plano"
                                  actionHref="/painel/loja"     ← Loja cadastra PRODUTO
gerir-mensalistas.tsx  "Cadastre um em Serviços antes de contratar"
                                                                ← Serviços edita o CARDÁPIO
```

Verificado: `plans` é lida por `usePlans` em dois lugares e **escrita por
nenhuma tela** — só por `scripts/semear-day-in-the-life.mjs` e lida por
`functions/src/mensalistas.ts`. Não há editor de plano em `servicos/page.tsx`,
`configuracoes/page.tsx`, `equipe/page.tsx` nem `loja/page.tsx`.

O dono sem plano cadastrado clica em "Criar plano", chega na Loja, não acha, e
conclui que não entendeu o produto. Uma porta que não abre é pior que porta
nenhuma.

**O que fiz:** tirei as duas afirmações falsas. O vazio de Mensalistas explica o
que é um mensalista e diz que os planos precisam existir antes, **sem botão** —
`EmptyState` sem `actionLabel` não renderiza ação, que é o correto quando não há
o que fazer. `GerirMensalistas` deixou de mandar a lugar nenhum.

**O que NÃO fiz, e é decisão do orquestrador:** o produto vende mensalista como
recurso de plano (`RecursoBloqueado` de `/painel/mensal` diz *"Cadastra planos
de assinatura"* — outra promessa que nenhuma tela cumpre) e não tem onde
cadastrá-lo. **Falta uma tela, não falta um texto.** Enquanto ela não existir,
qualquer texto que aponte um caminho será falso.

### STOP 2 · "Crescimento líquido de mensalistas" mede outra coisa

`financeiro/page.tsx`:

```ts
newSubscribers: ativos.length,                       // TODOS os ativos
cancellations:  subscribers.filter(cancelado).length
netGrowth = newSubscribers - cancellations
caption   = `+${newSubscribers} novos · −${cancellations} cancelamento(s)`
```

`newSubscribers` recebe a contagem de **todos os mensalistas ativos**, não os
que entraram no mês — e a legenda os chama de "novos". Numa barbearia com 40
mensalistas antigos e nenhuma entrada, o cartão anuncia "+40 novos" e um
"crescimento líquido" que não é crescimento de nada.

**Corrigi só o `(s)` de "cancelamento(s)". A palavra "novos" ficou de
propósito.** Escrever ali um rótulo verdadeiro deixaria a legenda honesta
embaixo de um KPI que continua chamando `ativos − cancelados` de "crescimento
líquido" — esconderia o defeito em vez de resolvê-lo. **É dado, não linguagem.**
`analytics.ts` e o cálculo são de FIN; a decisão é do orquestrador.

### STOP 3 · "DRE" no estado vazio da tela que já não se chama DRE

```
CONFLITO DE OWNERSHIP

Arquivo:     web/src/app/painel/(dashboard)/financeiro/dre/page.tsx  (linha 292)
Equipe A:    UX-05 — auditoria transversal de vocabulário
Equipe B:    FIN-02 — está neste arquivo agora (detalhamento do CMV)
Mudança:     EmptyState description
             "O DRE se monta a partir dos atendimentos concluídos e das
              despesas lançadas."
          →  "O resultado do mês se monta a partir dos atendimentos
              concluídos e das despesas lançadas."
Contrato em disputa:  o nome da tela no seu próprio estado vazio
Decisão necessária:   FIN-02 aplica no arquivo que já tem aberto, ou UX-05
                      entra depois que ela sair
```

O `h1`, o `RecursoBloqueado` e o `BloqueioPlano` desta tela já dizem "Quanto
sobrou"; o estado vazio é o único ponto que sobrou dizendo "DRE" — e é o que o
dono novo lê primeiro. O subtítulo "Demonstração de resultado" **deve ficar**:
é decisão registrada em `9c1fc33`, e é onde quem conhece o termo o reconhece.

### STOP 4 · "DRE" no motor do Action Center

```
CONFLITO DE OWNERSHIP

Arquivo:     web/src/lib/action-center.ts  (linha 298)
Equipe A:    UX-05 — vocabulário
Equipe B:    UX-03 / dono do motor de operação
Mudança:     reason de `taxasNaoConfiguradas`
             "…e o DRE está descontando 0% de taxa"
          →  "…e o resultado do mês está descontando 0% de taxa"
Contrato em disputa:  nenhum — é microcopy dentro de um módulo de lógica
Decisão necessária:   quem edita `lib/action-center.ts`
```

O texto aparece na seção "Precisa de você" da tela Hoje, que é a mais lida do
painel. É a quinta ocorrência de "DRE" e a única que não pude alcançar — as
outras quatro estão corrigidas.

### STOP 5 · "DRE" na landing, vendendo o plano Gestão

`web/src/app/landing/page.tsx:397` — *"Tudo, mais DRE, projeção e fechamento
mensal."* Fora de `painel/**`, fora do meu ownership. Diferente dos outros
casos, aqui **pode haver razão para manter**: quem compara planos talvez
reconheça a sigla. Mas a decisão precisa ser tomada, não herdada — hoje ela é
só o resíduo do nome antigo. **Decisão de produto.**

### STOP 6 · `bookingStatusMeta.no_show` = "Não compareceu"

`web/src/lib/booking-status.ts` — fora do meu ownership. O produto tem hoje
**três** formas para o mesmo desfecho: "Não veio" (botão da agenda), "Marcar
falta" (diálogo e Action Center) e "Não compareceu" (a etiqueta na coluna
Situação). As duas primeiras são coerentes — verbo para a ação, substantivo
para a métrica. A terceira é uma variante formal sem função. **Sugiro "Não
veio"**, para casar com o botão que produz esse estado.

### STOP 7 · Telas sem os três estados

Não são texto — são estrutura, e por isso não toquei:

| onde | falta |
|---|---|
| `livro-caixa.tsx` | **nenhum estado vazio**: com zero lançamentos a lista simplesmente não renderiza, e os três KPIs mostram R$ 0,00. Pior: eles renderizam **também no erro**, ao lado do `ErroAoCarregar` — zeros que parecem dado ao lado de um aviso de que não houve leitura. É o D27 com outra roupa. |
| `livro-caixa.tsx` | sem esqueleto de carregamento |
| `gerir-mensalistas.tsx` | sem esqueleto: a tabela de faturas só distingue `pronto` de vazio |
| `financeiro/despesas/page.tsx` | erro e carregamento escritos à mão em `<td>` em vez de `ErroAoCarregar` / `LoadingRows`; o esqueleto é uma barra única que não tem a forma da tabela |
| `financeiro/fluxo-caixa/page.tsx` | os KPIs "Entrou/Saiu/Sobrou" renderizam antes da guarda de `status`, então mostram R$ 0,00 durante carregamento e erro |

O último e o do livro caixa são a mesma classe de defeito e a mais séria delas:
**número zerado exibido enquanto a leitura não voltou lê como "não houve
movimento"** — exatamente o que o D27 custou.

### STOP 8 · `(s)` e `oQue` no app do cliente

Fora de `painel/**`:

- `app/(cliente)/agendar/page.tsx:568` — `${n} serviço(s) · ${min} min`
- seis chamadas de `LoadingRows` sem `oQue` em `(cliente)/**`

O helper `lib/plural.ts` já está disponível para quem for.

---

## 7 · O que precisa ser olhado em tela

**Regra 19: nada aqui está VERIFICADO.** Não tenho navegador. `tsc`, `eslint`,
`vitest` e `build` passam, e isso prova que o código compila e que a regra de
concordância faz o que o teste diz — **não** que a tela está certa.

Por rota, o que precisa de olho humano:

| rota | o que conferir |
|---|---|
| **`/painel`** | o KPI do topo e a linha do bloco "Previsão × recebido" dizem **o mesmo nome** e **o mesmo valor**; com 1 pendência oculta, a frase diz "E mais 1 pendência na fila" |
| **`/painel/financeiro`** | os quatro atalhos batem palavra por palavra com o submenu; os dois botões (desktop e celular) dizem "Ver quanto sobrou"; com 1 despesa o atalho diz "1 lançamento"; **o estado vazio não menciona DRE** |
| **`/painel/financeiro/fluxo-caixa`** | `h1` "Fluxo de caixa" com **c minúsculo**; com um único dia de movimento, "1 dia com movimento" |
| **`/painel/financeiro/projecao`** | `h1` "Projeção de caixa" com **c minúsculo** |
| **`/painel/financeiro/despesas`** | cabeçalho "1 lançamento em agosto" com um só; mês vazio menciona o botão "Nova despesa"; o botão e o diálogo dizem "Nova despesa"; **sem plano**, o bloqueio diz "Despesas" |
| **`/painel/mensal`** | `h1` **"Mensalistas"**, sobretítulo "Receita que se repete"; o cartão da esquerda **não** diz MRR; coluna "Situação"; a lista se chama "Mensalistas"; **sem mensalista, o vazio não oferece botão** — confirmar que isso não parece defeito |
| **`/painel/numeros`** | KPI "Taxa de falta"; seção "O que os números dizem"; com 1 visita, "1 visita"; com 1 atendimento no top de serviços, "1 atendimento" |
| **`/painel/clientes`** | com 1 cliente, "1 cadastrado"; ficha com 1 visita diz "1 visita"; "há 1 dia" |
| **`/painel/servicos`** | com 1 serviço sem preço: "1 serviço visível com preço zerado"; com 2: "2 serviços visíveis"; com 2 serviços longos: "duram", "esses serviços" |
| **`/painel/equipe`** | barbearia com **um serviço só**: "Atende 1 de 1 serviço" |
| **`/painel/configuracoes`** | `h1` **"Ajustes"**, sobretítulo "Taxas e regras"; botão "Salvar alterações"; alarme de taxa **sem "DRE"** |
| **`/painel/loja`** | com 1 produto em falta: "1 produto abaixo do estoque mínimo"; diálogo de cadastro titulado "Adicionar produto" |
| **`/comecar`** (passo 3) | com 1 serviço válido: "Continuar com 1 serviço" |
| **balcão** | ao marcar, a confirmação diz "Atendimento marcado" |
| **trial no penúltimo dia** | a faixa diz que você **continua vendo tudo sem poder alterar** — não que "o painel fecha" |
| **leitor de tela** | com a rede lenta, cada esqueleto anuncia *"Carregando sua agenda"*, *"Carregando seus clientes"* etc., e não só "Carregando" |

### O que já se sabe que não dá para verificar aqui

`9c1fc33` registrou que **mobile** (`resize_window` não altera o viewport) e o
**estado de erro D27** (derrubar o Firestore expulsa o dono para a landing antes
de a tela existir) continuam não exercidos. Nada nesta passagem muda isso — e
duas linhas da tabela acima (a faixa de trial e os textos de erro de Despesas)
caem justamente aí.

---

## Verificação

| comando | antes | depois |
|---|---|---|
| `npx tsc --noEmit` | limpo | ✅ limpo |
| `npx eslint src --max-warnings=0` | limpo | ✅ limpo |
| `npx vitest run` | 563 em 27 arquivos | ✅ **576 em 28** · +13, nenhum caiu |
| `npm run build` | compila | ✅ compila |

Arquivos novos: `web/src/lib/plural.ts`, `web/src/lib/__tests__/plural.test.ts`,
este documento.

*UX-05 · 18/08/2026.*
