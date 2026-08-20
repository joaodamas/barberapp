# UX BASELINE 1.0 — JP Barber

> **Veredito: UX BASELINE 1.0 — NÃO FECHADA.**
> O que impede o fechamento está na seção 11.

Levantada em 18/08/2026, na branch `hardening/p0-2026-08-17` em `2ed654d`, com
árvore limpa, sem worktrees pendentes e emulador semeado com um cenário "um de
cada": 1 atendimento (R$ 50, Pix), 1 cliente, 1 despesa (R$ 800, aluguel) e 1
venda de 3 pomadas com 1 devolvida.

Toda afirmação abaixo marcada **VERIFICADO** foi observada na tela. Nenhuma foi
inferida do código. Onde só houve leitura de código, está dito.

---

## 0 · Verificação de base (pré-requisito)

```
branch          hardening/p0-2026-08-17
HEAD            2ed654d
git status      limpo (nenhum arquivo modificado ou não rastreado)
git worktree    apenas a árvore principal
```

Nenhuma base atrasada. A auditoria prosseguiu.

⚠️ **Uma exceção descoberta no fim:** existe um `stash@{0}` com 83 linhas —
`analytics.ts` (28) e `densidade.test.ts` (59, arquivo novo). É a correção do
**D31**, que eu reportei como feita. Ela nunca entrou na branch. Ver **A22**.

---

## 1 · VERIFICADO

Observado na interface, com dado real.

| # | O quê | Evidência na tela |
|---|---|---|
| V1 | **Árvore do CMV fecha** | `Pomada modeladora (3 un. × R$ 18,00) R$ 54,00` + `Devolução · Pomada modeladora (1 un. de volta na prateleira) −R$ 18,00` = cabeçalho `R$ 36,00` |
| V2 | **Árvore da receita fecha** | `50,00 + 135,00 − 45,00 = 140,00`, devolução como linha assinada |
| V3 | **Composição soma 100%** | `Serviços 27% + Produtos 73%`, `Devoluções −24%` fora do denominador. O defeito dos 123% está morto |
| V4 | **DRE em linguagem de dono** | h1 e menu dizem "Quanto sobrou" |
| V5 | **Fluxo fecha por método** | `Pix 50,00 + Cartão 130,29 + Dinheiro 0,00 = 180,29`; `Entrou 180,29 − Saiu 845,00 = Sobrou −664,71` |
| V6 | **Concordância no Fluxo** | "1 dia com movimento" |
| V7 | **Livro caixa declara o que não mostra** | "Atendimentos, vendas e mensalidades já entram pelo próprio pagamento e não são lançados aqui" |
| V8 | **Hoje enxugou** | 3 KPIs; "Previsão do dia" aparece uma única vez |
| V9 | **Simulador da Loja não mente mais** | "Comissão do profissional (40% do lucro) R$ 10,80" + "Usa o padrão da casa — quem tem percentual próprio na Equipe recebe o dele". 45 − 18 = 27; 40% = 10,80. O P1-7 está morto |
| V10 | **Devolução declara efeitos** | "Devolução de R$ 90,00 ao cliente · 2 un. de volta no estoque · A comissão dessa parte sai do acerto do barbeiro" + "A venda original continua no histórico — o estorno é um registro novo, não um apagamento" |
| V11 | **Ajustes protege o passado** | "Mudar a taxa não altera o passado… é o que você de fato pagou" e "Marcar falta é sempre uma decisão sua. O sistema… nunca fecha o dia decidindo sozinho quem faltou" |
| V12 | **Projeção declara sua própria incerteza** | "94% desta receita é estimativa… trate como cenário, não como previsão", com pílulas `confirmado` / `estimado` / `fechado` por linha |
| V13 | **Serviços desambigua o próprio número** | "Ticket médio do cardápio… não é o que você fatura por atendimento" |
| V14 | **Erro de coleção aparece como erro** | Com `expenses` ilegível, a tabela diz "Não foi possível carregar os lançamentos… nada foi perdido" — e não "nenhuma despesa" |
| V15 | **Concordância em Clientes e Despesas** | "1 cadastrado", "1 visita", "1 lançamento em Agosto de 2026" |

**D30** (falha de infraestrutura expulsando o dono) foi verificado na sessão
anterior e não foi re-exercitado hoje — o teste de hoje derrubou o Firestore com
sessão anônima, que cai antes do painel. Fica **VERIFICADO na sessão anterior**,
não hoje.

