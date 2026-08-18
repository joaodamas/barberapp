# Gate de decisão — antes do UX-AUDIT-FINAL

> 18/08/2026 · `hardening/p0-2026-08-17` · **somente documentação**
> Nenhuma alteração em código de produção, testes, design system, analytics,
> navegação ou modelo financeiro.

⚠️ **Recebi esta instrução a partir do Gate 3.** Os **Gates 1 e 2 não chegaram**
— a mensagem começa no meio da seção de identidade. Pelo padrão das fases
anteriores eles seriam *decisões financeiras* e *decisões de produto/experiência*,
e ambos já estão cobertos pelas seções 1 e 2 do `GATE-DE-PRODUTO.md`. Não os
reconstruí por suposição. **Se existirem, têm precedência sobre o que está aqui.**

---

# A RESPOSTA AO CRITÉRIO DE SAÍDA

> *"Se eu parar de escrever código agora, quais são exatamente as decisões que
> impedem o JP Barber de chegar a 90% de maturidade?"*

## São quatro. Não há uma quinta.

| # | Decisão | O que trava hoje | Custo de decidir |
|---|---|---|---|
| **D1** | **Qual é o padrão de comissão da casa — e em que tela o dono o define?** | O acerto do barbeiro. A tela promete 40%, o documento grava 0% | Um número e uma tela |
| **D2** | **Como o produto representa um atendimento coberto pelo plano?** | Receita e folha do mensalista. Hoje o dono ou cobra duas vezes ou não registra o atendimento | Uma escolha entre três desenhos |
| **D3** | **O que a tela faz com um total cuja fonte falhou — suprime ou marca?** | O DRE apresentar lucro onde há prejuízo | Uma regra de uma linha |
| **D4** | **"Receita" e "caixa": uma definição só, ou nomes distintos?** | Três "ticket médio", dois "caixa de hoje", duas "receita" na Projeção | Uma escolha de vocabulário |

**Por que exatamente estas quatro, e nenhuma outra:**

Passei todos os achados por um teste único — *"decidir isto muda o que a equipe
escreve, ou só quando ela escreve?"*. Só quatro mudam **o quê**.

- As ~20 correções ÓBVIAS **não precisam de decisão**: contrariam contrato já
  escrito. São execução.
- **Mobile** não precisa de decisão: precisa de aparelho.
- **Área do cliente e as escritas restantes** não precisam de decisão: precisam
  de execução.
- **Identidade visual** não é decisão de desbloqueio, é **insumo seu** — e está
  tratada à parte, no Gate 3, porque ela não impede os 90% de *confiança*; ela
  define os 100% de *reconhecível*.

**Nenhuma das quatro é técnica.** Todas são de modelo de negócio, e é
exatamente por isso que nenhum agent pode tomá-las.

---

# ⛔ Bloqueadores que NÃO são decisão

Ficam listados para não serem confundidos com a resposta acima.

| | O quê | Do que precisa |
|---|---|---|
| **B1** | `stash@{0}` — D31 fora da branch (`analytics.ts` +28, `densidade.test.ts` +59) | Um `git stash pop` e a suíte. Só precisa da sua autorização, não de uma decisão |
| **B2** | ~20 correções ÓBVIAS | Execução |
| **B3** | Mobile | Aparelho ou runner com device emulation |
| **B4** | Área do cliente (N7) + 5 escritas restantes | Execução |

---

# GATE 3 — IDENTIDADE

## O que está proibido, transcrito

Não copiar **Notion, Apple, fintechs genéricas, dashboards SaaS genéricos** ou
qualquer referência de mercado usada como molde. Sem **neon**, sem **gradiente
decorativo**, sem estética **"cyber" / "gaming" / "futurista"**. Não transformar
a identidade numa paleta chamativa só para parecer diferente.

> A pergunta não é *"como fazemos parecer diferente?"*.
> É **"como fazemos parecer JP Barber?"**

**Toda mudança de identidade é PROPOSTA, nunca implementada, até aprovação sua.**

## Onde o produto está hoje — auditado, não opinado

