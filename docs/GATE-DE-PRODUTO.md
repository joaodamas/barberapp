# Gate de produto — antes do UX-AUDIT-FINAL

> Auditoria **somente de leitura**, 18/08/2026, sobre `hardening/p0-2026-08-17`
> em `2ed654d`. **Nenhuma linha de código alterada. Nenhum commit. Nenhum agent.**

Objetivo: descobrir o que precisa ser **decidido** ou **exercitado** antes de
gastar uma rodada de agentes numa experiência cujo comportamento ainda pode
mudar.

---

# 1 · C.1 — DECISÕES FINANCEIRAS PENDENTES

Decisões que alteram o **significado** de receita, caixa, DRE, comissão,
mensalidade, estorno ou despesa. Não escolhi nenhuma.

---

### C.1.1 · Mensalista: a mesma pessoa fatura duas vezes no mesmo mês

*(já registrado como **D18** em `BACKLOG-FASE-3.md:104` — confirmo que segue
integralmente aberto, e trago o que a leitura de hoje acrescenta)*

**Estado atual, verificado no código:**

- `BookingDoc` **não tem** `subscriptionId` nem qualquer marca de mensalista.
- `functions/src/booking.ts` **não menciona** assinatura em lugar nenhum; o valor
  da reserva é sempre a soma dos preços dos serviços (`value += s.price`).
- `web/src/app/(cliente)/agendar/page.tsx` **não menciona plano** em lugar nenhum.
- `PlanDoc.unlimited` existe e é lido por **um** lugar no produto inteiro:
  `(cliente)/planos/page.tsx:110`, para desenhar um rótulo.

**A cadeia real:**

```
mensalista paga R$ 149  →  invoice paga  →  payments{origin:"mensalidade"} R$ 149
      o mesmo mensalista corta  →  booking.value = 50  →  completed
                                 →  payments{origin:"servico"} R$ 50
```

`receitaDeMensalidade` lê o primeiro. `receitaDeServico` lê o segundo. **Os dois
entram no DRE.** Um mensalista de R$ 149 com dois cortes no mês vira R$ 249 de
receita realizada — numa barbearia que recebeu R$ 149.

**O que a leitura de hoje acrescenta ao D18:** não é só receita inflada.
`materializeFinancialsOnCompletion` grava também `commissions/comissao_{bookingId}`
sobre esse valor cheio. **A comissão é paga sobre receita que não existe** — e
essa parte é dinheiro que de fato sai da barbearia. O D18 estava classificado
como erro de receita; ele é também erro de folha.

**Impacto:** cresce linearmente com o número de mensalistas. Numa barbearia com
20 mensalistas é o maior erro do modelo financeiro. E contamina DRE, 6 visões,
indicadores, projeção e o acerto com o profissional.

**Opções:**

| | Desenho | Consequência |
|---|---|---|
| **a** | Reserva de mensalista nasce com `value = 0` e marca de cobertura | Receita fica só na mensalidade. **A comissão do barbeiro vai a zero** — precisa de regra própria de rateio da mensalidade |
| **b** | Reserva mantém valor cheio; a receita de serviço do mensalista é **deduzida** como linha assinada, igual à devolução | Mantém a base de comissão. Exige uma linha "coberto pelo plano" no DRE |
| **c** | Mensalidade deixa de ser receita e vira **adiantamento**; a receita é reconhecida a cada atendimento | Modelo mais correto contabilmente, o mais caro de implementar, muda o significado de `receitaDeMensalidade` |

**Minha recomendação: (b).** É a única que preserva a base de comissão sem
inventar regra de rateio, e reaproveita exatamente o mecanismo de dedução
assinada que o CMV e a devolução já provaram na tela. **Não implementei.**

---

### C.1.2 · Desfazer uma conclusão **apaga** o pagamento e a comissão

**Estado atual:** `financial-events.ts` — quando a reserva sai de `completed`
para um estado operacional, `decidirEfeito` devolve `"reverter"` e o gatilho faz
`comissaoRef.delete()` e `pagamentoRef.delete()`.

**A tensão:** sua regra do D22/D23 é literal — *"nada de apagar ou sobrescrever o
fato original"*, *"um estorno não pode ser implementado como delete"*. Aqui um
fato financeiro é apagado sem deixar rastro.

