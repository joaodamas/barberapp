# Mapa de maturidade UI/UX — consolidação das quatro equipes

> Entregáveis **A, B, C e D** definidos pelo dono do produto em 18/08/2026.
> Construído sobre a evidência de `UX-BASELINE-1.0.md`. **Nada foi implementado.**

---

## 0 · Estado real das quatro equipes

A instrução pedia para não abrir frente nova "enquanto FIN-02, UX-05, INFRA-01 e
DENSITY-01 não terminarem". **Os quatro terminaram.** Verificado, não lembrado:

```
git worktree list        →  apenas a árvore principal
611017c  INTEGRADO  fix(tenant): "não consegui carregar" deixa de virar
                    "você não pertence aqui" (D30)              ← INFRA-01
fb44f1c  INTEGRADO  feat(uiux): o nome que o dono clica é o nome
                    que ele encontra                            ← UX-05
123c0f8  INTEGRADO  feat(densidade): auditoria antes do corte —
                    só a duplicação literal sai                 ← DENSITY-01
5fdce79  INTEGRADO  fix(fin-02): o detalhamento do CMV explica a
                    conta, e fecha com o cabeçalho              ← FIN-02
```

A validação transversal também já rodou: é a `UX-BASELINE-1.0.md`, com 15 itens
verificados na tela, 23 defeitos objetivos e 10 lacunas de evidência.

Este documento é a consolidação no formato que você pediu — e **a decisão de
disparar o QA-02 continua sua**. Não disparei.

---

# A · MAPA FINAL DE MATURIDADE UI/UX

## A.1 · O que está consolidado

O que sobreviveu à inspeção de tela e não precisa ser revisitado.

| Área | Estado |
|---|---|
| **Detalhamento financeiro** | Consolidado. As árvores do CMV e da receita fecham com o cabeçalho, com dedução assinada e unidade declarada |
| **Composição da receita** | Consolidada. 27% + 73% = 100%, devolução −24% fora do denominador |
| **Vocabulário de menu e título** | Consolidado no eixo Financeiro. "Quanto sobrou" no menu, no h1 e no atalho |
| **Declaração de incerteza** | Consolidada e é a coisa mais madura do produto. Projeção, Livro caixa, Serviços e o modal de devolução declaram o que **não** estão afirmando |
| **Proteção do passado** | Consolidada. Ajustes explica que mudar a taxa não reescreve histórico |
| **Simulador da Loja** | Consolidado. O P1-7 está morto |

## A.2 · O que foi corrigido nesta leva

| Equipe | Entregou | Estado |
|---|---|---|
| **FIN-02** | Detalhamento do CMV que explica a conta e fecha com o cabeçalho | ✅ **VERIFICADO na tela** |
| **UX-05** | Vocabulário transversal; `plural.ts`; empty state de mensalistas sem porta falsa | ⚠️ **PARCIAL** — ver A11, A12 e A8 |
| **INFRA-01** | D30: falha de tenant deixa de expulsar o dono do painel | ⚠️ **PARCIAL** — corrigido no painel, **não** no login nem na área do cliente (A3) |
| **DENSITY-01** | Auditoria antes do corte; três duplicações literais removidas | ⚠️ **PARCIAL** — a correção do D31 ficou em `stash@{0}`, fora da branch (A22) |

**Três de quatro entregaram menos do que o relatado.** Não por má execução — em
dois casos a correção existe e não chegou onde precisava chegar. É o padrão que
o item B.1 ataca primeiro.

## A.3 · O que ainda está inconsistente

| Eixo | Inconsistência |
|---|---|
| **Semântica de dinheiro** | "Ticket médio", "receita" e "caixa" têm mais de uma definição, sem legenda que as separe. Não é bug em três telas: é uma definição não tomada |
| **Estado de erro** | Onde existe, foi acrescentado **ao lado** dos números, não **no lugar** deles. Um total cuja fonte falhou continua sendo exibido como se fosse fato |
| **Escrita** | `plural.ts` existe e três lugares não a usam. Percentual usa ponto, dinheiro usa vírgula |
| **Afirmação sem fato** | Números afirma padrão de retorno, queda de falta e causa de redução que o sistema não mediu |
| **Composição visual** | Sete telas abrem com a mesma grade de KPIs, independentemente da decisão em jogo |

