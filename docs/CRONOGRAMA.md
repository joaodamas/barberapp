# Cronograma — JP Barber

> Estado em 18/08/2026 · `hardening/p0-2026-08-17` em `9559d4b`
> Cada linha tem **evidência verificável**. Nenhuma vem de memória.

## A convenção — e por que ela vale para todas as frentes

O fechamento do INFRA-02 estabeleceu a regra certa:

> **Frente fechada ≠ assunto encerrado.** Uma frente fecha quando o território
> dela foi entregue. O que sobrou fora daquele território é **residual**, e fica
> visível até alguém assumi-lo.

Isso existe para impedir o erro que o projeto vem tentando eliminar: chamar algo
de "100%" quando há parte conhecida fora do escopo do commit.

**Aplicando a regra com honestidade, três frentes marcadas como "em andamento"
estão na verdade fechadas — com residual.** Elas terminaram e foram integradas;
o que ficou não é trabalho pendente delas, é trabalho que nasceu delas.

---

## Situação por frente

| Fase | Frente | Status | Evidência | Residual |
|---|---|---|---|---|
| G1 → G1.7 | Motor financeiro / fatos | ✅ **fechado** | — | — |
| 3.1 | Comissão de produto | ✅ **fechado** | `f79dd78` | — |
| 3.1 | Estornos / reversões | ✅ **fechado** | `32a6f1a` | — |
| 3.1 | `cash_entries` | ✅ **fechado** | `0fc75ae` | D24 · `expenses` sem idempotência |
| 3.2 | Fórmulas financeiras | ✅ **fechado** | `52e015e` | — |
| 3.2 | Reconciliação com ledger | ✅ **ZERO** | `52e015e` | — |
| UI/UX | Design System | ✅ **base entregue** | — | adoção transversal |
| UI/UX | Navegação | ✅ **fechado** | `fb44f1c` | — |
| **FIN-02** | Auditoria semântica do CMV | ✅ **fechado** | `5fdce79` | achados migrados p/ FIN-04 |
| **UX-05** | Vocabulário / microcopy | ✅ **fechado** | `fb44f1c` + `5840790` | Q15 · Q20 · Q21 |
| **DENSITY-01** | Densidade / hierarquia | ✅ **fechado** | `123c0f8` + `454a7d1` | — |
| **D31** | Soma do caixa de hoje | ✅ motor · 🟡 tela | `843b84c` | tela não consome `naoInformado` → FIN-04 |
| INFRA-01 | Tenant indisponível (D30) | ✅ **fechado** | `611017c` + `0ea7197` | — |
| INFRA-02 | Estados de falha (Q6–Q10) | ✅ **fechado** | `9559d4b` | Q9 · 5 telas FIN-04 · `<title>` |
| **FIN-03** | Comissão e mensalista | 🔴 **bloqueado** | — | **aguarda D1 e D2** |
| **FIN-04** | Grandezas e totais sob falha | 🔴 **bloqueado** | — | **aguarda D3 e D4** |
| QA-02 | Consistência transversal | ⏳ aguardando | — | depende de FIN-03/04 |
| Mobile | Validação real | ⏳ **não validado** | medição no `GATE-DE-DECISAO` | precisa de aparelho |
| Identidade | Assinatura visual | ⏳ pendente | — | decisão sua |
| UX-AUDIT-FINAL | Ponta a ponta | ⏳ posterior | — | N7 não exercitada |
| Go-Live Readiness | Bateria final | ⏳ não iniciada | — | ver §4 |

### As três correções de status, com o residual nomeado

**FIN-02 fechou em `5fdce79`.** Entregou o detalhamento do CMV que explica a
conta e fecha com o cabeçalho — verificado na tela em 18/08: `3 un. × R$ 24,00 =
R$ 72,00` menos `Devolução −R$ 24,00` = `R$ 48,00`. *Residual:* a auditoria
semântica dele apontou itens que caem no território do FIN-04, não no dele.

**UX-05 fechou em `fb44f1c` + merge `5840790`.** Entregou o vocabulário
transversal e o `plural.ts`. *Residual, e é irônico:* dois lugares escritos
**depois** do `plural.ts` não o usam (`estornos.ts:133`, `desfazer-venda.tsx:186`
— Q20 e Q21), e o empty state que ele reescreveu afirma que os planos precisam
ser cadastrados quando eles existem (Q15).