**A identidade do JP Barber existe, e mora na escrita.** Isto é evidência, não
elogio: as frases abaixo foram capturadas na interface e nenhuma delas sairia de
um SaaS genérico.

> *"Sem WhatsApp, este cliente não é reconhecido na próxima visita."*
> *"Sem indicar quem vendeu, a venda não gera comissão."*
> *"A taxa da maquininha é registrada com o valor de hoje e não muda depois."*
> *"A venda original continua no histórico — o estorno é um registro novo, não um
> apagamento."*
> *"Custo médio: R$ 18,00 → R$ 24,00 — a média entre o que já estava na
> prateleira e esta compra."*
> *"…é o que falta para o resultado do mês ser verdade."*

Tape o logo e leia o texto: reconhece-se. Tape o texto e olhe o layout: não.

**Conformidade com o contrato: ✅ integral.** Nenhum neon, gradiente decorativo,
glassmorphism, dark mode ou cópia de concorrente foi encontrado em nenhuma tela
auditada.

## Onde a consistência se perde — 5 pontos, sem proposta de solução

| # | Onde | O que acontece |
|---|---|---|
| **I1** | **Confirmação de ação** | Três tratamentos para dez escritas: modal completo, faixa inline, nada. É onde o produto fala com o dono, e é onde ele mais soa como três produtos |
| **I2** | **Abertura de tela** | Sete telas abrem com a mesma grade de KPIs. Hoje (operação, em pé) e Quanto sobrou (análise, sentado) são indistinguíveis nos primeiros 200px |
| **I3** | **Tabelas** | Zebra padrão, sem ritmo tipográfico próprio — o oposto das árvores do DRE, que têm |
| **I4** | **404** | Preto, em inglês, sem marca. Nada nele é JP Barber |
| **I5** | **`AuthGuard`** | Spinner genérico em tela vazia — a primeira coisa que o dono vê ao entrar |

**Nenhuma proposta visual foi elaborada.** Conforme o gate, isso só acontece
depois que você disser o que quer que o JP Barber pareça.

**Observação de método:** I1 e I5 não são questão de gosto — são estados
funcionais que o contrato §7 já regula. Podem ser resolvidos com o design system
existente, sem decisão de identidade. I2, I3 e I4 são identidade.

---

# GATE 4 — DENSIDADE

As cinco perguntas, aplicadas a cada candidato. Nenhuma remoção implementada.

### 1 · Mapa de calor · Números — 6 × 18 = 108 células

1. **Que pergunta responde?** "Em que dia e hora eu tenho brecha para promover?"
2. **Outro elemento responde a mesma?** Não. É a única visão dia × horário.
3. **Quem responderia depois?** Ninguém.
4. **Esconde fato novo?** Não.
5. **Semântica ou apresentação?** Apresentação.

→ **JULGAMENTO.** Não é duplicação: é uma pergunta legítima com apresentação cara
para barbearia pequena. **Recomendo manter** e resolver o texto que ele gera
(A16: "maior brecha" escolhida por desempate entre 107 células em 0%).

### 2 · Régua de cobrança · Mensalistas

1. **Que pergunta?** "Quantas mensalidades estão atrasadas, e há quanto tempo?"
2. **Outro responde?** Parcialmente — o KPI `EM ABERTO` dá o valor, não a idade.
3. **Quem depois?** Ninguém daria a distribuição por atraso.
4. **Esconde fato?** Sim — a idade do atraso sumiria.
5. **Semântica ou apresentação?** Semântica.

→ **MANTER. Não é candidata.**

⚠️ **Correção a um registro meu anterior:** eu havia listado a régua como
possivelmente decorativa ("7 círculos vazios"). **Ela funciona** — populou
corretamente assim que emiti a fatura. Estava vazia por falta de dado, não de
função. O erro foi meu: julguei densidade olhando um estado zerado, que é
exatamente o que a sua própria regra adverte.

### 3 · Quatro KPIs zerados do bloco Comercial · Financeiro

1. **Que pergunta?** Crescimento de mensalistas, mensalidade média, inadimplência,
   faturamento da loja.