---

## 2 · NÃO VERIFICADO

Ausência de evidência. Nada aqui passou.

| # | O quê | Por quê |
|---|---|---|
| N1 | **Toda a experiência móvel** | Ambiente incapaz. Ver seção 7 |
| N2 | **Alvo de toque ≥ 44px** | Depende de viewport móvel real |
| N3 | **`prefers-reduced-motion`, foco visível, ordem de tabulação** | Não exercitados nesta sessão |
| N4 | **Contraste WCAG AA medido** | Existe teste de tokens (`contraste-de-tokens.test.ts`); não medi na tela renderizada |
| N5 | **Qualquer tela com volume** | Tudo foi visto em "um de cada". Nenhuma lista longa, nenhuma paginação, nenhum mês cheio. A densidade real do produto em uso é desconhecida |
| N6 | **Agenda / Marcar atendimento** | Não aberta |
| N7 | **Área do cliente** (`/agendar`, `/reservas`, `/planos`, `/perfil`) | Não abertas com sessão de cliente |
| N8 | **Fluxos de escrita** | Nenhuma escrita foi executada. Não devolvi a venda, não contratei mensalista, não lancei despesa. Os modais foram abertos e cancelados |
| N9 | **D31** | Não pôde ser verificado: a correção não está na branch (**A22**) |
| N10 | **Estado de carregamento** | Não consegui congelar o intervalo para observar esqueleto vs. spinner |

---

## 3 · DEFEITOS OBJETIVOS

Ordenados por dano. Todos com evidência de tela ou de código citada.

### Bloco 1 — o sistema afirma número que não é fato

**A1 · O DRE apresenta lucro onde há prejuízo, quando não consegue ler as despesas.**
Com `expenses` ilegível: banner de erro no topo **e**, abaixo dele, o resultado
completo — `RESULTADO DO MÊS R$ 30,39`. Com a mesma base legível, no mesmo
minuto: **−R$ 769,61**. Diferença exata: R$ 800,00. O KPI `CUSTO FIXO TOTAL
R$ 0,00` traz a legenda "aluguel, contas e o que não varia com o movimento" —
nomeando justamente o fato que não pôde ser lido. O simulador de crescimento
abaixo projeta a partir desse custo fixo zero. O banner é uma tarja; o número é
o maior elemento da tela.

**A2 · A tela de Despesas afirma zero quando não conseguiu ler.**
Mesma falha: cabeçalho "0 lançamentos em Agosto de 2026", KPIs `0`, `R$ 0,00`,
`R$ 0,00`, `—`, rodapé `TOTAL DO MÊS R$ 0,00` — ao redor da mensagem de erro. O
D27 não fechou: a mensagem foi acrescentada ao corpo da tabela e os agregados
continuaram mentindo, em corpo maior.

**A3 · O login exibe a marca errada quando o tenant não resolve.**
`osiqueira.lvh.me/agendar` com Firestore fora → **"CorteHub"** e o logo da
plataforma. Com Firestore no ar, mesma URL → **"O Siqueira Barbearia"**. Nada
mais mudou. É uma tela que pede senha exibindo o nome de outra empresa. O
`(cliente)/layout.tsx` e o login chamam `getTenant()` direto; o
`resolverTenant()` do D30 só foi ligado no layout do painel.

**A13 · Números afirma um padrão de retorno que não existe.**
"Cliente Único · 1 visita · última há 0d (costuma voltar a cada 0d)" + pílula
"Em dia". Com uma visita não há intervalo a calcular. "há 0d" também deveria ser
"hoje".

**A14 · Números afirma uma queda que não houve.**
"A taxa de falta caiu de 0% para 0% — 0 faltas e 0 cancelamentos tardios em 1
agendamento." 0 → 0 não é queda.

**A15 · Números afirma uma causa sem nenhum fato por trás.**
"A confirmação por WhatsApp no dia continua sendo o maior fator de redução." O
sistema não mediu isso. É frase fixa apresentada como leitura dos números do
dono.

**A16 · Números recomenda a partir de um empate.**
"Seg às 09:00 é a maior brecha (0%) — bom alvo para promoção." São 107 células
empatadas em 0%; "Seg 09:00" é a primeira da ordem, não a maior brecha.

