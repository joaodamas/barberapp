# UX-AUDIT-FINAL — a fotografia do produto

> 18/08/2026 · branch `hardening/p0-2026-08-17` em `2ed654d`
> **Nenhuma linha de código alterada. Nenhum commit. Nenhum agent.**

## Como esta auditoria foi feita — e por que ela é diferente das anteriores

A base foi **zerada** e **os 10 fatos financeiros deste relatório nasceram pela
interface**, um a um, clicando como o dono clica. Nada foi semeado por script.

```
1  marcar atendimento no balcão      6  contratar mensalista
2  concluir com meio de pagamento    7  emitir mensalidades do mês
3  dar entrada de estoque            8  registrar pagamento da mensalidade
4  vender 3 produtos                 9  lançar despesa
5  devolver 1 unidade               10  registrar sangria no livro caixa
```

Isso fecha a lacuna **N8** do gate. As setas *"executar uma tarefa → entender o
resultado"* passam a ter evidência, e três achados P0 deste relatório **só
existem porque as escritas foram executadas** — nenhuma auditoria de leitura os
encontraria.

**N7 (área do cliente) continua sem evidência.**

---

# MAPA DE COBERTURA

| # | Seta | Estado |
|---|---|---|
| 1 | Cliente → agendamento → atendimento → pagamento → **histórico do cliente** | ⚠️ até o pagamento ✅; **histórico ❌ — não existe tela** |
| 2 | Produto → estoque → compra → venda → pagamento → CMV → comissão → resultado | ✅ **comprovado ponta a ponta** |
| 3 | Cliente → plano → assinatura → emissão → pagamento → receita realizada | ❌ **quebrado** — F1 e F2 |
| 4 | Venda/mensalidade → PaymentDoc → receita → taxas → imposto → resultado | ✅ comprovado, com aritmética conferida |
| 5 | Compra → entrada → **custo médio** → venda → CMV → devolução → ajuste | ✅ **comprovado, incluindo o custo médio** |
| 6 | Pagamento/compra/despesa/sangria → cash_entries → Fluxo de Caixa | ✅ comprovado |
| 7 | Fato original → pagamento → estorno (original intacto, leituras corretas) | ✅ **comprovado** |
| 8 | Menu → área → título → pergunta → ação → resultado | ⚠️ parcial |
| 9 | Estados: carregando · vazio · erro · sucesso · sem histórico · dados parciais | ⚠️ vazio e erro ✅; **sucesso inconsistente**; carregando ⏳ |
| 10 | Identidade visual | ⚠️ voz própria; composição genérica |
| 11 | Mobile | ⏳ **NÃO VERIFICADO** — ambiente incapaz, com medição |

---

# OS ACHADOS

Formato conforme pedido. IDs `F` = achados desta fase.

---

## F1 · A comissão de serviço é 0% enquanto três telas prometem 40%

| | |
|---|---|
| **Fluxo** | 1 · Atendimento → pagamento → resultado |
| **Origem** | `web/src/lib/tenant.ts:308` × `functions/src/financial-events.ts` |
| **Comportamento atual** | O front preenche `commissionSplit` com o **padrão da plataforma (40%)** quando a barbearia não tem o campo. O servidor lê o mesmo campo direto do documento, com `\|\| 0`. **`provisioning.ts` e `signup.ts` não gravam `policies`** — nenhuma barbearia nasce com ele |
| **Comportamento esperado** | Uma fonte só. O que a tela promete é o que o acerto paga |
| **Impacto** | **P0.** Concluí dois atendimentos de R$ 50,00 pela interface. Os documentos gravados: `commissionPct: "0"`, `commissionAmount: "0"`. O DRE mostra R$ 100,00 de serviço e **R$ 0,00** de comissão. A tela de Equipe, no mesmo minuto, diz *"Em branco usa o padrão da barbearia (40%)"* |
| **Classificação** | **ÓBVIO** — as duas leituras contradizem uma à outra |
| **Evidência** | Tela de Equipe: campo vazio, texto "(40%)". Documento: `comissao_X5QM… {commissionPct:"0", commissionBase:"50", commissionAmount:"0"}` |
| **Agravante** | **Nenhuma tela grava `commissionSplit`.** Três telas o leem (`equipe`, `loja`, `analytics`) e nenhuma o escreve. O dono não tem como corrigir |
| **Correção necessária** | Decidir a fonte única e propagá-la; e criar o campo que define o padrão da casa. Não implementada |