**O argumento a favor do desenho atual**, que está escrito no código: não é
estorno, é **correção de um clique errado**. Concluir por engano e não ter volta
deixaria comissão a pagar e receita fantasma sem caminho de saída pela interface.

**Impacto:** hoje é impossível distinguir "nunca foi concluído" de "foi concluído
e desfeito". Não há `audit_log` desse evento — a coleção existe e este caminho
não a usa.

**Opções:** (a) manter o delete e registrar em `audit_log`; (b) marcar como
revertido em vez de apagar, e excluir revertidos da leitura; (c) manter como está.

**Recomendação: (a).** É a mais barata e resolve o que de fato falta — a
rastreabilidade —, sem transformar correção de clique em estorno.

---

### C.1.3 · "Ticket médio" tem três definições

Detalhado em `UX-BASELINE-1.0.md` A4. R$ 47,50 (cardápio) · R$ 50,00
(serviço ÷ atendimentos) · R$ 180,29 (caixa de todas as origens ÷ atendimentos de
serviço). É a decisão que também destrava A5 (Projeção) e A7 (Caixa de hoje).

**Recomendação:** duas métricas com **nomes distintos** — "ticket de serviço" e
"ticket com produto". O motor já tem `avgTicketComProduto`. O nome único com
três valores é o que produziu os três defeitos.

---

### C.1.4 · `expenses` continua sem congelamento e sem idempotência

O **D24**, registrado como dívida consciente no fechamento do `cash_entries`.
`expenses` é a única coleção financeira ainda escrita pelo cliente
(`firestore.rules:256` — `allow read, write: if isOwnerOf`), sem id derivado do
fato. Duplo clique cria dois lançamentos.

**Impacto:** é justamente a coleção cuja falha inverte o resultado do mês (A1).

**Recomendação:** entra na mesma frente do A1/A2, não antes.

---

### C.1.5 · Imposto incide sobre faturamento bruto, inclusive o estornado

Observado na tela: `(−) Impostos (Simples, 6% sobre o faturamento) R$ 8,40` com
receita realizada de R$ 140,00 — ou seja, calculado sobre R$ 140. Com devolução
de R$ 45 no mês, a base do imposto já é líquida da devolução.

**Não classifiquei como defeito** porque a base correta do Simples depende do
regime e do momento do fato gerador, e isso é decisão sua com o contador. Só
registro que a escolha existe e hoje é implícita.

---

# 2 · C.2 — DECISÕES DE PRODUTO / EXPERIÊNCIA PENDENTES

Separadas conforme sua regra.

## 2.1 · BUG evidente — pode corrigir

Comportamento objetivamente errado contra contrato já escrito. **17 itens**, já
detalhados no backlog P0/P1 de `MAPA-DE-MATURIDADE-UI-UX.md`:

`A3` marca errada no login · `A8` empty state afirmando que não há planos ·
`A9` barra verde sob "no vermelho" · `A19` atalho contradizendo o destino ·
`A13` `A14` `A15` `A16` afirmações sem fato em Números · `A6` simulador
divergindo a 0% · `A17` ocupação 0% com atendimento · `A10` separador decimal ·
`A11` `A12` concordância · `A21` "+0 novos" · `A18` 404 preto e em inglês.

Nenhum toca motor financeiro.

## 2.2 · Inconsistência — propor, não implementar

| | O quê | Proposta |
|---|---|---|
| **A1/A2** | Total exibido quando a fonte falhou | **Suprimir o número**, não acrescentar aviso ao lado dele. Um número apagado faz o dono perguntar; um número errado faz o dono decidir |
| **A5** | Projeção confirma bruto de serviço e estima líquido de todas as origens na mesma coluna | Decorre de C.1.3 |
| **A7** | "Caixa de hoje" só lê reservas | Decorre de C.1.3 |
| **A23** | Falta confirmada continua na previsão do dia | `no_show` continua ocupando a cadeira e **sai** da previsão |
| **P11** | Carregamento é spinner; o contrato §7 pede esqueleto | Vale a frente própria — afeta toda entrada no produto |

## 2.3 · Decisão de produto — NÃO implementar