**A17 · Ocupação apaga o único atendimento do mês.**
Números mostra `OCUPAÇÃO 0%` no mês em que houve 1 atendimento — e o mapa de
calor logo abaixo diz "100% de ocupação" naquele horário. Hoje mostra 3%.

### Bloco 2 — o mesmo nome, números diferentes

**A4 · "Ticket médio" tem três definições no produto.**

| Tela | Valor | Fonte |
|---|---|---|
| Serviços | R$ 47,50 | média simples do cardápio — *e a tela diz isso* |
| Números | R$ 50,00 | `analytics.ts:804` — `receitaDeServico ÷ atendimentos` |
| Fluxo de caixa | R$ 180,29 | `fluxo-caixa/page.tsx:200` — `safeDiv(d.total, d.appointments)`: caixa líquido de **todas** as origens ÷ atendimentos **só de serviço** |

Mesma barbearia, mesmo dia, mesmos dados. Só a tela de Serviços legenda o seu.
O motor já tem `avgTicketComProduto` (`analytics.ts:805`) e o Fluxo não o usa.

**A5 · A Projeção confirma com uma grandeza e estima com outra, na mesma coluna.**
`Ter 18 · R$ 50,00 · confirmado` é `booking.value` (bruto, serviço).
`Ter 25 · R$ 180,00 · estimado` é `media(dow)` sobre `DiaDeCaixa.total`
(`analytics.ts:1006`) — líquido, todas as origens. O dono lê que a terça de hoje
rendeu R$ 50 e que a terça que vem renderá R$ 180, sem nada explicando o salto
de 3,6×.

**A7 · "Caixa de hoje" ignora venda de produto.**
Na tela Hoje: `Pix R$ 50,00 · Cartão R$ 0,00 · Dinheiro R$ 0,00`, no mesmo dia em
que entraram R$ 130,29 no cartão. `caixaDoDia(bookings)` (`analytics.ts:1096`)
recebe **apenas reservas**. Está documentado como desenho em
`seis-visoes.test.ts`, mas o bloco na tela se chama "CAIXA DE HOJE" e o dono
confere caixa contra a gaveta.

**A19 · O atalho promete o oposto do destino.** (D33)
Financeiro: "Fluxo de caixa · *histórico diário completo* · **R$ 180,29**".
Destino: "SOBROU NO CAIXA **−R$ 664,71**". O atalho mostra só a perna de entrada
com a legenda "completo".

**A20 · Duas tabelas de taxa, e a da tela financeira não é a que o sistema usa.** (D32)
Financeiro mostra "Crédito à vista **3.15%**" (`business-rules.ts:220`, tabela
Stone/InfinitePay da plataforma). Ajustes mostra a taxa da barbearia:
**3,49%** — que é a efetivamente aplicada ao pagamento do mês.

### Bloco 3 — contradição interna na mesma tela

**A6 · O simulador de crescimento discorda de si mesmo com variação zero.**
Com o slider em 0%: `Resultado do Mês` atual **−R$ 769,61**, cenário
**−R$ 761,00**, `DIFERENÇA` **+R$ 8,61**. Duas causas somam exatamente isso:

- `dre/page.tsx:103` — `scenario.result` não desconta imposto (R$ 8,40), mas a
  linha se chama "Resultado do Mês" e é comparada contra o resultado com imposto;
- `Math.round` em reais em vez de centavos (R$ 0,21).

E `dre/page.tsx:681` — `isZero = Math.abs(diff) < 0.5` mostra "—" nas linhas de
Custo Variável e Margem, que divergem em R$ 0,21. A coluna DIFERENÇA omite
diferenças reais de dinheiro.

**A9 · Ponto de equilíbrio: o texto diz uma coisa, a cor diz o contrário.**
"Ponto de equilíbrio não atingido no mês" + pílula "no vermelho", sobre uma
**barra verde cheia de ponta a ponta**. Contraria `UI-UX-GUIDELINES` §3 —
"verde e vermelho só para resultado financeiro e estado" e "nenhum elemento
depende só de cor".