2. **Outro responde?** A tela de Mensalistas responde as três primeiras com mais
   contexto.
3. **Quem depois?** Mensalistas.
4. **Esconde fato?** Não — nenhum é exclusivo do Financeiro.
5. **Semântica ou apresentação?** Apresentação.

→ **JULGAMENTO.** É a candidata mais forte a fusão. Mas atenção: com dados reais
eles **deixam de ser zero** — na minha passada de hoje `FATURAMENTO DA LOJA`
mostrou R$ 135,00 legítimo. **A impressão de excesso vinha do cenário vazio.**

### 4 · Produto listado duas vezes na Loja — "VENDER" e "PRODUTOS"

1. **Que pergunta?** "VENDER" → "quero vender agora". "PRODUTOS" → "quanto custa,
   quanto tenho, quanto sobra".
2. **Outro responde?** **Não. São perguntas diferentes.**
3. **Quem depois?** —
4. **Esconde fato?** Fundir esconderia custo/margem no fluxo de venda, ou poluiria
   a venda com dados de gestão.
5. **Semântica ou apresentação?** Semântica.

→ **MANTER. Não é duplicação literal.** Verificado em uso: vendi 3 pomadas pelo
bloco de cima e dei entrada pelo de baixo, e os dois caminhos são distintos.

### 5 · `MARGEM −550%` como KPI de topo · Financeiro

1. **Que pergunta?** "Que fração da receita sobra?"
2. **Outro responde?** `RESULTADO` responde em reais; `MARGEM DE CONTRIBUIÇÃO`
   no DRE responde a versão útil.
3. **Quem depois?** RESULTADO.
4. **Esconde fato?** Não — é derivado.
5. **Semântica ou apresentação?** Apresentação.

→ **JULGAMENTO.** Um percentual de três dígitos negativo não ajuda a decidir
nada. **Recomendo trocar** por algo com ação, não remover pelo tamanho.

### 6 · A grade de KPIs em sete telas

Não é remoção — é **I2**, identidade. Fora do escopo deste gate.

## Resumo do Gate 4

```
ÓBVIO (duplicação literal ou violação de regra)  →  nenhum novo encontrado
JULGAMENTO                                        →  3  (mapa de calor · KPIs Comercial · margem)
MANTER, avaliado e descartado                     →  2  (régua · Loja)
```

**As três remoções da DENSITY-01 seguem válidas.** Nenhuma nova é óbvia.

> **A lição desta passada:** duas das minhas suspeitas de densidade eram artefato
> do cenário vazio, não excesso real. A sua regra — *"se a informação surgiu da
> Rodada 3.2, presuma necessária"* — deveria ter uma irmã: **não se decide
> densidade olhando uma barbearia com zero movimento.**

---

# GATE 5 — VERIFICAÇÃO

```
✅ VERIFICADO                     🟠 PROPOSTA           ⚪ DECISÃO HUMANA
🟡 IMPLEMENTADO, NÃO VERIFICADO   🔴 DEFEITO            ⏳ BLOQUEADO POR AMBIENTE
```

## Motor financeiro