> É o achado mais grave da série inteira, e **nenhuma auditoria de leitura o
> encontraria**: ele só aparece quando um atendimento é concluído de verdade.

---

## F2 · Não existe forma de registrar um atendimento coberto pelo plano

| | |
|---|---|
| **Fluxo** | 3 · Mensalista |
| **Origem** | `functions/src/booking.ts` (sem noção de assinatura) · `(cliente)/agendar` · modal "Como o cliente pagou?" |
| **Comportamento atual** | Contratei o plano **Ilimitado (R$ 149,00/mês)** para o Marcos e registrei o pagamento. Em seguida marquei um corte para ele. A tela ofereceu **"Corte R$ 50,00"**, o resumo confirmou **R$ 50,00**, e ao concluir o produto perguntou **"Como o cliente pagou? Marcos Avulso · R$ 50,00"** — com quatro opções de meio de pagamento e **nenhuma opção "coberto pelo plano"** |
| **Comportamento esperado** | O produto reconhece que o serviço está coberto e registra o atendimento **sem** criar receita nova |
| **Impacto** | **P0.** O dono só tem dois caminhos, e os dois corrompem o resultado em direções opostas: **cobrar de novo** (receita e comissão fantasmas) ou **não concluir o atendimento** (perde o registro operacional, a agenda nunca fecha). No DRE resultante: `Serviços avulsos R$ 100,00` **e** `Mensalidades recebidas R$ 149,00` — do mesmo cliente, no mesmo dia |
| **Classificação** | **DE JULGAMENTO** — é decisão de modelo. Ver C.1 |
| **Evidência** | DRE: `Receita realizada R$ 339,00` com as duas linhas. Clientes: `Marcos Avulso [Ilimitado] · 2 visitas` |
| **Correção necessária** | Decisão sua (C.1). Não implementada |

**O detalhe que torna isto pior:** a tela de **Clientes exibe o selo "Ilimitado"**
ao lado do nome. **O dado existe e é exibido.** Ele simplesmente não é consultado
no único lugar onde evitaria o erro — a tela onde o dinheiro é decidido.

*(É o D18 do backlog, agora com evidência de tela e uma formulação mais precisa:
o problema não é uma soma automática errada, é a **ausência de representação**
para um fato que o negócio tem.)*

---

## F3 · O DRE afirma que o sistema não cobra mensalidade — três linhas acima de cobrá-la

| | |
|---|---|
| **Fluxo** | 3 e 4 |
| **Origem** | bloco "Receita contratada" em `financeiro/dre/page.tsx` |
| **Comportamento atual** | O bloco diz, literalmente: *"Mensalidades de planos ativos. **Não entra** no resultado nem no imposto acima: **o sistema ainda não cobra mensalidade, então não tem como saber se ela foi paga.** Quando a cobrança existir, o valor recebido passa a compor a receita."* Três linhas abaixo, dentro de "Receita realizada": **`Mensalidades recebidas R$ 149,00`** |
| **Comportamento esperado** | O texto descreve o que o produto faz hoje |
| **Impacto** | **P0.** Três afirmações falsas numa frase: que o sistema não cobra (cobra — emiti a fatura e registrei o pagamento pela interface), que não sabe se foi paga (sabe — a fatura está "Paga · Pix"), e que a mensalidade não entra no resultado (entra, e está visível logo abaixo). É texto que sobreviveu à funcionalidade que ele descrevia |
| **Classificação** | **ÓBVIO** |
| **Evidência** | Captura do DRE com o bloco e a linha na mesma tela |
| **Correção necessária** | Reescrever o bloco para "receita contratada × recebida" — que é a distinção real e útil. Não implementada |

---

## F4 · Três padrões de feedback diferentes para dez escritas

| | |
|---|---|
| **Fluxo** | 9 · Estados / feedback após ação |
| **Comportamento atual** | Executei 10 escritas e recebi 3 tratamentos: **(a)** modal de sucesso completo — agendamento: *"Atendimento marcado · ✓ · Marcos Avulso · Corte · O pagamento é registrado quando você concluir o atendimento"* com dois próximos passos; **(b)** faixa inline — venda: *"Venda de R$ 135,00 registrada. O estoque já foi baixado."*; **(c)** **nada** — entrada de estoque, contratar mensalista, emitir faturas, registrar pagamento, lançar despesa, sangria: o modal fecha e a lista muda |
| **Comportamento esperado** | Um padrão. A ação mais consequente não pode ser a mais silenciosa |
| **Impacto** | **P1.** "Registrar pagamento de mensalidade" move R$ 149,00 para a receita do mês e não diz nada. "Marcar atendimento", que ainda não move dinheiro nenhum, abre um modal |
| **Classificação** | **DE JULGAMENTO** para o padrão; **ÓBVIO** que hoje é inconsistente |
| **Evidência** | As 10 escritas capturadas |
| **Correção necessária** | UX-04 define um padrão único de confirmação. Não implementada |