## A.4 · O que não foi possível verificar

| # | O quê | Por quê |
|---|---|---|
| N1 | **Toda a experiência móvel** | Ambiente incapaz — medição na seção D.4 |
| N2 | Alvo de toque ≥ 44px | Depende de N1 |
| N3 | `prefers-reduced-motion`, foco visível, tabulação | Não exercitados |
| N4 | Contraste AA na tela renderizada | Só há teste de token |
| N5 | **Qualquer tela com volume real** | Tudo foi visto com "um de cada" |
| N6 | Agenda / Marcar atendimento | Não aberta |
| N7 | Área do cliente com sessão de cliente | Não aberta |
| N8 | Fluxos de escrita | Nenhuma escrita executada |
| N9 | D31 | A correção não está na branch |
| N10 | Estado de carregamento | Intervalo curto demais para observar |

---

# B · BACKLOG PRIORIZADO

Classificação conforme a sua regra:

- **ÓBVIO** — pode corrigir sem decisão de produto.
- **DE JULGAMENTO** — só propor.
- **NÃO VERIFICADO** — o ambiente não permitiu evidência.

Onde o **defeito** é óbvio mas o **remédio** exige decisão, está dito na última
coluna. Nesses casos eu proponho e não implemento.

## P0 — quebra de confiança / usabilidade

| # | Achado | Classe | Remédio |
|---|---|---|---|
| **A1** | DRE mostra lucro de R$ 30,39 onde há prejuízo de R$ 769,61 quando não lê despesas | **ÓBVIO** que está errado | ⚠️ **precisa de decisão**: suprimir o total, ou exibi-lo marcado como incompleto |
| **A2** | Despesas afirma "0 lançamentos" e R$ 0,00 em 4 KPIs sob falha de leitura | **ÓBVIO** | ⚠️ mesma decisão de A1 |
| **A3** | Login exibe "CorteHub" no lugar de "O Siqueira" quando o tenant não resolve — numa tela que pede senha | **ÓBVIO** | ✅ direto: estender `resolverTenant()` ao `(cliente)/layout.tsx` e ao login |
| **A22** | Correção do D31 vive em `stash@{0}`, tocando arquivo que era bloqueado | **ÓBVIO** (processo) | ⚠️ **precisa de decisão**: aplicar, descartar e refazer, ou deixar |
| **A8** | Mensalistas afirma que não há planos cadastrados; o modal ao lado oferece os dois e contrata | **ÓBVIO** | ✅ direto: a guarda correta já existe em `gerir-mensalistas.tsx:375` |
| **A9** | "Ponto de equilíbrio não atingido" + pílula "no vermelho" sobre barra **verde cheia** | **ÓBVIO** (viola §3 do contrato) | ✅ direto |
| **A19** | Atalho "histórico diário **completo** · R$ 180,29" leva a "SOBROU NO CAIXA −R$ 664,71" | **ÓBVIO** | ✅ direto: o atalho mostra o mesmo número do destino |
| **A13** | "1 visita · costuma voltar a cada 0d" + pílula "Em dia" — padrão inexistente | **ÓBVIO** | ✅ direto: sem 2 visitas não há cadência a afirmar |
| **A14** | "A taxa de falta caiu de 0% para 0%" | **ÓBVIO** | ✅ direto |
| **A15** | "A confirmação por WhatsApp continua sendo o maior fator de redução" — frase fixa sem fato | **ÓBVIO** | ✅ direto: remover ou condicionar a medição real |
| **A16** | "Seg às 09:00 é a maior brecha" escolhida por desempate entre 107 células em 0% | **ÓBVIO** | ✅ direto: não recomendar sob empate |
| **A20** | Financeiro mostra "Crédito à vista 3.15%"; a taxa aplicada é 3,49% | **ÓBVIO** que contradiz | ⚠️ **precisa de decisão**: remover a tabela da plataforma, ou exibir a taxa da barbearia |
| **A23** | Previsão do dia não desconta a falta já confirmada | **DE JULGAMENTO** | Proposta: `no_show` continua ocupando a cadeira e sai da previsão |