`P1` não existe vitrine pública · `P2` nenhuma tela cadastra plano · `P3–P8`
densidade (mapa de calor, régua de cobrança, KPIs zerados, produto listado duas
vezes, margem −550%, projeção partindo de saldo zero) · `P9` login informa se o
e-mail existe · `P10` sessão perdida é silenciosa · a grade de KPIs abrindo sete
telas iguais.

---

# 3 · FLUXOS PONTA A PONTA

Auditados sem modificar código.

---

## Fluxo 1 · Cliente → Agendamento → Atendimento → Pagamento → Receita

| | |
|---|---|
| **Nasce** | `createBooking` (cliente) ou `createBookingAtCounter` (balcão, só owner/staff) |
| **Persiste** | `bookings` |
| **Vira fato financeiro** | `materializeFinancialsOnCompletion` — gatilho em `status → completed`. Grava `payments/pagamento_{bookingId}` e `commissions/comissao_{bookingId}`, com `commissionPct`, `commissionBase` e `feePct` **congelados**. Id derivado da reserva: idempotente por construção |
| **Lido** | `receitaDeServico`, `comissoesDeServico`, `caixaDoDia`, `caixaDiario`, `projecaoDeCaixa` |
| **Tela** | `/agendar` (cliente) · `/painel` (Hoje) para concluir |
| **Erro** | `ErroAoCarregar` presente no painel |
| **Vazio** | agenda do dia vazia, com estado próprio |

**Saltos encontrados:**

- **A7** — o pagamento existe e **não aparece** no bloco "CAIXA DE HOJE", porque
  `caixaDoDia` recebe só reservas. Verificado na tela: `Cartão R$ 0,00` num dia
  com R$ 130,29 no cartão.
- **A23** — `no_show` sai do recebido e **fica** na previsão do dia.
- **C.1.2** — desfazer a conclusão apaga os dois documentos sem rastro.

**🟡 parcialmente confiável.** O motor congela corretamente; a leitura na tela
Hoje é incompleta e a reversão é silenciosa.

---

## Fluxo 2 · Cliente → Plano → Assinatura → Fatura → Pagamento → Receita

| | |
|---|---|
| **Nasce (plano)** | **Nenhuma tela.** `plans` só é escrita por script de semeadura |
| **Nasce (assinatura)** | `criarMensalista`, chamada por `gerir-mensalistas.tsx:84`. Só o dono — o cliente em `/planos` só recebe um link de WhatsApp: *"Fale com a barbearia no balcão para assinar"* |
| **Fatura** | `gerarFaturasDoMes` (botão manual "Emitir mensalidades de…") e `revisarAssinaturas` (agendada) → `subscription_invoices`, `amount` congelado na emissão |
| **Pagamento** | `registrarPagamentoDeMensalidade` → grava `payments{origin:"mensalidade"}` **na mesma transação** que marca a fatura como paga. Fatura já paga devolve o que está lá sem reescrever |
| **Lido** | `receitaDeMensalidade` |
| **Tela** | `/painel/mensal` |
| **Erro** | `ErroAoCarregar` presente |
| **Vazio** | ❌ **A8** — afirma que os planos precisam ser cadastrados **enquanto dois planos ativos existem**, e o modal ao lado os oferece |

**Saltos encontrados:**

- **C.1.1 / D18** — o corte do mensalista vira receita de serviço cheia **e**
  comissão, além da mensalidade. Dupla contagem de receita e comissão sobre
  receita inexistente.
- **Nenhuma tela cria plano.** O primeiro elo da cadeia não tem interface.
- **O cliente não assina sozinho.** O fluxo sai do produto e volta por WhatsApp.
- Mensalidade **não gera comissão própria** — a remuneração do barbeiro pelo
  atendimento do mensalista existe apenas como efeito colateral do D18.

**🔴 não confiável.** É o único fluxo em que o erro é de modelo, não de
apresentação — e é o que mais contamina o DRE.

---

## Fluxo 3 · Produto → Estoque → Venda → Pagamento → Receita → CMV → Comissão