**A8 · Mensalistas afirma que os planos não estão cadastrados — e o modal ao lado oferece os dois.**
Empty state (`mensal/page.tsx:177`, texto fixo): *"Para contratar o primeiro,
seus planos precisam estar cadastrados; fale com quem cuida da sua conta na
plataforma."* O botão "Novo mensalista", na mesma tela, abre um modal com
"2 cortes R$ 99,00/mês" e "Ilimitado R$ 149,00/mês" e conclui a contratação.
`gerir-mensalistas.tsx:375` faz a guarda correta (`planosAtivos.length === 0`);
o empty state não faz guarda nenhuma. A correção da porta falsa trocou uma porta
que não abre por uma afirmação falsa.

### Bloco 4 — contrato de escrita violado

**A10 · Separador decimal em ponto.**
`27.7%` no DRE (`dre/page.tsx:359` e `:434`, `toFixed(1)`); `0.99% · 1.99% ·
3.15% · 8.5%` no Financeiro. Não existe formatador de percentual em `format.ts`.
E "8.5%" tem uma casa entre vizinhos de duas.

**A11 · "1 un. já voltaram".**
`desfazer-venda.tsx:186`, verificado na tela. A `UI-UX-GUIDELINES` §9 usa
exatamente este par como exemplo: *"1 un. voltou", "2 un. voltaram"*. A função
`plural()` existe e não foi usada.

**A12 · "1 de 3 devolvida".**
`estornos.ts:133` pluraliza pela **parte**. O `plural.ts` tem `contarDeTotal()`
criada justamente porque *"o substantivo concorda com o TOTAL, não com a parte"*.
O defeito está dentro do arquivo escrito pela mesma equipe que escreveu a regra.

**A18 · A página 404 é preta e em inglês.**
"404 · This page could not be found.", fundo preto, texto branco, sem marca, sem
navegação, sem saída. É o 404 padrão do Next.js, nunca substituído. Contraria
duas cláusulas do contrato ao mesmo tempo: light-only e português.
*(Cheguei nela por URL minha errada — o menu está correto. O defeito é a página,
não o link.)*

**A21 · "+0 novos · −0 cancelamentos".** (D34)
Zero com sinal, apresentado como crescimento.

**A23 · A previsão do dia não desconta a falta confirmada.**
Documentado como `ERRO` em `seis-visoes.test.ts:132`: `no_show` está em
`OCCUPIES_SLOT` (corretamente — a cadeira foi ocupada), mas `previsaoDoDia`
soma os mesmos agendados. Depois de o dono marcar "não veio", os R$ 50
continuam na previsão e a barra mostra 0% de um valor que já se sabe que não
virá. Não exercitado na tela nesta sessão — o teste é a evidência.

### Bloco 5 — processo

**A22 · A correção do D31 não está na branch.**
`stash@{0}` contém `analytics.ts` (+28) com o campo `naoInformado` em
`caixaDoDia` e `densidade.test.ts` (+59, arquivo novo). A branch em `2ed654d`
tem a versão **sem** a correção — conferido em `analytics.ts:1096`.

Três coisas a registrar:

1. **Eu reportei o D31 como corrigido. Estava errado.** Foi escrito e nunca
   integrado. É a regra 19 aplicada a mim: escrever não é integrar.
2. `analytics.ts` era **arquivo bloqueado** para a DENSITY-01. A mudança existe,
   fora da branch, invisível para quem lê o histórico.
3. 59 linhas de teste também estão fora.

Recuperação, quando for decidido: `git stash show -p stash@{0}` para inspecionar,
`git stash pop` para aplicar. **Não apliquei** — está fora do escopo desta fase.

---

## 4 · INCONSISTÊNCIAS TRANSVERSAIS

O padrão por trás dos defeitos, que é mais importante que qualquer um deles.

**1. O produto tem duas grandezas com o mesmo nome e não decidiu qual vale.**
"Receita de serviço" e "caixa líquido de todas as origens" aparecem sob os
rótulos "ticket médio" (A4), "receita" (A5) e "caixa" (A7). Não é um bug em três
lugares: é uma **definição não tomada**, que cada tela resolveu do seu jeito.

**2. Estado de erro convive com agregado que afirma zero.**
Onde o erro foi tratado (A1, A2), ele foi acrescentado *ao lado* dos números, não
*no lugar* deles. O contrato §7 diz "erro nunca pode parecer vazio" — mas o
problema hoje não é o erro parecer vazio: é o **resto da tela** parecer completo.
Falta a regra complementar: **um total cuja fonte falhou não pode ser exibido.**

