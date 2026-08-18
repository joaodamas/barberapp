# Design System — JP Barber

> **Contrato de componentes.** `docs/UI-UX-GUIDELINES.md` diz *o que* o produto
> quer parecer; este documento diz *com o que* isso é construído. Quando os dois
> divergirem, o guideline vence — ele é decisão do dono, este é implementação.

Produzido por **UX-04**, dona de `web/src/components/ui/**` e de
`web/src/app/globals.css`. UX-02 e UX-03 **consomem** e não editam. Precisa de
componente que não está aqui? Peça ao orquestrador — não crie na tela.

Três regras deste documento são executáveis, e reprovam o build se alguém as
furar:

| trava | arquivo |
|---|---|
| contraste WCAG AA de cada par que o produto pinta | `web/src/lib/__tests__/contraste-de-tokens.test.ts` |
| alvo de toque, light-only, `prefers-reduced-motion` | `web/src/lib/__tests__/regras-do-design-system.test.ts` |

---

## 1 · Tokens

Definidos em `globals.css`. **Nenhum valor novo sem decisão do dono.**

### Superfícies — elas empilham

```
--color-bg              #ffffff   a página
--color-surface         #f8f5ee   o cartão
--color-surface-raised  #efe9dc   o realce dentro do cartão, e a etiqueta
```

Empilham nesta ordem e não pulam degraus: um realce dentro de um realce não
existe. Se a tela precisa de um terceiro nível, a hierarquia está errada, não a
paleta.

### Tinta

```
--color-ivory        #17140f   texto principal (quase preto)
--color-ivory-muted  #6b6355   texto secundário, e contorno de campo
--color-gold         #b8863a   acento da marca — SOBRESCRITO por barbearia
--color-gold-light   #8c5f1e   mais ESCURO que gold; texto e anel de foco
--color-gold-hover   #c99a52   hover de superfície dourada — precisa CLAREAR
--color-success      #43733a   resultado positivo
--color-danger       #ab4a3a   erro, perda, ação destrutiva
--color-border       #e1d8c5   divisão decorativa (1,30:1 — não é alvo de WCAG)
--color-border-strong #a1937a  divisão que precisa ser vista, fora de controle
```

⚠️ **A nomenclatura engana e é deliberada.** `ivory` é quase preto; `gold-light`
é mais escuro que `gold`. Não "corrija" os nomes.

### A regra que governa os tokens de acessibilidade

> **`--color-gold` é o único token que a barbearia sobrescreve em tempo de
> execução.** Nada que sirva para ENXERGAR a interface pode depender dele —
> anel de foco, contorno de controle, fundo de etiqueta. Só decoração e
> identidade.

Isso não é teoria: o anel de foco dependia dele e media 2,96:1 no cartão, com um
valor diferente em cada cliente e nenhum build capaz de saber qual. Hoje usa
`--color-gold-light`, que é da plataforma, e o teste reprova se voltar.

### Elevação

```
--shadow-sm   cartão em repouso (.card-elevated)
--shadow-md   cartão sob o cursor (.card-interactive:hover)
--shadow-lg   reservado
--shadow-gold ⚠️ sombra colorida — anti-pattern declarado. Ver §7.
```

### Utilitários de `globals.css`

| classe | para quê |
|---|---|
| `.card-elevated` | aplicado pelo `Card`; não use solto |
| `.card-interactive` | idem, via `interactive` |
| `.alvo-toque` | 44px de área num controle de 36px de desenho — ver §4 |
| `.table-scroll` | sombra na borda de tabela que rola na horizontal |
| `.font-display` | número em dinheiro e título |
| `.font-brand` | só onde a PLATAFORMA fala por si (landing). Nunca no painel |
| `.safe-top` / `.safe-bottom` | recorte de tela do celular |

---

## 2 · Escala de espaçamento

O produto usava dezessete valores de `gap` e sete de `padding`. A escala é
**quatro passos**, e quem precisa de um quinto está resolvendo hierarquia com
espaço:

```
gap-1 / gap-1.5   dentro de um bloco  — rótulo e valor, ícone e texto
gap-3             entre itens irmãos  — cartões de uma grade
gap-6             entre seções        — um assunto e o próximo
gap-10 md:gap-16  entre áreas da tela — cabeçalho e conteúdo
```

Cada passo é o dobro do anterior, que é o que torna a escala decorável — e
decorável é a única coisa que faz uma escala ser seguida.