| | |
|---|---|
| **Nasce (entrada)** | `registrarEntradaDeEstoque` ← `entrada-de-estoque.tsx` → `inventory_movements{kind:"compra"}` |
| **Nasce (venda)** | `registrarVendaDeProduto` ← `vender-produto.tsx` → `inventory_movements{kind:"venda"}` + `payments{origin:"produto"}` + `commissions{origin:"produto"}`, com `unitCost` e `unitPrice` **congelados** |
| **Lido** | `receitaDeProduto` · `detalheDoCustoDoVendido` · `comissaoDeProduto` · `movimentosDeCaixa` (origens `produto` e `compra`) |
| **Tela** | `/painel/loja` |
| **Erro** | `ErroAoCarregar` presente |
| **Vazio** | presente |

**Verificado na tela hoje:** o CMV fecha (54,00 − 18,00 = 36,00) com unidade
declarada, e o simulador usa o padrão da casa. **O motor deste fluxo é o mais
maduro do produto.**

**Salto encontrado:** **A7** — a venda não aparece no "Caixa de hoje".

**Ressalva de escopo:** o decremento de estoque na venda **não foi verificado**
nesta sessão (a semeadura escreveu movimentos direto, sem passar pelo caminho de
escrita). Não afirmo nem nego.

**🟡 parcialmente confiável.** Motor 🟢; leitura no Hoje incompleta; estoque não
exercitado.

---

## Fluxo 4 · Venda → Estorno → Estoque → Receita → CMV → Comissão

| | |
|---|---|
| **Nasce** | `registrarEstorno` (só owner) ← `desfazer-venda.tsx` e `estornar-valor.tsx` |
| **Persiste** | `refunds/estorno_venda_{movementId}_{chave}` + `inventory_movements{kind:"ajuste", refundOf}` + comissão de estorno. Id derivado do fato: idempotente. **O fato original permanece** |
| **Lido** | `estornosDoPeriodo` · `detalheDoCustoDoVendido` (devolução como linha assinada) · `movimentosDeCaixa{origem:"estorno"}` |
| **Tela** | `/painel/loja` e o modal de devolução |
| **Erro / Vazio** | presentes |

**Verificado na tela hoje:** o modal declara os quatro efeitos antes de executar
e afirma explicitamente *"A venda original continua no histórico — o estorno é um
registro novo, não um apagamento"*. A devolução aparece no DRE como
`−R$ 18,00` assinado dentro do CMV, e o imposto **não** volta.

**Defeitos:** só de escrita — **A11** "1 un. já voltaram" e **A12** "1 de 3
devolvida".

**🟢 confiável.** É o fluxo mais bem construído do produto e o padrão a copiar.

---

## Fluxo 5 · Caixa sem fato → `cash_entries` → Fluxo

| | |
|---|---|
| **Nasce** | `registrarMovimentoDeCaixa` (só owner) ← `livro-caixa.tsx:108` |
| **Persiste** | `cash_entries/caixa_{chave}`. Tipo é **enum fechado** (`sangria`, `troco_inicial`, `aporte`, `pagamento_comissao`, `ajuste`) — exclusividade por construção, não por validação de string |
| **Regra** | `firestore.rules` — `allow read: if isOwnerOf; allow write: if false`. Só o servidor escreve |
| **Lido** | `movimentosDeCaixa{origem:"caixa"}` |
| **Tela** | bloco "LIVRO CAIXA" dentro de `/painel/financeiro/fluxo-caixa` |
| **Exclusividade** | ✅ verificada: `cash_entries` **não** aparece em nenhum ponto da tela do DRE. Caixa e competência seguem separados |

**Verificado na tela hoje:** o bloco declara o que **não** mostra — *"Atendimentos,
vendas e mensalidades já entram pelo próprio pagamento e não são lançados aqui"*.

**Salto:** nenhum encontrado na leitura.

**🟡 parcialmente confiável — por falta de exercício, não por defeito.** O
desenho é o melhor do produto; **nunca foi exercitado com um lançamento real**
(N8). Vi ENTROU/SAIU/SALDO todos em R$ 0,00.

---

## Fluxo 6 · Despesa → Pagamento → Fluxo → DRE