**3. A regra existe, está escrita, e três lugares não a usam.**
`plural.ts` foi criada para acabar com o ternário inline e o `(s)`. `A11` e `A12`
são ternários inline escritos depois dela — um deles no mesmo arquivo da equipe
que a criou. Regra que depende de alguém lembrar volta.

**4. Ponto e vírgula decimais convivem.**
Dinheiro usa vírgula (`formatBRL`), percentual usa ponto (`toFixed`). Não há
formatador de percentual.

**5. Toda a área do cliente exige conta, inclusive ver preço.**
Isso é decisão, não defeito (seção 5) — mas atravessa o produto e precisa ser
dita, porque muda o que "vitrine" significa nos próximos relatórios.

---

## 5 · DECISÕES DE PRODUTO

Não implementadas. São suas, não minhas.

| # | Questão | O que existe hoje |
|---|---|---|
| P1 | **Não existe vitrine pública** | Todo o `(cliente)` está atrás do `AuthGuard`, inclusive `/agendar`. Um cliente com o link da barbearia vê uma tela de login. Ninguém vê preço, serviço ou horário sem criar conta |
| P2 | **Não existe tela que cadastre plano** | `plans` só é escrita por script. Registrado como STOP em `VOCABULARIO.md`. Enquanto isso, A8 |
| P3 | **Mapa de calor 6 × 18** | 108 células para exibir 1 atendimento. Qual pergunta ele responde numa barbearia que está começando? |
| P4 | **Régua de cobrança** | 7 círculos vazios, sem legenda, sem dado |
| P5 | **Bloco Comercial** | 4 KPIs zerados quando não há mensalista |
| P6 | **Loja lista o mesmo produto duas vezes** | Bloco "VENDER" e bloco "PRODUTOS", ações diferentes. Pode ser deliberado |
| P7 | **`MARGEM −550%`** como KPI de topo | Correto (−769,61 ÷ 140). A pergunta é se merece um dos quatro cards |
| P8 | **Projeção parte de saldo zero** | A coluna se chama "SALDO ACUMULADO" mas é um delta. Existe `saldoDeCaixa` desde o D25 e a tela não o usa |
| P9 | **Login informa se o e-mail existe** | "Não encontramos uma conta com esse e-mail" permite enumerar contas |
| P10 | **Sessão perdida é silenciosa** | `auth-guard.tsx` faz spinner → `/login`, sem dizer que a sessão caiu. O gatilho que observei hoje foi **ambiental** (ver seção 8), mas o tratamento é do produto |
| P11 | **Estado de carregamento é spinner** | `auth-guard.tsx` renderiza um círculo girando em tela vazia. O contrato §7 pede "esqueleto com a forma do conteúdo, não spinner" |

---

## 6 · QUESTÕES DE IDENTIDADE JP BARBER

**Onde já existe linguagem própria — e é forte:**

A assinatura do JP Barber hoje **é a escrita**. Nenhum SaaS genérico escreve
assim:

> "Quanto sobrou" · "Sobrou no caixa" · "1 un. de volta na prateleira" ·
> "trate como cenário, não como previsão" · "nunca fecha o dia decidindo sozinho
> quem faltou" · "é o que você de fato pagou" · "A venda original continua no
> histórico — o estorno é um registro novo, não um apagamento"

Some o logo e deixe só o texto: reconhece-se. Isso é identidade real, e é a
coisa mais valiosa que o produto tem hoje. Junto dela:

- as árvores de detalhamento com dedução assinada (V1, V2);
- os blocos que declaram o que **não** estão mostrando (V7, V12, V13);
- a paleta quente com número em `font-display`.

**Onde ainda é genérico:**

- **A grade de KPIs.** Cinco cards iguais, ícone + rótulo em caps + número
  grande. É o layout de qualquer dashboard de qualquer SaaS. Aparece em Hoje,
  Financeiro, DRE, Números, Despesas, Mensalistas e Projeção — sete telas com a
  mesma abertura.
- **As tabelas.** Zebra padrão, sem ritmo tipográfico próprio.
- **O mapa de calor.** Componente de mercado.
- **O 404.** Preto, em inglês, sem marca nenhuma.
- **O spinner do `AuthGuard`.** O único momento em que o produto deixa de ser o
  produto.

