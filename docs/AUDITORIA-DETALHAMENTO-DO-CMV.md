# Auditoria · o detalhamento do CMV — FIN-02

> **A pergunta do dono do produto:** qual é a unidade semântica daquele
> detalhamento? Se o cabeçalho é "CMV = custo efetivamente consumido pelas
> vendas", o detalhamento precisa EXPLICAR COMO chegamos aos R$ 18,00 — não
> apenas listar outra coisa que por acaso soma o mesmo.

Auditoria da correção aplicada em `9c1fc33` ao `cmvTree` do
`financeiro/dre/page.tsx`. Rodada 3.2.

---

## Resposta curta

**A correção acertou a FONTE e errou a UNIDADE.**

Ela trocou "as compras do mês" por "o custo do que foi vendido", que é a fonte
certa — o D3 e o `MAPA-DE-FONTES.md` mandam exatamente isso. Mas manteve o
detalhamento como uma **lista de agregados por produto**, e a pergunta que o
detalhamento existe para responder não é *"o que compõe os R$ 18,00"* e sim
*"como se chega nos R$ 18,00"*.

A unidade semântica certa é **a conta, não o item**:

```
quantidade vendida  ×  custo unitário congelado  −  o que voltou na prateleira
```

Com isso, quatro defeitos concretos caem — três deles fazem a soma dos filhos
**deixar de fechar** com o cabeçalho, que é a mesma falha (D6/P1-2) que a
correção foi escrita para consertar.

---

## 1 · A correção está semanticamente certa?

**Não.** `"1 un. vendida"` ao lado de `R$ 18,00` não permite conferir nada. O
dono lê dois números que não se relacionam: a legenda diz uma quantidade e o
valor diz dinheiro, e não há operação declarada entre os dois.

O repositório já tinha o padrão certo, na mesma tela e três blocos abaixo — a
linha de comissão:

```
Léo    R$ 1.240,00    40% sobre R$ 3.100,00 · 62 atendimentos
```

Essa legenda é **auditável**: o dono multiplica e fecha. A do CMV não era.

**Depois desta auditoria:**

```
(−) Custo de Mercadoria Vendida            R$  24,00
    Pomada modeladora                      R$  36,00    3 un. × R$ 12,00
    Devolução · Pomada modeladora         −R$  12,00    1 un. de volta na prateleira
```

### O caso que impede um `× R$ X` único

Duas reposições a preços diferentes na mesma prateleira é o caso normal — é
precisamente **para isso** que o `unitCost` é congelado por movimento (G1).
Vendeu 1 un. a R$ 9,00 e 2 un. a R$ 12,00: anunciar `3 un. × R$ 9,00` pediria
uma multiplicação que não fecha, e seria uma segunda mentira no mesmo lugar.

Nesse caso a legenda passa a dizer `3 un. · custo médio R$ 11,00`, com a palavra
"médio" fazendo o trabalho de avisar que ali não cabe multiplicação. O campo
`custoUnitario` do motor devolve `null` justamente para a tela não ter como
inventar um valor único.

---

## 2 · A devolução aparece de forma compreensível?

**Não. Ela era subtraída em silêncio, e isso esconde um fato.**

Na correção auditada, vender 3 e devolver 1 produzia o filho `"2 un. vendidas"`.
Dois problemas, e o segundo é pior que o primeiro:

1. **O fato desaparece.** Não houve venda de 2 unidades. Houve venda de 3 e
   devolução de 1 — que é exatamente o evento que o dono precisa investigar.
2. **O número para de bater com a Loja.** A tela de Loja mostra as 3 vendas. O
   DRE mostrava 2. O dono que cruzasse as duas telas encontraria uma diferença
   sem explicação, e a explicação existia — só não estava escrita em lugar
   nenhum.

### A evidência decisiva: o contrato já existe, um bloco acima

`composicaoDaReceita` — consumida pelo **mesmo `page.tsx`**, para montar a
árvore de receita que fica imediatamente acima do CMV — resolveu esse mesmo
problema na direção oposta, e o comentário no código diz por quê:

```ts
/* A devolução entra por último e com sinal, porque não é uma fatia da receita
 * — é o que saiu dela. Escondê-la faria a soma das linhas não bater com a
 * receita realizada logo acima. */
```