**DENSITY-01 fechou em `123c0f8` + merge `454a7d1`.** Entregou a auditoria antes
do corte e removeu três duplicações literais. *Residual — **resolvido em
`843b84c`**:* a correção do D31 tinha ficado em `stash@{0}`, fora da branch,
tocando `analytics.ts` (arquivo bloqueado para aquela equipe). O stash foi
aplicado e removido; `git stash list` está vazio.

O que sobrou do D31 é menor e está nomeado: o motor calcula `naoInformado`,
**nenhuma tela o consome** — o bloco "Caixa de hoje" continua com três colunas, e
o atendimento sem meio informado segue invisível ali. Ligar isso é do FIN-04,
que já vai reescrever `painel/page.tsx` por causa do D3/D4.

---

## 1 · Onde o produto está — com uma ressalva

| Dimensão | Avaliação |
|---|---|
| **Arquitetura** do motor financeiro | ~95% |
| **Fatos** que o motor produz | **~80%** — ver ressalva |
| UI/UX estrutural | ~75–80% |
| Validação de experiência | ~60–70% |
| Go-Live | **não liberado** |

**A ressalva.** "Motor financeiro ~95%" descreve a *arquitetura*, e nela concordo:
congelamento, idempotência por id derivado, exclusividade por origem,
reconciliação em zero, custo médio ponderado — tudo verificado por execução.

Mas dois **fatos** que o motor grava estão errados, e não é apresentação:

- a comissão de serviço grava `commissionPct: 0` enquanto três telas prometem
  40%, e nenhuma tela grava o padrão da casa;
- o mensalista Ilimitado é cobrado de novo a cada corte, porque não existe
  representação para "coberto pelo plano".

Os dois adulteram **receita e folha** — as duas coisas que o dono confere no fim
do mês. Enquanto estiverem abertos, o motor sabe contar e está contando errado
em dois lugares. Por isso separo arquitetura de fatos: a primeira está em 95%,
a segunda não.

---

## 2 · O que está rodando agora

**Nada. Zero frentes ativas.**

As quatro equipes da última leva — FIN-02, UX-05, INFRA-01, DENSITY-01 —
terminaram e foram integradas. `git worktree list` mostra só a árvore principal.
O INFRA-02 fechou hoje.

**As duas próximas frentes estão bloqueadas por decisão sua**, não por
capacidade: FIN-03 espera D1 e D2; FIN-04 espera D3 e D4.

### O que pode andar sem decisão nenhuma

| Território | Itens | Por quê |
|---|---|---|
| **T-C** · afirmações sem fato | Q11–Q18 | contrariam contrato já escrito |
| **T-D** · escrita e formatação | Q19–Q22 | idem — inclui o residual do UX-05 |
| **T-E** · contradição visual | Q23–Q26 | idem |
| **residual INFRA** | `<title>` sob falha | não depende de FIN-04 |
| **residual DENSITY-01** | resolver o `stash@{0}` | só precisa da sua autorização |

São ~19 itens, todos em texto e apresentação, nenhum tocando motor financeiro.
Cabem em **uma** frente, não em quatro.

---

## 3 · Sequência

```
AGORA        ├─ você decide D1 · D2 · D3 · D4        (destrava FIN-03 e FIN-04)
             └─ opcional, em paralelo: UX-06 com os ~19 itens sem decisão

DEPOIS       1. FIN-03  comissão e mensalista          ← D1 · D2
             2. FIN-04  grandezas e totais sob falha   ← D3 · D4  (sozinho: analytics.ts)
             3. exercitar N7 + as 5 escritas restantes
             4. QA-02 transversal
             5. mobile em aparelho real
             6. sua avaliação da identidade
             7. UX-AUDIT-FINAL

ENTÃO        8. fechar decisões de modelo restantes (D5–D12)
             9. Go-Live Readiness
            10. limpar massa de teste
            11. Go / No-Go
```

**Nunca mais de duas frentes simultâneas.** A leva de quatro funcionou, mas três
das quatro entregaram menos do que relataram, e a QA registrou a baseline se
movendo três vezes sob os pés dela.

---

## 4 · Go-Live Readiness — o que a bateria precisa conter

Não iniciada. Registrado agora para não ser inventado na véspera.

**Bloqueia o Go-Live:**