**Leitura honesta:** *a identidade do JP Barber está na voz, não na composição.*
Tapando o logo e lendo o texto, reconhece-se; tapando o texto e olhando o
layout, não. A recomendação da §10.6 do contrato — "a identidade se reforça, não
se inventa" — se aplica exatamente aqui: o que falta não é cor nova, é a
composição alcançar o nível que a escrita já tem.

E, conforme o próprio contrato: **quem decide se ficou com cara de JP Barber é
você, olhando a tela.** Este relatório aponta onde olhar.

---

## 7 · MOBILE

**NÃO VERIFICADO — e o ambiente é incapaz, com medição que prova.**

```
resize_window(390, 844)  →  "Successfully resized window"
window.innerWidth        →  1920
window.outerWidth        →  0
matchMedia('(min-width: 768px)').matches  →  true
```

A ferramenta relata sucesso e o viewport não muda. Todo breakpoint `md:` continua
ativo. Nada do que é específico de celular — `bottom-nav`, `ClienteBottomNav`,
`shortLabel`, alvo de toque, `safe-top` — foi exercitado.

Consequência direta: **a tela que o dono mais usa é a que menos foi verificada.**
O contrato diz "o dono usa no balcão, em pé, com o celular na mão", e esta
baseline não tem uma única evidência móvel.

Isso exige aparelho real ou um runner com emulação de device. Não é contornável
por aproximação, e apresentar medição de desktop como evidência de mobile seria
exatamente o que a regra 19 proíbe.

---

## 8 · ESTADOS DE ERRO

Os três buckets, separados como pedido.

### 8.1 · Erro da coleção — **EXERCITADO**

Método: `firestore.rules` alterada para `allow read: if false` só em `expenses`,
tela recarregada, regra restaurada e conferida byte a byte contra o backup.

| Tela | Comportamento |
|---|---|
| Despesas | ✅ tabela diz "Não foi possível carregar os lançamentos… nada foi perdido" · ❌ cabeçalho e 4 KPIs afirmam zero (**A2**) |
| Quanto sobrou (DRE) | ✅ banner "Não foi possível carregar o resultado do mês" · ❌ **resultado completo abaixo, com lucro de R$ 30,39 onde há prejuízo de R$ 769,61** (**A1**) |

**Conclusão: o D27 não está fechado.** A mensagem existe; ela não impede o resto
da tela de afirmar o contrário.

### 8.2 · Erro da resolução do tenant — **EXERCITADO**

| Superfície | Comportamento |
|---|---|
| Painel do dono | ✅ **VERIFICADO na sessão anterior** — mostra erro e não expulsa (D30 corrigido) |
| Login / área do cliente | ❌ **exibe "CorteHub" e o logo da plataforma** no lugar de "O Siqueira Barbearia" (**A3**) |

O D30 foi corrigido no layout do painel. As demais superfícies continuam com o
`getTenant()` que devolve o tenant padrão em silêncio.

### 8.3 · Vitrine pública — **NÃO EXISTE**

Não é limitação de teste. Verificado com sessão anônima: `osiqueira.lvh.me/` →
`/login`; `/agendar` → `/login`. O `(cliente)/layout.tsx` envolve tudo em
`AuthGuard`. **Não há superfície pública para testar.** Registrado como decisão
de produto P1.

### 8.4 · Limitação de ambiente registrada

Duas quedas de sessão durante a auditoria, ambas logo após eu reiniciar o
emulador com o dev server já rodando. Console:
`FirebaseError: Firebase: Error (auth/emulator-config-failed)`.

**É artefato do ambiente, não defeito do produto.** Testei a hipótese
concorrente (404 derruba a sessão) de forma isolada e ela é **falsa** — naveguei
para uma rota inexistente e voltei ao painel com a sessão intacta. O que
permanece do produto é P11/P10: o tratamento silencioso de qualquer queda de
sessão.

---

## 9 · DENSIDADE / HIERARQUIA

Aplicando a régua: *"qual pergunta do dono esse elemento responde?"*

**Remoções óbvias — duplicação literal ou violação de regra já estabelecida:**

Nenhuma nova encontrada. As três que a DENSITY-01 já removeu se sustentam (V8).

**Tudo o mais é decisão de produto** e está na seção 5 (P3–P8). Nenhuma foi
implementada.

**A observação estrutural, que vale mais que qualquer card:**