## P1 — inconsistência transversal

| # | Achado | Classe | Remédio |
|---|---|---|---|
| **A4** | "Ticket médio" com três definições: R$ 47,50 · R$ 50,00 · R$ 180,29 | **DE JULGAMENTO** | Só sua. É o item C.1 |
| **A5** | Projeção confirma bruto de serviço e estima líquido de todas as origens, na mesma coluna | **DE JULGAMENTO** | Decorre de C.1 |
| **A7** | "Caixa de hoje" mostra Cartão R$ 0,00 no dia em que entraram R$ 130,29 no cartão | **DE JULGAMENTO** | Decorre de C.1 |
| **A6** | Simulador diverge de si mesmo em +R$ 8,61 com variação 0% | **ÓBVIO** | ✅ direto: imposto no cenário, `centavos()` no lugar de `Math.round`, e `isZero` deixar de engolir R$ 0,21 |
| **A17** | Ocupação 0% no mês com 1 atendimento; Hoje mostra 3% | **ÓBVIO** | ✅ direto: casa decimal ou "<1%", nunca 0% com fato existente |
| **A10** | Separador decimal em ponto: `27.7%`, `0.99%`, `3.15%`, `8.5%` | **ÓBVIO** | ✅ direto: criar formatador de percentual em `format.ts` |
| **A11** | "1 un. já voltaram" — o exemplo literal do §9 do contrato | **ÓBVIO** | ✅ direto: usar `plural()` |
| **A12** | "1 de 3 devolvida" — pluraliza pela parte | **ÓBVIO** | ✅ direto: usar `contarDeTotal()` |
| **A21** | "+0 novos · −0 cancelamentos" | **ÓBVIO** | ✅ direto |
| **A18** | 404 preto, em inglês, sem marca e sem saída | **ÓBVIO** (viola light-only e português) | ✅ direto |

## P2 — refinamento

| # | Achado | Classe |
|---|---|---|
| **P11** | Carregamento é spinner; o contrato §7 pede esqueleto | **ÓBVIO** pelo contrato, mas é trabalho de componente e afeta toda entrada no produto |
| **P3–P8** | Mapa de calor 6×18 · régua de cobrança vazia · 4 KPIs zerados · produto listado duas vezes na Loja · `MARGEM −550%` no topo · projeção partindo de saldo zero | **DE JULGAMENTO** |
| **P9** | Login informa se o e-mail existe | **DE JULGAMENTO** |
| **P10** | Sessão perdida leva a login sem dizer que caiu | **DE JULGAMENTO** |
| **—** | Sete telas abrindo com a mesma grade de KPIs | **DE JULGAMENTO** — é o item C.4 |

## Contagem

```
P0   13 achados   (10 ÓBVIO com remédio direto ou quase,  1 DE JULGAMENTO)
P1   10 achados   ( 7 ÓBVIO,  3 DE JULGAMENTO — todos decorrentes de C.1)
P2    ~9 itens    ( 1 ÓBVIO,  o resto DE JULGAMENTO)
NÃO VERIFICADO   10 lacunas
```

**17 correções são ÓBVIAS e não dependem de nenhuma decisão sua.** Todas
contrariam contrato já escrito.

---

# C · DECISÕES QUE PRECISAM DO JOÃO

Não implementadas. Em ordem de bloqueio.

### C.1 · Qual é a definição de "ticket médio" — e, por trás dela, de "receita"?

É a decisão que destrava A4, A5 e A7 de uma vez. Hoje o mesmo nome aparece com
três valores porque duas grandezas diferentes — *receita de serviço* e *caixa
líquido de todas as origens* — nunca foram separadas por nome.

Três saídas possíveis: uma definição só (serviço ÷ atendimentos, o que Números
já faz); duas métricas com nomes distintos (o motor já tem
`avgTicketComProduto`); ou tudo dividido por atendimentos com o denominador
corrigido. **Corrigir tela por tela sem decidir isto recria o problema na
próxima tela.**

### C.2 · O que a tela deve fazer com um total cuja fonte falhou?

Suprimir o número, ou exibi-lo marcado como incompleto? Destrava A1 e A2 — os
dois defeitos mais graves do produto. Minha proposta é **suprimir**: um número
apagado faz o dono perguntar; um número errado faz o dono decidir.