```
□  D1 · D2 · D3 · D4 decididas e implementadas
□  nenhum caminho conhecido em que a tela afirme número que não é o fato
□  mobile verificado em aparelho real
□  N7 (área do cliente) exercitada de ponta a ponta
□  as 5 escritas restantes exercitadas
□  stash@{0} resolvido — a branch descreve o produto
□  QA-02 e UX-AUDIT-FINAL executados, com achados P0 zerados
□  massa de teste removida do ambiente de produção
□  provisionamento real conferido: uma barbearia nova nasce com `policies`  ← §5
□  o script de semeadura grava `policies` — senão a auditoria segue cega ao §5
```

---

## 5 · O blocker de provisionamento — medido, não estimado

Elevado a Go-Live blocker em 18/08. Como a classificação é alta, aqui está a
caracterização exata, com o que **não** é defeito separado do que é.

### O fato

`signUpBarbershop` (`functions/src/signup.ts:147`) cria o documento da barbearia
**sem o campo `policies`**. Não é parcial: o campo não existe.

A ironia está três linhas acima, no mesmo `tx.set`, onde `features` é gravado com
esta justificativa:

> *"Gravado explicitamente: quando o campo falta, o leitor do servidor precisa
> adivinhar — e adivinhava liberando tudo, de graça e para sempre, em toda
> barbearia criada por aqui."*

**A mesma classe de defeito foi corrigida para `features` e deixada em
`policies`.**

### O que eu disse antes e estava errado

Eu supus que as **taxas de maquininha** sofreriam do mesmo problema. **Não
sofrem.** `DEFAULT_PAYMENT_FEES` no web é `{0, 0, 0, 0}`, e é decisão declarada:

> *"Taxa é contrato de cada barbearia com a maquininha dela; chutar uma média de
> mercado faria o DRE debitar dinheiro que talvez não seja cobrado. Zero é
> honesto: até o dono preencher, o sistema não inventa custo."*

O servidor também usa `SEM_TAXA` = zero. **Os dois lados concordam.** Nenhuma
divergência aqui.

O mesmo vale para `openWeekdays`, `booking.*` e `reschedule.*`: o servidor tem
fallback inline (`?? 60`, `?? 3`, `?? 6`, `?? 2`, `?? [1..6]`) que coincide com o
padrão do web.

### O que É defeito — um campo, e é o que paga o barbeiro

**`commissionSplit.barberPct` é o único que diverge.**

```
web       tenant.ts:308 → PLATFORM_DEFAULT_POLICIES → business-rules:138 → 40
servidor  financial-events.ts → policies.commissionSplit?.barberPct || 0 →  0
```

E agrava: atinge **as duas** comissões, não só a de serviço.

| Onde | Leitura | Resultado sem `policies` |
|---|---|---|
| Serviço | `financial-events.ts` | **0%** — tela de Equipe diz "padrão da barbearia (40%)" |
| Produto | `inventory.ts:629` — `vendedor.commissionPct ?? politicas…barberPct \|\| 0` | **0%** para quem está no padrão da casa — simulador da Loja diz "40% do lucro" |

No teste de 18/08 a comissão de produto saiu correta (R$ 21,00) **porque vendi
com o Léo, que tem 50% próprio**. Com o Rafael, que está no padrão da casa, teria
saído zero — como saiu nos dois atendimentos de serviço dele.

### Por que é Go-Live blocker e não P0 comum

Não é caso antigo nem inconsistência visual. É:

```
barbearia nova → cadastro pelo produto → policies ausente
              → comissão de serviço 0%  ·  comissão de produto 0%
              → e as telas continuam prometendo 40%
```

**Toda barbearia que entrar pela porta da frente nasce com o defeito**, e o
ambiente auditado não o exibia só porque o script de semeadura também não grava
`policies` — a auditoria e a produção compartilham a mesma cegueira.

### O que falta decidir (D1) e o que não falta

**Não precisa de decisão:** que web e servidor leiam a mesma fonte, e que o
provisionamento grave `policies` explicitamente como já faz com `features`.

**Precisa de decisão sua:** qual é o percentual padrão da casa, e em que tela o
dono o altera — hoje o campo é lido por três telas e escrito por nenhuma.

**Não bloqueia, mas deve estar decidido e escrito:** vitrine pública (D8), tela
de cadastro de plano (D9), ficha do cliente (D7), enumeração de e-mail no login
(D12).