Sete telas abrem com a mesma grade de KPIs. O contrato diz *"a interface não deve
mostrar tudo que o sistema sabe; deve mostrar o que o dono precisa decidir"* — e
o padrão atual mostra **o mesmo formato** independentemente da decisão em jogo.
Hoje (operação, em pé) e Quanto sobrou (análise, sentado) abrem igual.

Isso não se resolve removendo cards. Resolve-se decidindo, por tela, qual é **a**
pergunta — e é trabalho de UX POLISH, não desta baseline.

**Um alerta contra a remoção fácil:** com o cenário "um de cada", quase tudo
parece excessivo porque quase tudo está zerado. A régua avisa que informação
nascida da Rodada 3.2 deve ser presumida necessária. **Não temos evidência de
densidade real** (N5). Decidir densidade olhando uma barbearia com 1 atendimento
seria decidir pelo caso menos representativo que existe.

---

## 10 · RECOMENDAÇÃO DE PRÓXIMA FASE

Na ordem, e sem sobreposição:

**1. Corrigir os defeitos que fazem o sistema afirmar valor falso.**
A1, A2, A3 primeiro — os três em que a tela apresenta número errado como certo.
A1 é o mais grave do produto inteiro: um dono decide com base em "sobrou
R$ 30,39" num mês em que faltaram R$ 769,61.

A regra que resolve os três de uma vez: **um total cuja fonte falhou não é
exibido.** Não é acrescentar mensagem — é suprimir o número.

**2. Decidir a definição única de receita/caixa e propagá-la.**
A4, A5, A7, A19 são sintomas de uma definição não tomada. Corrigir tela por tela
recria o problema na próxima. É decisão sua, e é pré-requisito de qualquer
polimento.

**3. Resolver o `stash@{0}` (A22).**
Antes de qualquer coisa nova, decidir se o D31 entra. Enquanto estiver lá, o
histórico não descreve o produto.

**4. Varredura de escrita e formatação.**
A10, A11, A12, A13, A14, A15, A16, A18, A21. São baratas, todas em texto, e
todas contrariam contrato já escrito. Fazer de uma vez, com teste que impeça o
retorno — como o `plural.ts` tentou fazer e não conseguiu sozinho.

**5. Mobile real.**
Aparelho ou runner com emulação. Sem isso, a experiência principal do produto
segue sem baseline.

**6. Só então: revisão humana da identidade → UX POLISH 1.0.**
Como você definiu. A baseline agora diz onde olhar: a voz está pronta, a
composição não.

**Não recomendo** abrir agente novo agora. Os defeitos desta baseline são
específicos e localizados; o que falta é decisão de produto (item 2) e execução
enxuta (itens 1 e 4).

---

## 11 · VEREDITO

# UX BASELINE 1.0: NÃO FECHADA

**O que impede o fechamento, exatamente:**

1. **A1 — o DRE apresenta lucro onde há prejuízo quando não lê as despesas.**
   Diferença medida de R$ 800,00 entre o que a tela afirma e o que é. Nenhuma
   baseline pode ser fechada com um caminho conhecido em que o produto declara
   resultado invertido.

2. **A2 e A3 — o mesmo padrão em outras duas superfícies.** Despesas afirmando
   zero e o login exibindo a marca de outra empresa numa tela que pede senha.

3. **A4/A5/A7 — "ticket médio", "receita" e "caixa" não têm definição única.**
   Uma baseline registra o estado de referência; não é possível registrar
   referência de um número que muda de significado conforme a tela.

4. **A22 — a branch não contém uma correção que eu havia reportado como feita.**
   Enquanto houver trabalho em stash tocando arquivo bloqueado, a base auditada
   não é a base real, e a baseline não descreve o produto.

5. **Mobile inteiramente não verificado (seção 7)**, por incapacidade do
   ambiente comprovada por medição. É a superfície mais usada pelo dono. Uma
   baseline de UX sem nenhuma evidência móvel não é uma baseline.

**O que NÃO impede o fechamento** e está registrado para decisão sua, sem ação:
todas as seções 5 (P1–P11) e os itens de densidade da seção 9.

**O que já está fechado e não precisa ser revisitado:** os 15 itens da seção 1 —
em especial o CMV, a composição da receita e o simulador da Loja, que eram os
três defeitos que originaram esta linha de trabalho.
