# Arquitetura de navegação — o painel do dono

> **Subordinado a `docs/UI-UX-GUIDELINES.md`.** Onde este documento parecer
> divergir do contrato de produto, o contrato vence. §8 das guidelines define a
> regra que governa tudo aqui: *nome de menu é nome de negócio, não de sistema*,
> e *uma informação mora em um lugar*.

Equipe **UX-01** · Rodada 3.2 · 17/08/2026. Arquivos tocados: `nav-items.ts`,
`bottom-nav.tsx`, `painel-sidebar-nav.tsx`, `cliente-sidebar-nav.tsx` e um teste
novo. **Nenhuma rota mudou de lugar. Nenhum `page.tsx` foi editado.**

---

## A régua

> A interface não deve mostrar tudo que o sistema sabe. Deve mostrar o que o
> dono precisa decidir.

O menu tinha **nove itens de primeiro nível** para uma barbearia que muitas
vezes é de um barbeiro só. Isso já tinha sido levantado em
`REVISAO-UIUX-2026-08-02.md` (achado #8) e nunca foi resolvido. Três desses nove
não respondem a nenhuma decisão do dia — respondem *"como minha barbearia está
montada"*.

---

## Quem usa o painel

Vale registrar porque muda o desenho: **`/painel` é do dono e de mais ninguém.**

`AuthGuard requireOwner` cobre a área inteira, e `papel === "owner"` é a única
porta. Barbeiro **não tem acesso** — existe como registro em `staff`, editado
pelo dono. Cliente vive em `(cliente)`, com outro menu.

Consequência: **nenhum item precisa se esconder por papel.** O que varia é só o
**plano**, e para isso existe o cadeado.

---

## O mapa — antes

```
Hoje                    /painel                        o que acontece hoje
Financeiro              /painel/financeiro             como foi o mês
  ├ Resumo              /painel/financeiro
  ├ DRE Gerencial       /painel/financeiro/dre         🔒 advancedFinance
  ├ Fluxo de Caixa      /painel/financeiro/fluxo-caixa 🔒 advancedFinance
  ├ Despesas            /painel/financeiro/despesas    🔒 advancedFinance
  └ Projeção            /painel/financeiro/projecao    🔒 advancedFinance
Clientes                /painel/clientes               quem some, quem volta
Números                 /painel/numeros                ocupação, no-show, ticket
Serviços                /painel/servicos               cadastro
Mensal                  /painel/mensal                 🔒 subscriptions
Equipe                  /painel/equipe                 cadastro
Loja                    /painel/loja                   🔒 store
Ajustes                 /painel/configuracoes          cadastro
```

Nove no primeiro nível. Nenhum dos quatro cadeados de Financeiro era visível.

## O mapa — depois

```
Hoje                    /painel
Financeiro              /painel/financeiro
  ├ Resumo              /painel/financeiro
  ├ Quanto sobrou       /painel/financeiro/dre         🔒
  ├ Fluxo de caixa      /painel/financeiro/fluxo-caixa 🔒
  ├ Projeção de caixa   /painel/financeiro/projecao    🔒
  └ Despesas            /painel/financeiro/despesas    🔒
Clientes                /painel/clientes
Loja                    /painel/loja                   🔒 store
Mensalistas             /painel/mensal                 🔒 subscriptions
Números                 /painel/numeros
Ajustes                 /painel/configuracoes
  ├ Taxas e regras      /painel/configuracoes
  ├ Serviços            /painel/servicos
  └ Equipe              /painel/equipe
```

**Sete no primeiro nível.** As treze telas continuam existindo, todas
alcançáveis, nenhuma movida de rota.

---

## Financeiro: são cinco coisas ou menos?

A pergunta do dono. A resposta: **cinco telas, mas três perguntas e uma entrada
de dado.**

| | pergunta | telas |
|---|---|---|
| 1 | quanto sobrou este mês | **Resumo** (a resposta) → **Quanto sobrou** (o detalhe) |
| 2 | quanto entra e sai do caixa | **Fluxo** (o que já passou) → **Projeção** (o que vem) |
| 3 | — | **Despesas** não responde nada: é onde o dono **digita** |

Resumo e DRE não são duas perguntas: são a mesma resposta fechada e aberta — o
próprio Resumo já tem um botão "Fechamento do mês" que leva ao DRE, e seus KPIs
de topo (Receita, Custo, Resultado, Margem) *são* as primeiras linhas do DRE.
Estavam listados como irmãos, o que ensinava ao dono que eram assuntos
diferentes.

Fluxo e Projeção são o **mesmo eixo em dois tempos**, e a Rodada 3.2 torna isso
mais verdadeiro: `lib/fluxo-de-caixa.ts` passa a produzir entradas, saídas e
saldo acumulado — exatamente o que a Projeção já mostra, só que para trás.
Estavam **separados por Despesas** no meio da lista.

### O que mudou na ordem

```
antes:  Resumo · DRE Gerencial · Fluxo de Caixa · Despesas · Projeção
depois: Resumo · Quanto sobrou · Fluxo de caixa · Projeção de caixa · Despesas
```

As três perguntas primeiro, em ordem de tempo — o mês fechado, o que passou pela
conta, o que vem pela frente — e o **lançamento por último, que é quando ele
acontece**: o dono vem ao Financeiro para ler, e só cai em Despesas quando um
relatório aponta que falta lançar. Os estados vazios do Resumo e da Projeção já
mandam para lá.

### O que **não** foi feito, e por quê

**Fluxo e Projeção não foram fundidos.** Fundir exigiria mover rota, o que não é
decisão desta equipe. Ficaram adjacentes e com nomes que se pareiam — é o máximo
que a navegação resolve sozinha.

**DRE e Fluxo não foram unificados.** Eles **devem** divergir, e o contrato de
FIN-01 diz por quê: *DRE é competência — o que o mês produziu; Fluxo é caixa — o
que entrou e saiu da conta.* Comprar estoque é saída de caixa e não é custo do
período. Forçar os dois a coincidir apaga a diferença entre lucro e dinheiro em
conta, que é a razão pela qual barbearia lucrativa quebra.

---

## Cada renomeação, e o defeito que ela evita

| antes | depois | por quê |
|---|---|---|
| **DRE Gerencial** | **Quanto sobrou** | Linguagem do contador do dono, não dele. É o exemplo que as guidelines §8 usam para definir a regra, e são as palavras do próprio dono. Não virou "Resultado do mês" porque "resultado" é a tradução educada do mesmo termo contábil, e colidiria com "Resumo" logo acima. |
| **Mensal** | **Mensalistas** | Adjetivo sem substantivo — mensal o quê. Colidia com o "fechamento do mês" do Financeiro, que é outra coisa. O produto inteiro já dizia "mensalistas": o cabeçalho da própria tela, o componente `GerirMensalistas`, o texto da landing. O menu era o único lugar que não. **Esta renomeação reduz uma inconsistência que já existia.** |
| **Projeção** | **Projeção de caixa** | Projeção do quê. O par com a linha de cima é o que ensina a diferença entre passado e futuro. É o título que a própria tela já usa. |
| **Fluxo de Caixa** | **Fluxo de caixa** | Só a caixa alta. Ver abaixo por que o nome ficou. |

### E o que deliberadamente **não** foi renomeado

**"Fluxo de caixa" ficou.** É a única coisa no menu que soa técnica, mas é
vocabulário que dono de pequeno negócio de fato usa — diferente de "DRE", que é
do contador dele. E `lib/fluxo-de-caixa.ts` está sendo escrito com esse nome
agora: renomear no menu criaria dois nomes para o mesmo contrato no mesmo dia.

**"Números" ficou.** Parece nome de sistema, mas *"vamos ver os números do mês"*
é fala de dono, não de programador. Nenhum candidato sobreviveu ao teste:
**"Movimento"** colide com `MovimentoDeCaixa` (FIN-01) e com os `movements` de
estoque — o mesmo termo para três coisas; **"Desempenho"** é mais corporativo que
o atual. Renomear sem nome melhor é troca por troca.

**"Resumo" ficou.** É linguagem de dono e não colide com nada.

---

## Cada mudança de posição

### Serviços e Equipe viraram filhos de Ajustes

São telas de **montar a barbearia** — o que eu vendo, quem atende. Mexidas no
onboarding e depois quase nunca. Ocupavam a mesma faixa que Hoje e Financeiro.
Junto com taxas e tolerância de atraso, formam um grupo só: *como minha
barbearia está montada*.

**Nenhuma rota mudou** — mudou onde o menu as pendura. Custo: um toque a mais
para chegar. Aceitável para telas de cadastro; **não** seria para telas de
operação.

⚠️ **Efeito colateral que precisa de dono.** A tela de Serviços carrega alarmes
que travam a barbearia — *"Nenhum serviço visível: seu cliente abre o app e não
tem o que agendar"*, *"serviço com preço zerado"*. Um nível mais fundo, esses
alarmes ficam mais longe. O lugar certo deles é a seção **"Precisa de você"** do
Hoje, que é de UX-03 / `action-center.ts`. **Registrado abaixo como handoff.**

### Loja subiu de oitavo para quarto

O único item que mudou de faixa. É **tela de balcão**: o dono a abre com o
cliente parado na frente dele, para vender um produto ou conferir estoque.
Estava atrás do menu "Mais" do celular — **dois toques** — enquanto Números, que
ele lê uma vez por mês sentado, estava a **um**.

A ordem media importância declarada. Agora mede **frequência de uso real**.

### Clientes continua em terceiro

O comentário no código dizia *"fica logo depois de Hoje"* e o item era o
**terceiro desde que nasceu**: a nota descrevia uma intenção, não o código. O que
a intenção de D26 exigia era estar na primeira faixa, e está. O comentário foi
corrigido para dizer a verdade.

---

## Três defeitos de navegação encontrados no caminho

Não estavam no escopo pedido; apareceram ao mexer na estrutura.

### 1 · Os cadeados do Financeiro eram invisíveis

Quatro das cinco telas exigem `advancedFinance` — `BloqueioPlano` está em `dre`,
`fluxo-caixa`, `despesas` e `projecao`. Só o Resumo é livre. O menu mostrava as
cinco iguais, sem cadeado, porque `NavChild` **não tinha o campo**.

A decisão de produto já estava escrita no item-pai: *"o item continua no menu
com cadeado — sumir não vende nada, e a tela bloqueada é onde o dono descobre que
existe algo a mais"*. Os filhos apenas não sabiam expressá-la. Agora sabem.

### 2 · O menu prometia o que a tela negava

A barra lateral lia `tenant.features` **cru**. `tenant-context.tsx` documenta
esse exato defeito em `useFeature`: numa barbearia **suspensa ou com trial
vencido**, `acessoDaBarbearia` devolve "nenhum recurso", mas o `features` gravado
no documento continua dizendo `store: true`.

Resultado: Loja e Mensalistas apareciam **destrancadas** no menu enquanto a
própria tela as bloqueava. Duas respostas para a mesma pergunta, divergindo
justamente no caso que importa — a barbearia que parou de pagar.

Os dois menus passaram a usar `useAcesso()`, a mesma fonte que as telas usam.

### 3 · "Hoje" acendia em todas as telas do celular

A barra lateral se protegia com um `item.href !== "/painel"` escrito à mão. A
barra do celular **não tinha essa guarda**: `/painel/loja` começa com `/painel/`,
então "Hoje" ficava aceso em Loja, em Clientes e em Financeiro. O realce existe
para responder *"onde eu estou"*, e no aparelho onde o dono trabalha ele
respondia "em todo lugar".

A exceção agora é **derivada da lista** (`ehRaizDaArea`), não escrita à mão em
cada componente: quem adicionar amanhã uma rota sob `/painel` não precisa lembrar
de nada.

---

## O celular: o submenu não existia

Achado #7 de `REVISAO-UIUX-2026-08-02.md`, nunca resolvido: **a barra de baixo
nunca desenhou submenu**, e a lateral só existe no desktop. DRE, Fluxo, Despesas
e Projeção só chegavam pelos cartões "Relatórios detalhados" dentro do
Financeiro. E Serviços e Equipe ficariam **inalcançáveis** ao virarem filhos de
Ajustes.

> Um item de menu que não pode ser tocado no aparelho onde o dono trabalha não
> está no menu.

A regra passou a ser uma só e verificável, em `menuDoCelular`:

> **"Mais" contém todo destino que a barra não alcança** — os filhos dos itens
> que estão na barra, e os itens de fora com os filhos deles.

```
barra:  Hoje · Financeiro · Clientes · Loja · [Mais]
Mais:     Quanto sobrou · Fluxo de caixa · Projeção de caixa · Despesas
          Mensalistas
          Números
          Ajustes · Serviços · Equipe
```

Toda tela do painel em **no máximo dois toques**, e há teste que prova isso rota
a rota. O filho que aponta para a rota do pai (Resumo, Taxas e regras) não é
repetido: listar os dois ensinaria que são dois lugares.

O corte saiu de dentro do componente e virou função pura — uma regra que decide
o que o dono alcança precisa de teste, e dentro do componente só tinha prova
visual. Alvo de toque preservado: 56px na barra, 48px na folha (guidelines §6).

O menu do **cliente** não mudou: cinco itens rasos, cabe inteiro, não ganha
"Mais".

---

## O que esta equipe **não** pôde consertar

### `STOP` · "Previsto hoje" × "Previsão do dia"

O caso citado no brief e listado em **§13 das guidelines como exemplo
proibido** — o mesmo número com dois nomes. Ambos vivem em
`painel/(dashboard)/page.tsx`, na mesma variável `previsaoHoje`: um KPI no topo
e uma linha no bloco "Previsão × recebido".

**É `page.tsx` da tela Hoje — arquivo de UX-03.** Não é problema de navegação:
os dois estão na mesma tela. Não foi tocado.

### `STOP` · A tela ainda se chama "DRE Gerencial"

O menu agora diz **"Quanto sobrou"** e a tela de destino continua com
`<h1>DRE Gerencial</h1>`, mais `BloqueioPlano titulo="DRE Gerencial"` e um
`QuickLinkCard label="DRE Gerencial"` dentro do Resumo.

Pelas guidelines §8, **a tela é que está errada** — mas os três pontos são
`page.tsx` de UX-02. A navegação produziu o vocabulário; UX-02 precisa consumi-lo,
ou o menu leva a um lugar com outro nome.

**Handoff para UX-02** — `financeiro/dre/page.tsx` e `financeiro/page.tsx`:

| onde | de | para |
|---|---|---|
| `dre/page.tsx` h1 e `BloqueioPlano` | DRE Gerencial | Quanto sobrou |
| `financeiro/page.tsx` `QuickLinkCard` | DRE Gerencial | Quanto sobrou |
| `financeiro/page.tsx` botão | Fechamento do mês | (idem — hoje são dois nomes para a mesma tela) |

### `STOP` · Alarmes de Serviços deveriam subir para "Precisa de você"

Ver acima. **Handoff para UX-03** / `action-center.ts`: serviço invisível e
serviço com preço zerado travam o agendamento e agora estão um nível mais fundo.

---

## Testes

`web/src/lib/__tests__/navegacao.test.ts` — 23 casos, todos novos:

- **cobertura**: toda rota do painel está no menu; nenhum item aponta para rota
  inexistente; o primeiro nível não passa de sete
- **vocabulário**: nenhum rótulo contém `DRE`, `MRR` ou "demonstração"
- **cadeado**: as quatro telas de financeiro avançado marcadas, o Resumo livre
- **realce**: "Hoje" acende só em `/painel`; Ajustes acende em Serviços e Equipe,
  que moram fora do seu prefixo; em qualquer rota, **exatamente um** item de
  primeiro nível acende
- **celular**: toda rota alcançável em dois toques; a folha não repete a barra

O teto de sete itens é proposital: fazer o menu crescer de novo passa a ser uma
**decisão**, e não um acidente.

---

## Verificação

| comando | resultado |
|---|---|
| `npx tsc --noEmit` | ✅ limpo |
| `npx eslint src --max-warnings=0` | ✅ limpo nos arquivos da UX-01 · 1 aviso pré-existente em `reconciliacao.test.ts` (FIN-01) |
| `npx vitest run` | 536 passando / 542 · **+23 desta equipe, todos verdes** |
| `npm run build` | ✅ compila · as 13 rotas do painel intactas |

As 6 falhas restantes são de outras equipes, em arquivos proibidos para a UX-01:
5 em `contraste-de-tokens.test.ts` (UX-04, tokens de `globals.css`) e 1 em
`regressao-integracao.test.ts` (comissão congelada sem `origin` — domínio
financeiro).

Baseline no início desta frente: **445 passando, 8 falhando** (FIN-01 em voo).
Ao fim: **536 passando**. Nenhum teste caiu por conta desta equipe — e os
números totais oscilam durante a rodada porque as outras frentes estão
entregando em paralelo.