### C.3 · O `stash@{0}` — aplicar, descartar e refazer, ou deixar?

Enquanto estiver lá, a branch não descreve o produto e o D31 segue aberto.

### C.4 · A grade de KPIs abre sete telas iguais. Isso fica?

Não é remoção de card: é decidir, por tela, qual é **a** pergunta. Hoje
(operação, em pé) e Quanto sobrou (análise, sentado) abrem idênticas. É o maior
item de identidade que sobrou, e é trabalho de UX POLISH, não desta fase.

### C.5 · A tabela de taxas Stone/InfinitePay no Financeiro fica?

Ela mostra 3.15% enquanto a barbearia paga 3,49%. Sai, ou passa a mostrar a taxa
da barbearia?

### C.6 · Não existe vitrine pública. É assim mesmo?

Todo o `(cliente)` está atrás do `AuthGuard`, inclusive `/agendar`. Um cliente
com o link da barbearia vê uma tela de login antes de ver preço ou horário.
Registro como decisão porque atravessa o produto e muda o que "vitrine"
significa nos próximos relatórios.

### C.7 · A falta confirmada sai da previsão do dia? (A23)

---

# D · PLANO DA ÚLTIMA PASSADA — QA-02

**Não disparado.** Depende da sua autorização e, na minha leitura, de C.1 e C.2
estarem decididas — senão o QA-02 vai registrar como achado o que já é decisão
pendente.

## D.1 · A pergunta única

> **"O produto inteiro parece ter sido desenhado e construído pela mesma equipe?"**

## D.2 · Ordem exata das rotas

Do que o dono usa mais para o que usa menos, e por último o que só é visto
quando algo dá errado.

```
 1  /painel                          Hoje — operação
 2  /painel/loja                     Loja — venda e estoque
 3  /painel/clientes                 Clientes
 4  [modal] Marcar atendimento       o fluxo de escrita mais usado
 5  /painel/financeiro               Resumo
 6  /painel/financeiro/dre           Quanto sobrou
 7  /painel/financeiro/fluxo-caixa   Fluxo de caixa
 8  /painel/financeiro/despesas      Despesas
 9  /painel/financeiro/projecao      Projeção
10  /painel/numeros                  Números
11  /painel/mensal                   Mensalistas
12  /painel/configuracoes            Ajustes · Serviços · Equipe
13  /login  ·  /comecar              entrada e onboarding
14  (cliente) /agendar /reservas     área do cliente, com sessão de cliente
15  404  ·  /offline                 as telas que ninguém desenhou
```

**Cada rota em dois cenários:** com dado real e com a coleção principal
ilegível. O segundo cenário é onde estão A1 e A2, e é o que nenhuma passada
anterior exercitou de forma sistemática.

## D.3 · Formato de registro — obrigatório por achado

```
rota:               /painel/financeiro/dre
evidência:          RESULTADO DO MÊS R$ 30,39 com expenses ilegível
regra violada:      "não pode afirmar que algo aconteceu quando não aconteceu"
impacto:            o dono decide com resultado invertido em R$ 800,00
classificação:      ÓBVIO | DE JULGAMENTO | NÃO VERIFICADO
correção proposta:  suprimir o total quando a fonte falhou
```

## D.4 · Escopo de mobile — e por que ele sai

Você manteve mobile como NÃO VERIFICADO até existir device emulation real. **O
ambiente comprovadamente não tem**, medido e não presumido:

```
resize_window(390, 844)   →  "Successfully resized window"
window.innerWidth         →  1920
window.outerWidth         →  0
matchMedia('(min-width: 768px)').matches  →  true
```

A ferramenta relata sucesso e o viewport não muda. **Mandar o QA-02 auditar
mobile aqui produziria exatamente "ausência de evidência virando passou".**
Mobile sai do escopo do QA-02 e vira uma passada própria, com aparelho ou runner
com emulação.

## D.5 · Regras de execução do QA-02

Suas, transcritas para o brief:

1. **Primeiro audita. Depois apresenta o mapa. Só então implementa** — e só o
   que estiver classificado como ÓBVIO.