⚠️ **O código ainda não está nesta escala** e ninguém precisa parar para
convertê-lo: `gap-2` aparece 132 vezes, `gap-4` 57, `gap-5` 20, `gap-8` 16. A
escala vale para o que você escrever ou reescrever — `gap-2` vira `gap-3`,
`gap-4`/`gap-5` viram `gap-3` ou `gap-6` conforme separem itens ou seções.

**O respiro do cartão não se escreve à mão.** É prop, e são quatro:

```tsx
<Card padding="none">  listas que desenham o próprio recheio (divide-y)
<Card padding="sm">    bloco denso — indicador, tela de operação
<Card>                 padrão
<Card padding="lg">    tela de análise, que o dono lê sentado
```

Quinze cartões escreviam `md:p-6` à mão, dois `md:p-7`, um `md:p-5`. Nenhuma das
diferenças foi decidida — apareceram porque cada tela foi escrita num dia. Três
telas de análise lado a lado podiam ter três espessuras de moldura.

> **Densidade é decisão de conteúdo, não de estética.** Operação (Hoje, Loja) é
> densa porque o dono opera em pé; análise (Financeiro, Números) respira porque
> ele lê sentado. `padding="sm"` e `padding="lg"` são exatamente essa escolha.

---

## 3 · Componentes

### `Card`

Superfície de conteúdo. Aceita todo atributo de `div` e encaminha `ref`.

```tsx
<Card padding="lg" interactive onClick={...}>
```

**Não use** para agrupar o que não é um bloco de conteúdo — cartão dentro de
cartão. E `interactive` só quando o cartão INTEIRO é clicável; se a ação é um
botão dentro dele, o botão é que é clicável.

### `Button`

Quatro papéis, dois tamanhos.

| variant | quando |
|---|---|
| `primary` | a ação principal da tela. **Uma por tela** |
| `secondary` | alternativa de mesmo peso, ou ação de linha |
| `ghost` | ação de saída — "Cancelar", "Manter", "Tentar de novo" |
| `danger` | confirmação de destruição, e só ela |

| size | quando |
|---|---|
| `md` | padrão — 44px |
| `sm` | ação de LINHA de lista. 36px de desenho, 44px de área |

**Não use** `danger` para avisar de risco — ele é para o botão que EXECUTA a
destruição. O botão que abre a confirmação é `secondary` ou `ghost`. Duas telas
escreviam `className="bg-danger text-white hover:bg-danger/90"` à mão; a
terceira teria escolhido o tom de novo, do zero.

**Nunca** escreva `min-h-9 px-3 text-xs` na mão — é `size="sm"`. Ver §4.

### `Pill`

Etiqueta de estado: "Paga · Pix", "Em aberto", "Cancelado". Tons `gold`,
`success`, `danger`, `neutral`.

Fundo **opaco** (`surface-raised`), tom no texto e na borda. Não volte a usar
tinta translúcida (`bg-success/15`): o teste reprova, e a razão está na §7.

**Não use** para ação — etiqueta não é botão, e um `<span>` clicável não recebe
foco de teclado. **Não use** cor como única informação: a palavra dentro da
etiqueta é que diz "pago" ou "atrasado".

### `KpiTile` · `LoadingKpis` · `signTone`

Um número que o dono decide em cima. `tone` vem de `signTone(valor)` no
financeiro — verde positivo, vermelho negativo.

```tsx
<KpiTile tone={signTone(resultado)} icon={Wallet} label="Resultado"
         value={formatBRL(resultado)} caption="depois das despesas" />
```

`LoadingKpis` mora no MESMO arquivo, e não é decoração: ele reserva a altura
exata do cartão real, que é o que impede a tela de pular quando o Firestore
responde. Se você mudar o respiro ou o tamanho do valor, o esqueleto vem junto.

**Não use** mais de quatro numa primeira leitura. O Financeiro tem oito hoje e é
o achado nº 1 da auditoria de UI/UX: a tela não deve mostrar tudo que o sistema
sabe.

### `EstadoCentral`

O cartão centrado — círculo com ícone, o que é, o que fazer, e uma saída. É a
base de `EmptyState` e de `BloqueioPlano`.

**Use direto** só para um estado que não é nenhum dos dois. Na dúvida, é
`EmptyState`.

### `EmptyState`