**Detalhe:** a faixa "Venda de R$ 135,00 registrada" **continuou na tela** depois
da devolução, ao lado de "Devolvido R$ 45,00". Duas confirmações empilhadas, a
primeira já vencida.

---

## F5 · "Caixa de hoje" e "Fluxo de caixa" usam os mesmos três rótulos para números diferentes

| | |
|---|---|
| **Fluxo** | 6 · Caixa |
| **Origem** | `analytics.ts:1096` (`caixaDoDia`, só reservas, **bruto**) × `fluxo-de-caixa.ts` (todas as origens, **líquido**) |
| **Comportamento atual** | Mesmo dia, mesmos fatos: **Hoje** → `Pix R$ 0,00 · Cartão R$ 50,00 · Dinheiro R$ 50,00`. **Fluxo** → `Pix R$ 149,00 · Cartão R$ 178,54 · Dinheiro R$ 50,00` |
| **Comportamento esperado** | Ou o mesmo número, ou nomes diferentes |
| **Impacto** | **P0.** É o número que o dono confere contra a gaveta. O Hoje omite R$ 149,00 de mensalidade e R$ 130,29 de produto, e mostra o cartão **pelo bruto** (R$ 50,00 em vez de R$ 48,25) |
| **Classificação** | **DE JULGAMENTO** — depende da definição de "caixa" (C.1) |
| **Evidência** | As duas telas, mesmo minuto |
| **Correção necessária** | Decisão C.1 e propagação. Não implementada |

---

## F6 · "Ticket médio" agora mostra R$ 188,77 para atendimentos de R$ 50,00

| | |
|---|---|
| **Fluxo** | 4 e 8 |
| **Origem** | `fluxo-caixa/page.tsx:200` — `safeDiv(d.total, d.appointments)` |
| **Comportamento atual** | Tabela do Fluxo: `Ter 18 · 2 atendimentos · Ticket médio R$ 188,77`. O numerador é o caixa líquido de **todas** as origens (R$ 377,54, incluindo mensalidade e produto); o denominador conta **só serviço** |
| **Comportamento esperado** | Numerador e denominador da mesma população |
| **Impacto** | **P1.** O ticket real de serviço é R$ 50,00. Números mostra R$ 50,00. Serviços mostra R$ 47,50 (do cardápio, **com legenda**). Três telas, três valores, um nome |
| **Classificação** | **DE JULGAMENTO** (C.1) |
| **Evidência** | Tabela do Fluxo capturada |

---

## F7 · A ficha do cliente é calculada e nenhuma tela a abre

| | |
|---|---|
| **Fluxo** | 1 · última seta — "→ histórico do cliente" |
| **Origem** | `lib/ficha-do-cliente.ts` |
| **Comportamento atual** | `fichaDoCliente()` monta uma ficha completa por cliente — visitas, ticket médio, cadência, gasto. **Só `listaDeClientes` a consome**, para desenhar o card da lista. Clicar no cliente não abre nada |
| **Comportamento esperado** | O dono abre o cliente e vê o histórico dele |
| **Impacto** | **P1.** A seta que o UX-AUDIT existe para testar **termina no card**. O dono vê "2 visitas" e não consegue ver quais |
| **Classificação** | **DE JULGAMENTO** — é funcionalidade ausente, não defeito |
| **Evidência** | Clique na linha do cliente não produz navegação; grep confirma consumidor único |

---

## F8 · A despesa grava um meio de pagamento que o dono não escolheu

| | |
|---|---|
| **Fluxo** | 6 |
| **Comportamento atual** | O modal "Nova despesa" abre com `Forma de pagamento: **Pix**` pré-selecionado. Salvei sem tocar no campo e a tabela registrou "Pix" |
| **Comportamento esperado** | Fato financeiro não nasce de um default silencioso — é a mesma regra que tornou `paymentMethod` obrigatório na conclusão do atendimento |
| **Impacto** | **P2.** Contamina o Fluxo por método |
| **Classificação** | **ÓBVIO** — contraria regra já estabelecida no produto |
| **Correção necessária** | Sem seleção padrão, como em "Como o cliente pagou?". Não implementada |