| | |
|---|---|
| **Nasce** | **Escrita direta do cliente** em `expenses`. Único fluxo financeiro sem função de servidor. É o **D24**, dívida consciente |
| **Lido** | DRE (`Despesas Fixas (recorrentes)` e `Operacionais Eventuais`) · Fluxo (`origem:"despesa"`) · Projeção (`despesasRecorrentesVigentes`) |
| **Tela** | `/painel/financeiro/despesas` |
| **Erro** | ⚠️ existe **na tabela** e não nos agregados |
| **Vazio** | presente |

**Verificado na tela hoje:** R$ 800,00 aparece coerente nos três destinos — DRE
como custo fixo, Fluxo como saída, Projeção como compromisso recorrente. A
projeção usa `despesasRecorrentesVigentes`, que já corrige o defeito de cobrar
seis vezes o mesmo aluguel depois de seis meses de uso.

**Saltos encontrados:**

- **A1** — com `expenses` ilegível, o DRE mostra **lucro de R$ 30,39** onde há
  **prejuízo de R$ 769,61**. Medido nos dois estados, com R$ 800,00 de
  diferença.
- **A2** — Despesas afirma "0 lançamentos" e R$ 0,00 em quatro KPIs.
- **C.1.4** — sem idempotência: duplo clique cria dois lançamentos.

**🔴 não confiável.** É o caminho pelo qual o produto inverte o sinal do
resultado do mês.

---

# 4 · N7 / N8 — ÁREA DO CLIENTE E FLUXOS DE ESCRITA

## Veredito: **NÃO ESTÃO SUFICIENTEMENTE EXERCITADOS.**

**Não faça o UX-AUDIT-FINAL ainda.** O percurso que ele audita —
`abrir → onde estou → executar uma tarefa → entender o resultado → entender o
dinheiro → próximo passo` — tem a etapa **"executar uma tarefa"** inteiramente
sem evidência. Auditar assim cobriria metade das setas.

### O que falta exercitar — lista exata

**Escrita (N8) — nenhuma foi executada até hoje:**

| # | Ação | Função | Tela |
|---|---|---|---|
| 1 | Marcar atendimento pelo balcão | `createBookingAtCounter` | Hoje |
| 2 | Concluir atendimento informando o meio de pagamento | gatilho de materialização | Hoje |
| 3 | Desfazer uma conclusão | `decidirEfeito → "reverter"` | Hoje |
| 4 | Vender produto | `registrarVendaDeProduto` | Loja |
| 5 | Dar entrada de estoque | `registrarEntradaDeEstoque` | Loja |
| 6 | Devolver venda, parcial e total | `registrarEstorno` | Loja |
| 7 | Lançar despesa | escrita direta | Despesas |
| 8 | Registrar movimento no livro caixa | `registrarMovimentoDeCaixa` | Fluxo |
| 9 | Contratar mensalista | `criarMensalista` | Mensalistas |
| 10 | Emitir faturas do mês | `gerarFaturasDoMes` | Mensalistas |
| 11 | Registrar pagamento de mensalidade | `registrarPagamentoDeMensalidade` | Mensalistas |
| 12 | Alterar taxa e tolerância | escrita direta | Ajustes |

**Área do cliente (N7) — nunca aberta com sessão de cliente:**

`/` · `/agendar` (o fluxo mais importante do lado do cliente) · `/reservas` ·
`/planos` · `/perfil`

**E o que cada escrita precisa responder** — é a seta "executar → entender o
resultado", que nenhuma passada mediu:

> Depois de concluir a ação, o dono **viu o que mudou** — ou só sumiu o modal?

**Observação de método:** os itens 9, 10 e 11 exercitam justamente o fluxo 🔴 do
mensalista. Executá-los **antes** de decidir C.1.1 produziria dados com dupla
contagem no ambiente, e o UX-AUDIT-FINAL leria uma receita que a decisão vai
mudar. **C.1.1 vem antes.**

---

# 5 · CONFIANÇA POR FLUXO

Nenhuma classificação abaixo usa build verde ou teste unitário como evidência.