Ou seja: na árvore de **receita** a devolução é linha própria assinada; na
árvore de **CMV** ela era abatida por dentro. **O mesmo evento, na mesma tela,
apresentado de duas formas contraditórias.** Não é preferência de layout — é
contrato de apresentação, e ele já estava decidido.

Corrigido: a devolução do CMV agora é linha própria, com sinal, depois das
entradas. Mesmo desenho.

---

## 3 · Casos de borda

### 3.1 · Venda sem `unitCost` congelado — anterior a G1

**Confirmado como defeito de produto.**

O motor faz a coisa certa e **conta** o buraco:

```ts
// fontes-financeiras.ts
return { total: centavos(total), semCustoCongelado: semCusto };
```

O contador existe desde a 3.2, é testado, e **`analytics.ts` o joga fora** — só
`.total` é consumido. Ele nunca chegou a lugar nenhum da interface:

```
grep -rn "semCustoCongelado" web/src
  fontes-financeiras.ts:296      (declaração)
  fontes-financeiras.ts:322      (retorno)
  __tests__/fontes-financeiras.test.ts:474
```

Consequência na tela auditada: a venda sem custo caía num `continue`, e o
produto **sumia do detalhamento**. O dono via uma lista mais curta e um total
menor, sem uma palavra de explicação — e a leitura natural de uma venda que
some é "o sistema perdeu a venda", não "essa venda é anterior ao registro de
custo".

É o mesmo problema que `LinhaDeReceita.semFatoMaterializado` já resolve para a
receita, com a justificativa escrita no próprio tipo: *"existe para a migração
ser VISÍVEL"*. O CMV tinha o número e não o mostrava.

Corrigido: a linha do produto passa a existir mesmo sem custo, valendo
R$ 0,00 — que é a verdade —, com a legenda dizendo
`4 un. sem custo registrado, fora do cálculo`.

### 3.2 · Devolução que zera a quantidade do produto

**Era o defeito mais grave, e quebrava a soma.**

```ts
.filter(([, v]) => v.unidades !== 0)   // ← a linha do problema
```

Vendeu 2 e devolveu 2: unidades líquidas = 0, e o produto **sumia inteiro do
detalhamento**. O mês em que houve venda e devolução ficava indistinguível do
mês em que não houve movimento nenhum.

Pior: o filtro é por **unidades**, e o que precisa fechar é **dinheiro**. As duas
grandezas só andam juntas enquanto o custo unitário for constante. Com a
devolução carregando um `unitCost` diferente da venda — por dado antigo,
migração parcial ou um `refundOf` apontando outro lote — dá para ter unidades
líquidas zero e custo líquido diferente de zero, e o filtro apagaria uma linha
com valor. A soma dos filhos deixaria de fechar sem nenhum sinal.

Corrigido: nada é filtrado por quantidade. Venda e devolução aparecem como duas
linhas, e o produto continua visível com custo líquido R$ 0,00.

### 3.3 · Produto excluído do cadastro

A correção auditada caía em `?? productId`, mostrando o **id cru do Firestore**
como se fosse nome de produto. O custo continua correto — ele vem do movimento,
não do cadastro —, mas o dono lê `aB3xK9pQ2m` numa linha de dinheiro.

Corrigido: `"Produto removido do cadastro"`. Explica por que o nome sumiu sem
sumir com o custo.

### 3.4 · Arredondamento por filho × arredondamento do total

**Achado desta auditoria. Quebrava a soma em centavos.**

A tela arredondava **cada filho**:

```ts
value: Math.round(v.custo * 100) / 100
```

O motor arredonda **só o total** (`centavos(total)`). E `Σ round(xᵢ) ≠ round(Σ xᵢ)`.

Não é hipótese de laboratório: **caixa de 12 pomadas por R$ 100,00 dá
R$ 8,3333… a unidade**, e comprar por caixa é o caso comum de uma barbearia.
Três produtos nessa situação e o detalhamento foge do cabeçalho por centavos —
o dono que conferisse na calculadora não fecharia, que é literalmente o defeito
que `9c1fc33` foi escrito para corrigir, reintroduzido pela própria correção
num dígito mais discreto.