Vazio que ensina. `title` nomeia a situação **com o período** ("Sem movimento em
agosto"); `description` diz o que fazer para preencher.

**Não use** quando a leitura FALHOU — isso é `ErroAoCarregar`, e trocar um pelo
outro é o D27: a tela dizia *"nenhuma despesa em agosto"* quando a verdade era
*"não consegui ler as despesas"*, e o dono concluía que não tinha gasto nada.

**Não use** sem `actionLabel` se houver o que fazer. Sem rótulo não há botão —
`actionHref` sozinho não renderiza nada.

### `ErroAoCarregar` · `LinhaDeErro`

"Não consegui ler", em cartão e em linha de tabela. As duas versões dizem as
**três** partes: o fato, a consequência ("Nada foi perdido") e a saída ("Tentar
de novo").

```tsx
{status === "erro" ? <ErroAoCarregar oQue="as despesas" />
 : status === "carregando" ? <LoadingRows oQue="as despesas" />
 : lista.length === 0 ? <EmptyState ... />
 : <Tabela ... />}
```

`oQue` é linguagem de dono — *"as despesas"*, *"sua agenda"*. Nunca o nome da
coleção.

**Não trate erro como vazio.** Treze telas usam `status` e duas o tratavam.

### Esqueletos — `LoadingRows` · `LoadingTable` · `LoadingText` · `LoadingKpis`

| componente | forma que reserva |
|---|---|
| `LoadingRows` | lista de linhas |
| `LoadingTable` | tabela com cabeçalho |
| `LoadingText` | uma PALAVRA no meio de uma frase |
| `LoadingKpis` | grade de indicadores (em `kpi-tile.tsx`) |

Todos aceitam `oQue`, e **passe sempre**: quem enxerga sabe pela posição do
bloco o que está chegando; quem ouve recebia só "carregando".

**Não use** spinner. **Não use** um esqueleto de forma diferente do conteúdo —
ele existe para reservar a altura, e um que reserva errado troca o pisca-vazio
por um salto de layout.

### `Modal`

Diálogo com armadilha de foco, `Esc`, trava de rolagem e devolução do foco ao
fechar. `title` é obrigatório e vira o rótulo acessível.

**Não use** para confirmar o que dá para desfazer — confirmação que não protege
de nada só treina o dono a clicar sem ler. **Não empilhe** dois.

### `Segmented`

Poucas opções, todas visíveis, comparadas com um toque. Setas ← →, `Home`/`End`,
e o grupo inteiro é uma parada de `Tab`.

**Não use** com mais de quatro opções nem para navegação entre telas — isso é
`nav-items.ts`, e é de UX-01.

### `BloqueioPlano` · `AvisoModoLeitura`

Porta de recurso que depende do plano, e a barra fixa de modo leitura. O
bloqueio **vende** em vez de negar. Sem WhatsApp comercial configurado o botão
não aparece — controle que não faz nada é pior que a ausência dele.

**Não use** para permissão de papel (barbeiro × dono).

### `LineChart` · `BarChart`

SVG puro, sem biblioteca, `aria-hidden` — quem usa leitor de tela lê a tabela,
que continua na página.

> ⚠️ **Guarde antes de renderizar.** `LineChart` exige 2 pontos, `BarChart` 1.
> Abaixo disso devolvem `null` **de propósito**: só a tela sabe se a frase certa
> é "a projeção precisa de histórico" ou "ainda não houve venda hoje". Sem a
> guarda, o dono vê um título com um vazio embaixo — que lê como quebrado.

### `Voltar` · `BarberPoleDivider`

Saída explícita de tela profunda (não depende de histórico, funciona em link
direto e em app instalado), e a listra da identidade.

---

## 4 · Alvo de toque — 44px

> O dono usa no balcão, **em pé**, com o celular numa mão.

Nove controles estavam em 36px, todos ação de linha — "Dar entrada",
"Concluir", "Não veio", "Cancelar", "Devolver". Ninguém decidiu abrir mão da
regra; ela só não estava sendo verificada. Agora está.

Engordar o desenho não é a saída: cinco botões de 44px numa linha de agendamento
tomam a linha inteira. A saída é separar desenho de área:

```tsx
<Button size="sm">Dar entrada</Button>   // 36px de desenho, 44px de área
<button className="alvo-toque ...">      // para controle que não é Button
```

`.alvo-toque` estende a região sensível com um pseudo-elemento e **não pinta
nada**. Se aparecesse, seria decoração.

---

## 5 · Os três estados

Todo componente que mostra dado precisa dos três, e **erro nunca pode parecer
vazio**:

```
carregando   "Carregando as despesas…"                 ainda não sei
vazio        "Nenhuma despesa em agosto"               sei, e não há
erro         "Não foi possível carregar as despesas"   não consegui saber
```

O segundo e o terceiro parecem iguais numa tabela em branco e significam coisas
opostas: um é informação, o outro é ausência dela. No mês em que o dono conclui
"não gastei nada" porque a leitura falhou, o lucro aparece inflado no valor
exato da conta que ele não viu.

---

## 6 · Microcopy dos componentes

- Português **com acentuação**. Sempre.
- Diga a **consequência**, não o estado interno. `ErroAoCarregar` diz *"Pode ser
  a conexão ou uma permissão que mudou. Nada foi perdido"* — as duas causas
  prováveis pedem ações diferentes de quem está lendo, e "erro inesperado" não
  pede nenhuma.
- Ofereça a **saída**, não um retry silencioso. Laço automático esconde perda de
  permissão: a tela fica "quase carregando" para sempre.
- **Nunca afirme o que não aconteceu.**

---

## 7 · O que UX-04 NÃO resolveu — e por quê

Três defeitos medidos que exigem decisão de identidade visual. Pela regra
"Quando parar" do guideline, ficam para o dono.

### 7.1 · `--color-border-strong` não cumpre o papel que o nome promete

```
                  página     cartão     realce
border-strong     3,01:1     2,77:1     2,49:1     ← contorno de controle: 3:1
```

O contorno de campo de formulário foi apontado para `--color-ivory-muted`
(5,93 / 5,45 / 4,90), que já existia — **correção estrutural, sem cor nova**.
Mas o token continua com um nome que diz "divisão que precisa ser vista" e um
valor que não é visto sobre cartão. Ou o valor muda, ou o nome.

### 7.2 · Sombra colorida (`--shadow-gold`)

Anti-pattern declarado no guideline, em uso num lugar fora do meu ownership
(`(cliente)/planos/page.tsx`, no cartão do plano em destaque). Não removi:
apagar o token mudaria silenciosamente a tela de outra equipe.

### 7.3 · `RecursoBloqueado` é a terceira cópia de `EstadoCentral`

`web/src/components/recurso-bloqueado.tsx` repete a mesma composição com as
próprias medidas. O arquivo é de outra frente. A adoção é de uma linha.

### E o que NÃO mudei de propósito

| | por quê |
|---|---|
| `Pill tone="gold"` | nome de cor, não de significado — renomear quebra 4 telas que não são minhas |
| `text-[11px]` no `KpiTile` | fora da escala do Tailwind, mas mudar tamanho de tipo é decisão de identidade |
| gráfico devolvendo `null` | é contrato, não descuido — §3 |
| `.card-elevated` com gradiente | elevação, não decoração; a decisão é anterior e está documentada no CSS |
| telas | não são minhas. Os nove `min-h-9` e os quinze `md:p-6` esperam UX-02/03 |

---

## 8 · UI DECISION REQUIRED

```
UI DECISION REQUIRED

- contexto:     UX-04 mediu, com o navegador como referência, todo par de cor
                que o produto pinta. Três defeitos de contraste eram reais e
                pré-existentes. Dois foram corrigidos sem tocar na paleta:
                a etiqueta passou a ter fundo opaco, e o contorno de campo
                passou a apontar para um token que já existia.

- problema:     `--color-border-strong` (#a1937a) dá 2,77:1 sobre o cartão e
                2,49:1 sobre o realce. Foi criado com o comentário "contorno de
                CONTROLE, que precisa ser perceptível" e não entrega isso em
                nenhuma superfície além da página branca. Hoje sobrou como
                linha-guia do gráfico, onde 3:1 não é exigido — ou seja, o
                token existe com um nome que descreve um papel que ele não
                exerce mais.

- proposta:     (a) escurecer o valor até passar 3:1 no realce; ou
                (b) renomear para o que ele de fato é — divisão decorativa
                    forte — e assumir que contorno de controle é
                    `--color-ivory-muted`.
                Recomendo (b): não cria cor nova e alinha nome e uso.

- impacto:      (a) muda toda linha-guia de gráfico e qualquer uso futuro;
                (b) não muda nenhum pixel — só o nome e a documentação.

- componentes afetados:
                globals.css (definição do token), chart.tsx (linha-guia sob o
                cursor). Nenhuma tela.
```

Decisão relacionada, já tomada e passível de veto: o **anel de foco** trocou
`--color-gold` por `--color-gold-light`, ganhou 2px de `outline` no lugar do
`box-shadow` com brilho, e deixou de forçar `border-radius: 4px` — que
transformava um botão `rounded-xl` em retângulo no instante em que ele recebia
foco. Considerei acessibilidade, não identidade: os dois tokens já existem, e o
guideline manda foco visível e WCAG AA. Se o orquestrador entender que é
identidade, é uma linha em `globals.css`.

---

*UX-04 · 17/08/2026. `tsc` limpo · `eslint --max-warnings=0` limpo · 563 testes
verdes (451 na entrada) · `npm run build` compila.*