---

## F9 · A régua de cobrança diz "D+5" para uma fatura de 13 dias

| | |
|---|---|
| **Fluxo** | 3 |
| **Comportamento atual** | Fatura vencida em 05/08, hoje 18/08. Pílula: **D+5**. É o último balde da régua |
| **Impacto** | **P2.** "D+5" lido como "5 dias de atraso" subestima em 8 dias |
| **Classificação** | **DE JULGAMENTO** — o balde é legítimo, o rótulo é ambíguo |
| **Correção necessária** | "D+5 ou mais". Não implementada |

*(Correção a um registro meu anterior: eu havia listado a régua de cobrança como
possivelmente decorativa. **Ela funciona** — populou corretamente assim que houve
fatura. Estava vazia por falta de dado, não por falta de função.)*

---

## F10 · "1 confirmada — o resto ainda é cobrança" com zero em aberto

**P2 · ÓBVIO.** Subtítulo incondicional do KPI RECEBIDO em Mensalistas. Com
`EM ABERTO R$ 0,00` não há resto.

---

## Achados anteriores reconfirmados nesta passada

| ID | O quê | Estado |
|---|---|---|
| **A6** | Simulador diverge de si mesmo a 0% | ✅ reconfirmado: `−R$ 556,80` × `−R$ 536,00`, diferença **+R$ 20,80** = imposto R$ 20,34 + arredondamento R$ 0,46 |
| **A8** | Mensalistas afirma que os planos precisam ser cadastrados | ✅ reconfirmado em base limpa, com os dois planos ativos |
| **A10** | Separador decimal em ponto | ✅ `77.7%` |
| **A12** | "1 de 3 devolvida" | ✅ reconfirmado ao vivo |
| **A4/A5/A7** | Grandezas com nome único | ✅ agravados pelos números maiores |

**A11 — precisão:** *"1 un. já voltaram"* **não** apareceu nesta passada. A
devolução exibiu *"1 un. voltou para o estoque"* — correto. O defeito está no
modal quando **já existe** devolução anterior (`desfazer-venda.tsx:186`), e
continua válido, mas é mais estreito do que registrei antes.

---

# O QUE FUNCIONOU — e merece ser dito com o mesmo peso

## ✅ Fluxo 5 · Custo médio, comprovado ponta a ponta

Dei entrada de 10 un. a R$ 30,00 sobre 10 un. a R$ 18,00. **Antes de executar**,
a tela declarou a conta:

> *Total da compra **R$ 300,00** · Estoque: 10 → 20 un. ·
> **Custo médio: R$ 18,00 → R$ 24,00** — a média entre o que já estava na
> prateleira e esta compra.*

`(18×10 + 30×10) ÷ 20 = 24` ✓ — e o produto, a margem e o CMV seguiram juntos.

## ✅ Fluxo 2 e 7 · Venda, estorno e congelamento sob mudança de custo

Vendi 3 pomadas **depois** da mudança de custo. O DRE:

```
(−) Custo de Mercadoria Vendida                              R$ 48,00
     Pomada modeladora        (3 un. × R$ 24,00)             R$ 72,00
     Devolução · Pomada       (1 un. de volta na prateleira) −R$ 24,00
```

A venda **congelou** o custo em R$ 24,00 e a devolução reverteu **no mesmo
custo** — não no antigo, não no futuro. Estoque 20 → 17 → 18. A venda original
permaneceu na lista, marcada. **Este é o padrão do produto.**

E a comissão acompanhou: `Despesas Variáveis R$ 27,46` = taxas R$ 6,46 +
comissão **R$ 21,00** — que é 50% do lucro de **2** unidades, não de 3. A
devolução reduziu o acerto do barbeiro, exatamente como o modal prometeu.

## ✅ Fluxo 4 · A aritmética do dinheiro fecha, ponta a ponta

```
ENTROU  R$ 377,54  =  48,25 (serviço crédito, líquido de 3,49%)
                   +  50,00 (serviço dinheiro)
                   + 130,29 (produto crédito, líquido)
                   + 149,00 (mensalidade Pix, sem taxa)
SAIU  R$ 1.245,00  =  800 despesa + 300 compra + 45 devolução + 100 sangria
Imposto R$ 20,34   =  6% × R$ 339,00
Resultado −R$ 556,80
```

Nenhum número precisou ser ajustado. **A taxa congelou em 3,49%** — a da
barbearia, não a da tabela da plataforma.

## ✅ Fluxo 6 · Livro caixa, exercitado pela primeira vez