Corrigido no motor, com **maior resto (Hare)**: os valores são arredondados em
conjunto e o resíduo vai para quem tem a maior fração pendente, de modo que a
soma dos filhos exibidos é **igual, no centavo**, ao total exibido. Fechar a
soma é invariante da função, não expectativa sobre a entrada.

### 3.5 · Dois recortes de período

O motor filtra com `dentroDoPeriodo(m.date, periodo)`; a tela filtrava com
`m.date.startsWith(mes)`. Para datas `YYYY-MM-DD` bem formadas os dois coincidem
— mas são duas regras escritas em módulos diferentes para o mesmo recorte, e
qualquer data com sufixo de hora (`2026-08-31T23:00`) já as separa: passa no
`startsWith` e falha no `dentroDoPeriodo`. Apareceria como um filho a mais sob
um total que não mudou.

Corrigido: a tela passa a `periodo`, que vem do próprio hook. Um recorte só.

### 3.6 · CMV de −R$ 0,00

Encontrado pelo teste de cenário aleatório, não por inspeção.

Num mês em que tudo foi devolvido e o custo unitário é quebrado, o acumulador
termina um fio abaixo de zero por resíduo de ponto flutuante, `Math.round`
devolve `-0`, e o cabeçalho publicaria **"−R$ 0,00"** — um custo de mercadoria
negativo, que não existe. Normalizado no retorno do motor.

---

## 4 · A soma fecha SEMPRE?

**Agora sim, e por construção — não por coincidência.**

### A causa-raiz era arquitetural, não aritmética

O `PROTOCOLO-MULTI-AGENTE.md` já registra o diagnóstico na regra 19:

> O CMV é o caso exemplar: o total estava certo, e **nenhum teste pegaria**,
> porque o defeito estava no filho que a interface mostrava embaixo dele.

A razão de nenhum teste pegar não é falta de zelo da QA. É que a conta do filho
vivia numa **IIFE dentro de um componente React**, inalcançável sem renderizar.
A linha do DRE tinha **duas contas para o mesmo número**, em módulos diferentes,
e só a do motor sob teste. Foi por isso que o filho ficou órfão quando o
cabeçalho mudou de fonte — e é por isso que ele voltaria a ficar.

A correção de `9c1fc33` manteve as duas contas. Ela consertou o valor daquele
mês sem tirar a condição que produz o defeito.

### O que mudou

O detalhamento passou para o motor, em `fontes-financeiras.ts`:

```ts
export function detalheDoCustoDoVendido(...): DetalheDoCmv
export function custoDoVendido(params) {          // ← agora delega
  const d = detalheDoCustoDoVendido(params);
  return { total: d.total, semCustoCongelado: d.semCustoCongelado };
}
```

Cabeçalho e filhos saem do **mesmo laço, no mesmo acumulador**. Não podem
divergir nem que alguém queira. A tela não calcula mais nenhum valor em
dinheiro — resolve nome de produto e escreve legenda.

### A prova

`web/src/lib/__tests__/detalhe-do-cmv.test.ts`, 15 verificações. A asserção é
sempre contra `custoDoVendido(...).total` — a função que `analytics.ts` chama
para publicar `dre.cmv` — e nunca contra um número recopiado no teste, que
provaria só que o teste sabe somar.

| cenário | fecha |
|---|---|
| mês sem movimento | ✅ |
| uma venda | ✅ |
| vários produtos | ✅ |
| venda parcialmente devolvida (o caso da tela) | ✅ |
| devolução que zera a quantidade do produto | ✅ |
| venda sem custo congelado (anterior a G1) | ✅ |
| venda com e sem custo no mesmo produto | ✅ |
| custo unitário quebrado (caixa de 12 por R$ 100) | ✅ |
| `ajuste` sem `refundOf` (quebra, vencimento, recontagem) | ✅ |
| compra do mês presente na base | ✅ |
| movimento fora do período | ✅ |
| custos diferentes no mesmo mês | ✅ |
| mês inteiramente devolvido (o `-0`) | ✅ |

E, acima dos exemplos, **500 cenários gerados** com custos quebrados, vendas sem
custo, compras, ajustes de inventário, movimentos fora do mês e devoluções
parciais — todos exigindo `Σ filhos === cabeçalho` no centavo. Gerador
determinístico de propósito: um cenário que quebre precisa quebrar de novo na
execução seguinte, senão o defeito vira folclore.