2. Não altera `analytics.ts`, `fontes-financeiras.ts`, `domain.ts`,
   `firestore.rules` nem `functions/**` para resolver problema visual.
3. Não cria componente, cor, gradiente, animação ou padrão novo.
4. Light-only. Sem neon, sem gradiente decorativo, sem dark mode, sem copiar
   concorrente.
5. Toda mudança de densidade declara **qual pergunta do dono está sendo
   priorizada** e **qual informação continua acessível**.
6. Toda mudança de navegação considera a árvore inteira.
7. Toda mudança de vocabulário se propaga: menu → título → subtítulo → KPI →
   botão → vazio/erro → feedback.
8. Build verde não é "corrigido". Hierarquia, densidade, identidade e coerência
   exigem inspeção visual.
9. **D30 e D27 permanecem separados.** Falha de tenant não é erro de coleção.

⚠️ **Sobre a regra 9 — um alerta que a baseline produziu:** os dois estão hoje
em estados diferentes e nenhum está fechado. O D27 tem mensagem na tabela e
agregados que continuam afirmando zero (A2). O D30 foi corrigido no painel e
**não** no login nem na área do cliente (A3). Tratá-los como um só apagaria
justamente essa diferença.

## D.6 · Sequência recomendada

```
1.  você decide C.1, C.2 e C.3
2.  as 17 correções ÓBVIAS entram — teste, typecheck, lint, build
3.  inspeção visual das que são visuais  (regra 19)
4.  QA-02 audita as 15 rotas em 2 cenários, sem corrigir
5.  você lê o mapa do QA-02
6.  última rodada de implementação
7.  passada de mobile, em aparelho real
8.  UX-AUDIT-FINAL — seção E
9.  revisão humana da identidade → UX POLISH 1.0
```

O passo 2 pode começar assim que C.2 estiver decidida — as 17 correções óbvias
não dependem do QA-02 e nenhuma delas toca motor financeiro.

---

# E · UX-AUDIT-FINAL

A última frente, e ela **não é de implementação**. Definida pelo dono em
18/08/2026. Vem depois do QA-02 e responde uma pergunta diferente da dele.

| | QA-02 | UX-AUDIT-FINAL |
|---|---|---|
| Pergunta | "Parece ter sido feito pela mesma equipe?" | "Entrega a experiência que foi pedida?" |
| Percurso | tela por tela | **ponta a ponta** |
| Sujeito | o produto | **o dono usando o produto** |

## E.1 · O percurso — não é uma lista de telas

```
abrir o sistema
   → entender onde estou
      → executar uma tarefa
         → entender o resultado
            → entender o dinheiro
               → saber o próximo passo
```

Cada seta é o objeto da auditoria. Uma tela pode estar impecável isolada e a
seta que sai dela estar quebrada — é o caso do atalho "histórico diário
**completo** · R$ 180,29" que leva a "SOBROU NO CAIXA −R$ 664,71" (A19). Nem o
Financeiro nem o Fluxo estão errados sozinhos; **a seta entre os dois está.**

## E.2 · O que se pergunta em cada seta

| Seta | A pergunta |
|---|---|
| abrir → onde estou | Em 5 segundos, o dono sabe se o dia está bom ou ruim? |
| onde estou → executar | O próximo passo é óbvio, ou ele precisa procurar? |
| executar → resultado | Depois de concluir, ele viu o que mudou — ou só sumiu o modal? |
| resultado → dinheiro | Ele consegue ir do fato ao efeito no resultado sem intermediário? |
| dinheiro → próximo passo | O produto diz o que fazer com o que acabou de mostrar? |

## E.3 · Por que ela existe

Porque o problema do JP Barber hoje **não é falta de componente**. É coerência e
personalidade. Um produto pode passar em toda auditoria de tela e ainda assim
não responder a pergunta do dono — e é justamente isso que nenhuma passada
tela-por-tela detecta.

## E.4 · Pré-requisito

O UX-AUDIT-FINAL exige a área do cliente e o fluxo de escrita exercitados de
verdade (N7, N8) — nenhum dos dois entrou em nenhuma passada até agora. Rodá-lo
antes disso auditaria metade do percurso.
