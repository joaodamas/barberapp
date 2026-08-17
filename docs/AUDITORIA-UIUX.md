# Auditoria de UI/UX — frente transversal

> **O dado pode ser tecnicamente perfeito e o produto ainda estar errado, se o
> dono não entender o que está vendo ou não souber o que fazer.**

Nenhuma linha de código alterada. Auditoria contra a régua de sete pontos, com
o que foi observado operando o produto nesta fase.

---

## O que já está certo, e não deve ser mexido

Vale dizer primeiro, porque uma auditoria só de problemas induz a redesenhar o
que funciona.

| | Evidência |
|---|---|
| **Light-only, sem dark mode** | Zero `prefers-color-scheme`, zero classes `dark:`. `globals.css` documenta contraste medido contra WCAG AA — *"#4f8542 dava 4.41:1 — reprovava AA por pouco"* |
| **`prefers-reduced-motion`** | respeitado em três pontos |
| **Ação onde o dono pensa** | D13 pôs "Marcar atendimento" na agenda, não num menu. G1 pôs "Vender" acima do catálogo. G1.5 pôs "Dar entrada" ao lado do estoque |
| **Estado vazio com período** | *"Nenhuma despesa em agosto"*, *"Nenhuma mensalidade em Agosto de 2026"* — a lição de P1-1 |
| **Feedback que diz o que aconteceu** | *"Paga · Pix"*, *"O estoque já foi baixado"*, *"Estoque: 10 → 20 un."* |
| **Erro do servidor chega inteiro** | a tela mostra *"Última unidade: estoque insuficiente, restam 1"* em vez de "não foi possível" |

**Nada disso é acidente:** cada um saiu de um achado desta auditoria. A frente
de UI/UX não começa do zero — começa de um produto que já aprendeu seis lições.

---

## 1 · Hierarquia — 🔴 o problema mais visível

### O Financeiro tem **oito** KPIs numa tela

`financeiro/page.tsx`: Receita realizada · Custo total · Resultado · Margem ·
Crescimento líquido de mensalistas · Mensalidade média · Inadimplência ·
Faturamento da loja.

Quatro respondem *"como foi o mês"*. Quatro respondem outra coisa. Todos têm o
mesmo peso visual.

Sua régua diz: *"a primeira leitura deveria ser simples — Receita realizada,
Custos, Resultado — e depois permitir aprofundamento"*. Hoje o dono recebe os
oito de uma vez, e três deles (`Crescimento líquido`, `Mensalidade média`,
`Inadimplência`) são detalhe de mensalista numa tela de resumo.

### O painel Hoje tem **nove** `Card`

E dois deles respondem a mesma pergunta: *"Previsto hoje"* no topo e
*"Previsão do dia"* logo abaixo, no bloco Previsão × Recebido. **O mesmo número,
duas vezes, com dois rótulos diferentes.**

### A tela Mensal tem dois blocos de indicadores

Já registrado quando G2 fechou: os três cartões novos (Faturado / Recebido / Em
aberto) e o MRR antigo logo abaixo. Funcionalmente corretos, visualmente
redundantes — e agora com **duas** representações de receita contratada.

### `numeros/page.tsx` tem **dez** `Card`

Não auditado em detalhe. O número por si já é sinal.

---

## 2 · Linguagem — 🟠

### Termos que o dono de barbearia não usa

| Na tela | O que ele diria |
|---|---|
| "DRE Gerencial" | "Resultado do mês" |
| "MRR cobrável" | "Mensalidade prevista" |
| "Crescimento líquido de mensalistas" | "Mensalistas novos" |
| "Margem" | "Quanto sobra de cada R$ 100" |

"DRE" é termo de contador, e está **no menu** — não numa tela interna.

### O caso oposto, que está certo

"Custo total", "Recebido", "Em aberto", "Previsto hoje" são linguagem de dono.
Foram escritos nesta auditoria, o que sugere que o vocabulário melhora quando
alguém pergunta *"o dono entenderia?"* em vez de *"o que o campo se chama?"*.

---

## 3 · Estados — 🟡

`EmptyState` e `LoadingRows` existem e são usados. O que falta:

| Estado | Situação |
|---|---|
| vazio | 🟢 existe, e diz o período |
| carregando | 🟢 `LoadingRows` |
| erro de gravação | 🟢 `soAvisaSeGravou` + `role="alert"` |
| **erro de carregamento** | 🔴 não vi tratamento: se o listener falhar, a tela mostra vazio — *"nenhuma despesa"* quando na verdade é *"não consegui ler"* |
| sem permissão | 🟢 `RecursoBloqueado` |
| período sem movimentação | 🟢 desde P1-1 |

**O erro de carregamento é o grave**: mostrar "vazio" quando a leitura falhou é
uma afirmação falsa — a mesma classe da Rodada 1, num estado que ninguém testou.

---

## 4 · Ação — 🟢 com uma exceção

O padrão está certo nas telas novas. A exceção herdada:

**Cliente não tem tela.** G3 criou a entidade, e ela só aparece dentro de
modais — buscar cliente ao marcar, ao vender, ao contratar mensalista. Não há
"Clientes" no menu, e portanto não há como o dono ver a ficha de alguém,
corrigir um nome ou saber quem não volta há dois meses.

Sua própria arquitetura de navegação lista **Clientes** como área de primeira
classe. Hoje ela não existe.

---

## 5 · Feedback — 🟠 a história está incompleta

O caso encontrado ao verificar G1.6:

```
"Venda de R$ 90,00 registrada. O estoque já foi baixado."
```

Correto e incompleto. A venda foi no crédito e gerou **R$ 3,14 de taxa** — fato
que agora existe no banco e que a interface não conta em lugar nenhum.

Como você colocou: não precisa estar tudo no toast. Precisa **existir o lugar
certo**:

```
Venda      R$ 90,00
Taxa       − R$ 3,14
Líquido    R$ 86,86
Estoque    2 unidades baixadas
```

O mesmo vale para a mensalidade paga: *"Paga · Pix"* não diz que houve taxa.

**Este é o teste da frente de UI/UX**: o fato existe, o número existe, e a
interface ainda não conta a mesma história. Os três precisam coincidir.

---

## 6 · Consistência — 🟠

| Conceito | Divergência |
|---|---|
| Meio de pagamento | Entrada usa `PaymentMethod` (pix/cash/debit/credit); **despesa usa outro vocabulário** ("Pix"/"Boleto"/"Cartão"/"Transferência") — D24 |
| Cartão | `caixaDoDia` agrupa débito+crédito em "Cartão"; `payments` separa. Correto por desenho, e **a tela não explica a diferença** |
| Receita | "Receita realizada", "Faturado", "Recebido", "MRR cobrável", "Contratado" — cinco termos, três conceitos |
| Período | Financeiro usa `rotuloDoMes`; Projeção usa dias; Fluxo usa "Histórico diário". Três formas de dizer "quando" |

---

## 7 · Profissionalismo visual — 🟢 com risco

Não há gradiente gratuito, dark mode nem número gigante sem contexto. O risco é
outro e é o de **acúmulo**: oito KPIs numa tela, nove cartões noutra, dez na
terceira. Isso não vira "dashboard de startup" por estilo — vira por densidade.

Sua régua diz: *"profissional ≠ cheio de informação"*. É exatamente o eixo em
que o produto está escorregando.

---

## O que eu faria, e em que ordem

**Antes da Rodada 3** — porque não dependem dos números finais:

1. **Erro de carregamento.** É afirmação falsa, e é barato.
2. **Tela de Clientes.** A entidade existe e está invisível; é a que conecta
   agendamento, venda e mensalidade.
3. **Vocabulário.** Uma tabela de termos, aplicada em todas as telas.

**Depois da Rodada 3** — porque dependem:

4. **Hierarquia do Financeiro e do Hoje.** Decidir o que é primeira leitura
   exige saber quais números vão existir.
5. **O lugar da taxa.** Onde a história do dinheiro se completa.
6. **Consistência de período e de meio de pagamento.**

**Não faria agora:** redesenho visual. O produto não tem problema de estilo —
tem problema de **quantidade e de nome**, e os dois se resolvem decidindo, não
desenhando.

---

## A regra que esta frente adota

> O produto precisa contar a mesma história em três níveis:
> **fato → número → interface.**
> Se um deles divergir, ainda não terminamos.

E a restrição que a protege:

> **UI/UX não altera o modelo financeiro para fazer a tela parecer certa.**
> Ela consome os fatos.

---

*Auditoria de 17/08/2026, sobre `f93edd9`. Nenhuma alteração de código.*