---

## 5 · Os três estados — regra 19

| estado | o quê |
|---|---|
| **IMPLEMENTADO** | `detalheDoCustoDoVendido` no motor; `cmvTree` consumindo; legenda com a conta; devolução como linha assinada; venda sem custo visível; produto removido nomeado; período único; `-0` normalizado |
| **TESTADO** | 578 verificações verdes (563 antes, +15). `tsc --noEmit`, `eslint src --max-warnings=0` e `npm run build` limpos |
| **VERIFICADO** | **nada.** Não tenho navegador |

### O que precisa ser olhado na tela, e por quem

Pelo **dono do produto**, em `/painel/financeiro/dre`, com o CMV expandido:

1. **A conta fecha na calculadora.** Somar os filhos exibidos e comparar com o
   cabeçalho. É a verificação que encontrou o defeito original e a única que
   fecha esta auditoria.
2. **A legenda explica o valor.** `3 un. × R$ 12,00` ao lado de `R$ 36,00` — e
   se o produto teve custos diferentes no mês, `custo médio` aparece escrito.
3. **A devolução aparece como linha própria negativa**, com o nome do produto,
   e o número de unidades vendidas continua batendo com a tela de Loja.
4. **Roteiro mínimo:** vender 3 un. de um produto, devolver 1, e conferir que a
   tela mostra `3 un.` na linha de venda e `1 un.` na linha de devolução — e
   não `2 un. vendidas`.
5. **Alinhamento e largura** das linhas negativas dentro do `ExpandableGroup`:
   `−R$ 12,00` é a primeira linha negativa que o grupo do CMV já teve. Nunca foi
   renderizada. Precisa de olho, inclusive em viewport móvel.

Item 5 é o risco visual desta mudança e não tem como ser coberto por teste.

---

## 6 · Pendências fora do meu ownership

Nada bloqueante. Duas observações para o orquestrador:

**`semCustoCongelado` continua descartado por `analytics.ts`.** Corrigi a
visibilidade **por produto**, dentro do detalhamento, que é onde o dono está
olhando. Mas o agregado do mês ("4 vendas deste mês não têm custo registrado")
seria melhor como aviso no topo da linha do CMV, e isso exige `analytics.ts` —
arquivo proibido para mim. **Não toquei.**

**O detalhe é recalculado na tela a partir de `raw.movements` e `periodo`.** São
os mesmos argumentos que o hook passa para o cabeçalho, então o resultado é
idêntico. Ainda assim, o ideal é `use-financeiro.ts` devolver `detalheCmv`
pronto, junto de `dre` — aí nem os argumentos poderiam divergir. `use-financeiro.ts`
não está no meu ownership. Fica como sugestão.

---

## 7 · Nota de procedimento — o worktree veio da base errada

Registrado porque afeta a leitura de qualquer resultado desta leva.

O worktree `agent-aef2e952b8248107b` nasceu apontando para `659091a`, que é
**29 commits anterior** a `hardening/p0-2026-08-17`. Nessa base:

- os três documentos de leitura obrigatória não existiam
  (`PROTOCOLO-MULTI-AGENTE.md`, `MAPA-DE-FONTES.md`, `DECISOES-DE-MODELO.md`);
- `web/src/lib/fontes-financeiras.ts` não existia;
- `domain.ts` não tinha `unitCost`, `refundOf` nem `kind: "ajuste"`;
- `analytics.ts` ainda somava `kind === "compra"` no CMV — ou seja, **o defeito
  auditado não existia ali**, porque cabeçalho e filho liam a mesma coisa errada;
- o commit `9c1fc33` não estava no histórico;
- a suíte não tinha 563 testes.

Aplicar a correção nessa base **não compilaria**, e fazê-la compilar exigiria
editar `domain.ts` e `analytics.ts` — os dois proibidos. Seria um
`CONFLITO DE OWNERSHIP` fabricado por um erro de provisionamento.

Como a branch do worktree era **ancestral estrita** de `hardening/p0-2026-08-17`,
sem commit próprio e com a árvore limpa, resolvi com `git merge --ff-only` — sem
perda e sem reescrita. A suíte passou a marcar exatamente os 563 testes do
enunciado, o que confirma a base pretendida.

**Vale checar como os outros worktrees da leva foram criados.**