| Fluxo | Confiança | O que decide a nota |
|---|---|---|
| **4 · Venda → Estorno** | 🟢 **confiável** | Fato original preservado, idempotente, devolução visível como dedução assinada, modal declara os efeitos antes de executar. Só defeitos de escrita |
| **1 · Agendamento → Receita** | 🟡 **parcial** | Motor congela certo; Hoje não mostra o caixa inteiro (A7); falta fica na previsão (A23); reversão apaga sem rastro |
| **3 · Produto → CMV → Comissão** | 🟡 **parcial** | Motor é o mais maduro e verificado na tela; A7; decremento de estoque não exercitado |
| **5 · Caixa sem fato** | 🟡 **parcial** | Desenho excelente e exclusividade verificada; **zero exercício real** |
| **6 · Despesa → Fluxo → DRE** | 🔴 **não confiável** | Inverte o sinal do resultado quando a leitura falha (A1); afirma zero (A2); sem idempotência (D24) |
| **2 · Plano → Fatura → Receita** | 🔴 **não confiável** | Dupla contagem de receita e comissão sobre receita inexistente (D18); primeiro elo sem tela; vazio afirmando o falso (A8) |

---

# 6 · GATE

# NÃO PODE IR PARA UX-AUDIT-FINAL

## Os 5 bloqueadores reais, por impacto

### 1 · C.1.1 / D18 — dupla contagem do mensalista, e comissão sobre receita que não existe
Decisão de **modelo**, não de tela. Enquanto estiver aberta, o UX-AUDIT-FINAL
avaliaria a seta "entender o dinheiro" sobre um DRE cujo significado vai mudar —
e qualquer tela de Mensalistas polida agora seria refeita. É o único bloqueador
em que o produto perde dinheiro de verdade, via folha.

### 2 · C.2 / A1 e A2 — o produto inverte o sinal do resultado quando não consegue ler
Medido nos dois estados: **+R$ 30,39** contra **−R$ 769,61**, R$ 800,00 de
diferença, com o banner de erro visível na mesma tela. A decisão pendente é uma
só e é sua: **suprimir o total, ou exibi-lo marcado**. Não é auditável como
experiência enquanto não estiver decidida.

### 3 · N7 / N8 — metade do percurso nunca foi exercitada
12 ações de escrita e 5 rotas do cliente sem uma única evidência. A seta
"executar uma tarefa → entender o resultado" é o coração do UX-AUDIT-FINAL, e
hoje não há nada para auditar nela.

### 4 · C.1.3 — "ticket médio", "receita" e "caixa" sem definição única
Três valores sob o mesmo nome. Uma auditoria de coerência que encontrasse isso
registraria como achado o que já é decisão pendente — e é justamente o risco que
este gate existe para evitar.

### 5 · A22 — a branch não contém uma correção reportada como feita
`stash@{0}` com `analytics.ts` (+28, campo `naoInformado` do D31) e
`densidade.test.ts` (+59). Enquanto estiver fora, a base auditada não é a base
real.

---

## A ordem que destrava

```
1.  você decide  C.1.1  ·  C.2 (A1/A2)  ·  C.1.3  ·  C.3 (stash)
2.  as 17 correções ÓBVIAS entram, com teste, e inspeção visual das visuais
3.  exercitar as 12 escritas e as 5 rotas do cliente  (N7/N8)
4.  QA-02 — "parece ter sido feito pela mesma equipe?"
5.  UX-AUDIT-FINAL — "entrega a experiência pedida?"
6.  mobile em aparelho real
7.  revisão sua da identidade → UX POLISH 1.0
```

Os passos 2 e 3 podem correr juntos: exercitar as escritas **é** o que produz a
evidência de que as correções funcionaram. Nenhum dos dois precisa de agent novo.

---

## O que este gate NÃO encontrou

Registro pelo mesmo critério que o resto: ausência de evidência não é aprovação,
mas ausência de achado depois de procurar vale ser dita.

- **Exclusividade entre origens de pagamento está íntegra.** `servico`, `produto`
  e `mensalidade` não se sobrepõem em `payments`. A dupla contagem do D18 não
  vem de duas coleções somadas — vem de **dois fatos legítimos para um evento
  econômico só**, que é um problema de modelo e não de leitura.
- **`cash_entries` não vaza para o DRE.** Caixa e competência seguem separados.
- **Congelamento está consistente** em pagamento, comissão, fatura, custo e preço
  unitário.
- **Idempotência por id derivado** está em todos os fluxos de servidor. A única
  exceção é `expenses` — o D24, já conhecido.