| ITEM | STATUS | EVIDÊNCIA | BLOQUEIO |
|---|---|---|---|
| Custo médio ponderado na entrada | ✅ | 10 un. a R$ 30 sobre 10 a R$ 18 → R$ 24,00 na tela, antes de executar | — |
| Congelamento de custo na venda | ✅ | Venda pós-mudança gravou `unitCost 24`; DRE: `3 un. × R$ 24,00` | — |
| Devolução reverte no mesmo custo | ✅ | `−R$ 24,00` no CMV, não R$ 18,00 | — |
| Decremento de estoque | ✅ | 20 → 17 → 18 pela interface | — |
| Comissão reduzida pela devolução | ✅ | R$ 21,00 = 50% do lucro de 2 un., não 3 | — |
| Fato original preservado no estorno | ✅ | Venda permanece listada, marcada "1 de 3 devolvida" | — |
| Idempotência por id derivado | ✅ | `pagamento_{bookingId}`, `estorno_venda_{mv}_{chave}` | — |
| Taxa congelada por transação | ✅ | `feePct 3.49` gravado; taxa da barbearia, não da tabela da plataforma | — |
| Aritmética entrou/saiu/imposto/resultado | ✅ | 48,25+50+130,29+149 = **377,54**; imposto 6% × 339 = 20,34 | — |
| Exclusividade `cash_entries` × DRE | ✅ | Sangria no Fluxo e no Livro; ausente do DRE | — |
| Enum fechado de caixa | ✅ | 5 tipos nomeados na tela, cada um com definição | — |
| **Comissão de serviço** | 🔴 | Tela: "padrão da barbearia (40%)". Documento: `commissionPct: 0` | **D1** |
| **Receita do mensalista** | 🔴 | DRE com `Serviços R$ 100,00` **e** `Mensalidades R$ 149,00` do mesmo cliente | **D2** |
| **Total sob falha de fonte** | 🔴 | `+R$ 30,39` sob falha × `−R$ 769,61` real | **D3** |
| `expenses` sem idempotência (D24) | 🔴 | Escrita direta do cliente; duplo clique duplica | — |
| **D31 · `naoInformado`** | 🟡 | Existe em `stash@{0}`, não na branch | **B1** |

## Experiência e interface

| ITEM | STATUS | EVIDÊNCIA | BLOQUEIO |
|---|---|---|---|
| Estado vazio (todas as telas vistas) | ✅ | Explicam e, quando cabe, oferecem ação | — |
| Estado de erro — mensagem | ✅ | "Não foi possível carregar… nada foi perdido" | — |
| Estado de erro — agregados | 🔴 | KPIs de Despesas idênticos no vazio e no erro | **D3** |
| Estado de sucesso | 🔴 | Três padrões para dez escritas | ⚪ padrão único |
| Estado de carregando | ⏳ | Emulador responde rápido demais | ambiente |
| D30 · tenant no painel | ✅ | Erro em vez de expulsão (sessão anterior) | — |
| D30 · tenant no login/cliente | 🔴 | Exibe "CorteHub" no lugar de "O Siqueira" | — |
| Vitrine pública | ⚪ | Não existe: `(cliente)` inteiro atrás do `AuthGuard` | decisão |
| Ficha do cliente | 🔴 | `fichaDoCliente()` calculada, nenhuma tela a abre | ⚪ escopo |
| Vocabulário de menu | ✅ | "Quanto sobrou" no menu, h1 e atalho | — |
| Atalho Fluxo → destino | 🔴 | "completo · R$ 180,29" leva a "−R$ 664,71" | **D4** |
| Ticket médio | 🔴 | R$ 47,50 · R$ 50,00 · R$ 188,77 | **D4** |
| "Caixa de hoje" × "Fluxo" | 🔴 | Mesmos 3 rótulos, números diferentes | **D4** |
| Simulador a 0% de variação | 🔴 | `−556,80` × `−536,00`, diferença +R$ 20,80 | — |
| Afirmações sem fato em Números | 🔴 | "caiu de 0% para 0%"; "costuma voltar a cada 0d" | — |
| Bloco "Receita contratada" no DRE | 🔴 | Nega a cobrança que o próprio DRE está exibindo | — |
| Separador decimal | 🔴 | `77.7%`, `0.99%` | — |
| Concordância | 🔴 | "1 de 3 devolvida" | — |
| 404 | 🔴 | Preto, em inglês, sem marca | — |
| Light-only / sem neon / sem dark | ✅ | Nenhuma violação em nenhuma tela auditada | — |
| Identidade — voz | ✅ | Seis frases capturadas | — |
| Identidade — composição | 🟠 | I1–I5 apontados, nenhuma proposta feita | ⚪ **você** |
| **Mobile (tudo)** | ⏳ | `resize_window` → sucesso; `innerWidth` → 1920 | ambiente |
| Contraste AA na tela renderizada | ⏳ | Só há teste de token | ambiente |
| `prefers-reduced-motion`, foco, tabulação | ⏳ | Não exercitados | ambiente |
| Área do cliente com sessão de cliente | ⏳ | N7 | execução |