O enum fechado aparece na tela como cinco opções nomeadas, cada uma com sua
definição (*"Sangria — dinheiro retirado da gaveta: depósito, cofre, pagamento em
espécie"*). A sangria entrou em **"Retiradas e acertos"** no fluxo e no livro,
sem duplicar. A compra de estoque apareceu como saída com a explicação certa:
*"Sai do caixa hoje; vira custo quando a mercadoria for vendida."*

## ✅ Microcopy que declara consequência — o melhor do produto

- *"Sem WhatsApp, este cliente não é reconhecido na próxima visita."* → e ao
  preencher: *"Com este número, o cliente é reconhecido nas próximas visitas."*
- *"Sem indicar quem vendeu, a venda não gera comissão."* — some quando resolvido
- *"A taxa da maquininha é registrada com o valor de hoje e não muda depois."*
- *"A venda original continua no histórico — o estorno é um registro novo, não um
  apagamento."*
- Vazio de Despesas: *"…é o que falta para o resultado do mês ser verdade."*

---

# ESTADOS

| Estado | Situação |
|---|---|
| **vazio** | ✅ **o melhor do produto.** Todos com explicação e, quando cabe, ação |
| **erro** | ⚠️ a mensagem existe; os agregados ao redor continuam afirmando zero (A1/A2) |
| **sucesso** | ❌ **três padrões diferentes** (F4) |
| **carregando** | ⏳ não observável — respostas rápidas demais no emulador |
| **sem histórico** | ✅ Números e Projeção declaram a estimativa |
| **dados parciais** | ❌ o caso que revela: **o vazio de Despesas e o erro de Despesas têm KPIs idênticos** — `0 / R$ 0,00 / R$ 0,00 / —`. Os quatro números não distinguem "não há despesa" de "não consegui ler" |

---

# IDENTIDADE VISUAL

Sem redesign, como pedido. Apenas onde a consistência se perde.

**Onde já é própria:** a voz. As frases acima não saem de nenhum SaaS genérico.
Mais as árvores com dedução assinada, os blocos que declaram o que não mostram, e
a paleta quente com número em `font-display`.

**Onde perde consistência:**

1. **Confirmação** — modal · faixa · nada (F4). É o ponto onde a identidade mais
   se dissolve, porque é onde o produto fala com o dono.
2. **A grade de KPIs** abre sete telas iguais. Hoje (operação, em pé) e Quanto
   sobrou (análise, sentado) têm a mesma abertura.
3. **Tabelas** sem ritmo tipográfico próprio.
4. **O 404** — preto, em inglês, sem marca. Nada nele é JP Barber.
5. **O spinner do `AuthGuard`** — o único momento em que o produto não é o
   produto.

Nada de neon, gradiente decorativo, glassmorphism ou dark mode foi encontrado.
**O contrato visual está sendo respeitado.** O que falta não é remover excesso —
é a composição alcançar o nível que a escrita já tem.

---

# MOBILE — ⏳ NÃO VERIFICADO

```
resize_window(390, 844)  →  "Successfully resized window"
window.innerWidth        →  1920
matchMedia('(min-width: 768px)').matches  →  true
```

A ferramenta relata sucesso e o viewport não muda. **Falta validar:**
`bottom-nav` e `ClienteBottomNav` · `shortLabel` no menu inferior · alvo de toque
≥ 44px · `safe-top` · as tabelas de Fluxo e Despesas em 360px · o modal
"Marcar atendimento" (4 seções + grade de horários) · o teclado numérico nos
campos de valor · a grade de KPIs empilhada.

---

# A · P0 — impede confiar no produto

| # | Achado |
|---|---|
| 1 | **F1** — comissão 0% enquanto três telas prometem 40%, e nenhuma tela grava o padrão |
| 2 | **F2** — sem representação para atendimento coberto pelo plano |
| 3 | **F3** — o DRE afirma que o sistema não cobra mensalidade, e cobra |
| 4 | **A1/A2** — total exibido quando a fonte falhou (lucro onde há prejuízo) |
| 5 | **F5** — "caixa de hoje" e "fluxo de caixa" com os mesmos rótulos e números diferentes |
| 6 | **A3** — login exibe "CorteHub" quando o tenant não resolve |

# B · P1 — quebra entendimento ou operação

**F4** feedback inconsistente · **F6** ticket médio ×3 · **F7** ficha do cliente
inacessível · **A6** simulador divergindo a 0% · **A8** vazio de mensalistas ·
**A19** atalho contradizendo o destino · **A13–A17** afirmações sem fato em
Números · **A20** tabela de taxa que não é a aplicada

# C · P2 — refinamento

**F8** default silencioso de pagamento · **F9** "D+5" · **F10** subtítulo
incondicional · **A10** separador decimal · **A12** concordância · **A18** 404 ·
**A21** "+0 novos" · **P11** spinner em vez de esqueleto · grade de KPIs

# D · NÃO VERIFICADO

Mobile inteiro (⏳) · área do cliente com sessão de cliente (N7) · estado de
carregando · contraste AA medido em tela · `prefers-reduced-motion`, foco e
tabulação · telas com volume real · remarcar e cancelar reserva · desfazer uma
conclusão · devolver mensalidade (o botão existe, não foi clicado)

# E · DECISÕES QUE PRECISAM DO JOÃO

1. **C.1 — mensalista e serviço coberto.** Destrava F2. É decisão de modelo.
2. **C.2 — total com fonte falha:** suprimir ou marcar? Destrava A1/A2.
3. **C.3 — "ticket médio" / "receita" / "caixa":** definição única ou nomes
   distintos? Destrava F5, F6, A5.
4. **C.4 — o padrão de comissão da casa:** qual é, e em que tela o dono o define?
   (F1 tem uma metade óbvia — a divergência — e uma metade sua: o valor.)
5. **C.5 — ficha do cliente:** existe como tela? (F7)
6. **C.6 — padrão único de confirmação** (F4).
7. **C.7 — vitrine pública** e **C.8 — tela de cadastro de plano**: seguem
   abertas do gate.

---

# AS CINCO RESPOSTAS

### 1 · O que está realmente fechado

O **motor de produto e estoque**, ponta a ponta e agora comprovado por execução:
custo médio ponderado, congelamento de custo na venda, devolução revertendo no
mesmo custo, estoque batendo, comissão reduzida pela devolução, CMV com filhos
que somam o cabeçalho. O **estorno** — o fato original nunca é apagado. O
**livro caixa** com exclusividade por enum fechado. A **aritmética do dinheiro**:
entrou, saiu, taxa, imposto e resultado fecham sem ajuste. E os **estados
vazios**, que são a parte mais madura da interface.

### 2 · O que ainda quebra a experiência

Seis coisas, e cinco delas são a mesma doença: **o produto afirma um número que
não é o fato.** A comissão que a tela promete e o acerto não paga (F1). O
mensalista que o produto cobra duas vezes porque não sabe dizer "coberto" (F2).
O texto que nega uma funcionalidade que o próprio DRE está usando (F3). O
resultado que aparece completo quando a fonte falhou (A1/A2). O caixa que tem
dois valores com o mesmo nome (F5). A sexta é a marca errada no login (A3).

### 3 · O que depende de decisão sua

As sete da seção E. As três primeiras bloqueiam tudo: **mensalista**, **total sob
falha** e **definição de receita/caixa**. Nenhuma é técnica; todas são de modelo
de negócio, e é por isso que não avancei nelas.

### 4 · O que precisa de implementação objetiva

Cerca de **20 correções ÓBVIAS**, nenhuma tocando motor financeiro: a divergência
do F1, o texto do F3, o simulador do A6, o vazio do A8, o atalho do A19, as
afirmações sem fato do A13–A17, o separador decimal, a concordância, o 404, o
default de pagamento do F8, o "+0 novos". Todas contrariam contrato já escrito —
não precisam de decisão, precisam de execução.

### 5 · Qual é a próxima frente, e por quê

**Não é UI.** É uma frente única e curta: **FIN-03 — a comissão e o mensalista**,
resolvendo F1 e F2 juntos.

Porque são o mesmo problema visto de dois lados: **o produto não sabe dizer
quanto uma pessoa vale.** No serviço, promete 40% e paga 0. No plano, cobra
R$ 149 e cobra de novo R$ 50. Os dois adulteram receita **e** folha — as duas
únicas coisas que um dono de barbearia confere no fim do mês.

E porque **qualquer trabalho de UI feito antes disso é retrabalho**: a tela de
Equipe, a de Mensalistas, a de Hoje e o DRE inteiro mudam de conteúdo quando essas
duas decisões forem tomadas.

Depois dela, na ordem: as ~20 correções óbvias → QA-02 → mobile em aparelho real
→ sua revisão de identidade → UX POLISH 1.0.

**Não recomendo abrir mais de um agent.** O que falta agora é profundidade em um
ponto, não largura em vários.