## Escritas exercitadas — 10 de 15

| ITEM | STATUS |
|---|---|
| Marcar no balcão · concluir · entrada de estoque · vender · devolver · contratar mensalista · emitir faturas · registrar pagamento · lançar despesa · sangria | ✅ |
| Desfazer conclusão · devolver mensalidade · remarcar · cancelar · alterar taxa | ⏳ não exercitadas |

---

# GATE 6 — PRÓXIMA ORDEM

## 1 · Decisões suas — as quatro

**D1 · Padrão de comissão da casa.** Qual percentual, e em que tela o dono o
define. Hoje o campo é lido por três telas e escrito por nenhuma, e as duas
leituras discordam.

**D2 · Atendimento coberto pelo plano.** Três desenhos possíveis:
`(a)` reserva nasce com valor zero e marca de cobertura — receita fica só na
mensalidade, **mas a comissão do barbeiro vai a zero e precisa de regra própria**;
`(b)` valor cheio com dedução assinada "coberto pelo plano", igual à devolução —
preserva a base de comissão e reaproveita mecanismo já provado na tela;
`(c)` mensalidade vira adiantamento e a receita é reconhecida a cada atendimento
— o mais correto contabilmente e o mais caro. **Recomendo (b).**

**D3 · Total com fonte falha.** Suprimir ou marcar. **Recomendo suprimir:** um
número apagado faz o dono perguntar; um número errado faz o dono decidir.

**D4 · "Receita" e "caixa".** **Recomendo dois nomes distintos** — "ticket de
serviço" e "ticket com produto"; "caixa do dia (serviços)" e "caixa do dia
(tudo)". O motor já tem `avgTicketComProduto`. Nome único com três valores é o
que produziu quatro defeitos.

**+ B1 · autorizar o `stash@{0}`** (aplicar / descartar / deixar). Não é decisão
de modelo, mas é sua.

## 2 · Correções objetivas — depois, e sem decisão

~20 itens, nenhum tocando motor financeiro: divergência do commissionSplit
(a metade óbvia de D1), texto do bloco "Receita contratada", `resolverTenant` no
login e no `(cliente)`, simulador a 0%, vazio de Mensalistas, atalho do Fluxo,
afirmações sem fato em Números, separador decimal, concordância, 404, default de
pagamento na despesa, "+0 novos", barra verde sob "no vermelho".

## 3 · Validações necessárias

Exercitar as 5 escritas restantes · abrir a área do cliente com sessão de cliente
(N7) · estado de carregando com rede degradada · contraste AA na tela renderizada
· `prefers-reduced-motion`, foco visível e ordem de tabulação.

## 4 · Pré-condições do UX-AUDIT-FINAL

```
□  D1, D2, D3, D4 decididas
□  as ~20 correções óbvias implementadas e as visuais inspecionadas na tela
□  N7 exercitada
□  mobile com viewport real disponível
□  stash resolvido
```

**Sem as quatro decisões, o UX-AUDIT-FINAL audita um produto cujo comportamento
muda em seguida** — e registra como achado o que já é decisão pendente.

## 5 · Só então, UX-AUDIT-FINAL

Como definido: percorrer as setas, não as telas.
`abrir → onde estou → executar → entender o resultado → entender o dinheiro →
próximo passo`.

---

## A sequência inteira

```
1  gate de decisões                    ← concluído aqui
2  você decide D1·D2·D3·D4 + identidade
3  agents paralelos só para as correções objetivas
4  área do cliente + escritas restantes
5  mobile real
6  QA-02 transversal
7  UX-AUDIT-FINAL
8  seu aceite visual
```

E o ponto que a auditoria confirma: **o JP Barber não precisa de mais design para
chegar a 90%.** Precisa que a estrutura que já existe seja confiável e coerente.
A parte "reconhecivelmente própria" fica preservada para você — nenhuma proposta
visual foi elaborada, e nenhuma será sem sua definição.
