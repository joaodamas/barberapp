# R1 · "Veio depois" — o caminho que apaga a correção

> Auditoria **somente leitura**. Nenhum arquivo de código, teste, regra ou
> script foi tocado. Este documento é a única escrita.
> Marcação: **[Ó]** lido no código · **[J]** julgamento · **[NV]** não verificado.

---

# 1 · Commit-base

```
git log --oneline -1        →  659091a A lente de confiança entra no handoff (#19)
git merge --ff-only hardening/p0-2026-08-17
git log --oneline -1        →  3f460e2 docs(changelog): 18/08 — o R1, e o dia em que a pergunta mudou três vezes
```

**Base desta auditoria: `3f460e2`.** Todos os números de linha abaixo são deste
commit — e vários **não** batem com os do briefing, que foi escrito em `a910570`.
As três divergências que importam:

| Citado no briefing | Onde está em `3f460e2` |
|---|---|
| `page.tsx:691` — botão "Veio depois" | **`page.tsx:708-718`** (`:691` hoje é a coluna "Pagamento") |
| `page.tsx:607` — `podeConcluir` | **`page.tsx:633`** |
| `page.tsx:316` — `executarIntencao` sem checagem | **`page.tsx:314-344`, e a checagem existe agora** (`:342`) |

`financial-events.ts` não se moveu: `:284`, `:386`, `:387`, `:393`, `:421-434`,
`:513` estão exatamente onde o briefing diz. **[Ó]**

---

# 2 · Resposta curta às oito perguntas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Correção pode ser apagada? | **Sim.** E não são "os quatro campos": o `PaymentDoc` inteiro é deletado e um documento novo nasce no lugar |
| 2 | Id do novo `PaymentDoc` | **O mesmo** — `pagamento_{bookingId}` nos dois lados. O histórico é **sobrescrito**, não duplicado |
| 3 | Comissão recalculada? | **Sim, integralmente do cadastro de hoje.** `commissionPct` do `staff` agora, `commissionBase` do `booking.value` agora. P1-7 confirmado |
| 4 | `audit_log` sobrevive? | **Sobrevive intacto**, e passa a descrever um pagamento com outros valores — ou nenhum pagamento |
| 5 | Cobertura pode virar? | **Sim, nas duas direções.** E `plano` significa `pagamentoRef.delete()`: a receita **some** |
| 6 | Terceiro método | Estado final **consistente e errado**: booking e payment concordam no método novo. O invariante do R1 **não é violado** — ele é satisfeito em torno do valor que apagou a correção |
| 7 | A ordem importa? | **Sim.** `corrige → Veio depois` destrói; `Veio depois → corrige` preserva o método (mas não a comissão) |
| 8 | Invariante `completed→completed` | **Existe** (`:284`), **é testado com nome** (2 suítes). Se materializasse: apaga toda correção, descongela toda comissão **e o trigger deixa de terminar** |

---

# 3 · MATRIZ DE COMPORTAMENTO

Cenário-âncora: corte de R$ 50,00 com `b-rafael` (`commissionPct: null` → padrão
40%), taxas do seed (`dinheiro 0 · pix 0 · débito 1,99 · crédito 3,49`).
`T0 < T1 < T2` são instantes de gravação.

| # | Estado inicial | Ação | `payments/pagamento_{id}` | `commissions/comissao_{id}` | `bookings/{id}` | `audit_log` | `cobertura` |
|---|---|---|---|---|---|---|---|
| **A** | `confirmed` | **Concluir · Pix** (`page.tsx:226`) | **CRIADO** `{pix, gross 50, feePct 0, fee 0, net 50, createdAt T0, origin servico, paymentOrigin in_person}` `:513` | **CRIADO** `{pct 40, base 50, amount 20, cobertoPeloPlano false, createdAt T0}` `:472` | `status completed`, `paymentMethod pix` | — | **ESCRITA** pelo trigger `:471` |
| **B** | `completed` (A) | **Corrigir pagamento · Pix→Crédito** | **MESMO doc**, `tx.update` de 4 campos → `{credit, 3.49, 1.75, 48.25}`. `gross`, `date`, `createdAt T0`, `origin`, `paymentOrigin`, `clientId`, `bookingId` **idênticos** `:378` | **intocada** — o R1 não a lê nem a escreve | `paymentMethod credit` `:383` | **+1** `correcao_{id}_{chave}` com `de{pix,0,0,50}` / `para{credit,3.49,1.75,48.25}` `:390` | intocada |
| **C** | `completed` (B) | **→ `no_show`** · *sem botão*, escrita direta (`firestore.rules:246`) | **DELETADO** `:387` | **DELETADO** `:386` | `status no_show`, **`paymentMethod` continua `credit`** ⚠️ | **intacto** — nada é escrito aqui | **CAMPO APAGADO** `:393` |
| **D** | `no_show` (C) | **"Veio depois" · Dinheiro** (`page.tsx:708-718` → modal de conclusão) | **RECRIADO, MESMO ID** `{cash, gross = booking.value AGORA, feePct 0, fee 0, net 50, createdAt T2}` `:513` — `set` **sem merge** | **RECRIADO** com `staff.commissionPct` e `policies` **de hoje** `:421-441` | `status completed`, `paymentMethod cash` | **intacto e agora mentiroso**: diz `para: credit/1,75` sobre um doc que diz `cash/0,00` | **RE-DECIDIDA** com a cota de agora `:452-461` |
| **E** | `no_show` (C), cliente **com plano ativo agora** | **"Veio depois" · Concluir sem cobrar** (`page.tsx:871`) | **NÃO EXISTE** — `pagamentoRef.delete()` `:511-512`. R$ 50,00 somem de `payments` | **RECRIADO** com `cobertoPeloPlano: true` | `paymentMethod null` | **intacto**, apontando para `paymentId` **inexistente** | `{tipo: plano, usoNaCompetencia recontado}` |
| **F** | `no_show` (C), cliente **sem plano ativo agora** | **"Veio depois" · Concluir sem cobrar** | **CRIADO** `{paymentMethod null, feePct 0, fee 0}` — o **caso 1 do R1, recriado pelo botão** | RECRIADO, `cobertoPeloPlano false` | `paymentMethod null` | intacto | `{avulso, sem_plano}` |
| **G** | `no_show` | **"Veio depois" · Pix** → **depois** corrigir p/ Crédito | **CRIADO T2** e então **`update`** dos 4 campos → correção **sobrevive** | RECRIADO com cadastro de hoje — **o dano da comissão acontece igual** | `paymentMethod credit` | **+1** evento, coerente com o doc | re-decidida em T2 |
| **H** | `completed` | **Corrigir de novo, MESMA chave** | intocado — `logSnap.exists` devolve `repetida: true` `:322-340` | intocada | intocado | **nenhum evento novo** | intocada |
| **I** | `completed` | qualquer outra escrita em `bookings` (`cobertura`, reagendamento, nome) | intocado — `decidirEfeito("completed","completed") === "nada"` `:284` | intocada | muda só o que foi escrito | — | — |
| **J** | `completed` | `→ cancelled_by_shop` | **fica** — `"nada"` + `console.warn` `:404-410` | fica | `status cancelled_by_shop` | — | fica |

**Efeito colateral de fidelidade (linhas C e D):** `creditLoyaltyOnCompletion`
usa o **mesmo** `decidirEfeito` (`loyalty.ts:45`) — o carimbo é apagado em C
(`:63`) e recriado em D (`:48`). Id derivado (`credito_{bookingId}`), então não
duplica; só o `at` é re-carimbado. **[Ó]**

## 3.1 Os três achados da matriz que ninguém tinha escrito

**⚠️ 1 · A linha C deixa `bookings.paymentMethod` para trás.** A perna de
reversão apaga `cobertura` (`:393`) mas **não** limpa `paymentMethod`. Uma
reserva `no_show` fica com "Crédito" gravado e sem pagamento nenhum — e
`liquidacaoDoAtendimento` (`booking-status.ts:158`) exibe **"Crédito"** na coluna
Pagamento de uma linha "Não compareceu". É divergência booking×payment de manual,
criada pelo produto, exatamente aquela que a decisão B do R1 declara impossível.
Ela é transitória se o "Veio depois" vier em seguida — e permanente se ninguém
concluir de novo. **[Ó]**

**⚠️ 2 · O `grossAmount` recriado não é o congelado.** A rematerialização lê
`Number(depois.value)` (`:414`) — o valor da **reserva hoje**. O R1 faz o oposto
de propósito: lê `grossAmount` do **pagamento** e documenta por quê
(`correcao-de-pagamento.ts:356-362`). Se `booking.value` tiver sido editado entre
as duas conclusões, o "mesmo" pagamento renasce com outro bruto — e nada registra
a troca. **[Ó]**

**⚠️ 3 · A erosão não deixa rastro em lugar nenhum.** A reversão e a
rematerialização não escrevem em `audit_log`; o único aviso do arquivo é o
`console.warn` do ramo `"nada"` (`:404-410`), que não é este caminho. Como o id
do pagamento é o mesmo (§4.2), a contagem de documentos não muda, nada é
duplicado e nenhuma tela pode notar. **[Ó] + [J] sobre a consequência.**

---

# 4 · As oito perguntas, com evidência

## 4.1 Uma correção do R1 pode ser apagada? O que exatamente se perde?

**Sim — e o vocabulário do briefing subestima o que acontece.** Não é "os quatro
campos voltam". São duas escritas destrutivas em sequência:

```
completed → no_show    decidirEfeito → "reverter"        financial-events.ts:379
                       comissaoRef.delete()                                :386
                       pagamentoRef.delete()                               :387
                       reservaRef.update({cobertura: FieldValue.delete()}) :393

no_show → completed    decidirEfeito → "materializar"
                       lê policies e staff AGORA                      :421-434
                       pagamentoRef.set({ ... })  ← sem merge              :513
```

O `PaymentDoc` **deixa de existir** em `:387`. O `set` sem merge de `:513` é
irrelevante para a perda — quando ele roda o documento já morreu. O que renasce
tem exatamente os campos que `documentoDePagamento` produz mais `createdAt`
(`payments.ts:107-121`, `financial-events.ts:514-527`).

Perdem-se **os quatro** (`paymentMethod`, `feePct`, `feeAmount`, `netAmount`),
recalculados de `depois.paymentMethod` (`:415`) e da tabela de taxas de hoje
(`:433`). E, junto, três campos que o R1 declara **congelados**
(`correcao-de-pagamento.ts:86-89`):

| Campo | O que acontece |
|---|---|
| `createdAt` | novo `serverTimestamp()` — o fato é **re-datado** para o instante da reconclusão |
| `grossAmount` | recalculado de `booking.value` **de hoje**, não do bruto congelado |
| `paymentOrigin` | recopiado de `depois.paymentOrigin ?? null` → `"in_person"` |

Sobrevivem por coincidência (porque são recopiados iguais da reserva): `origin`,
`bookingId`, `clientId`, `date`. `date` vem de `depois.date` (`:417`), então
**nada atravessa mês** — a decisão R1.2 continua de pé mesmo aqui. **[Ó]**

`registradoPor`, `movementId`, `invoiceId` não existem em pagamento de serviço
(`grep` confirmou: `registradoPor` só em `caixa.ts:336`, `inventory.ts:659,833`,
`mensalistas.ts:583`, `refunds.ts:626`). `subscriptionId` é campo morto (D-d). **[Ó]**

## 4.2 O `PaymentDoc` renasce com que id?

**O mesmo.** As duas pontas derivam do `bookingId`:

```
financial-events.ts:374-376   db.doc(`barbershops/${barbershopId}/payments/pagamento_${bookingId}`)
correcao-de-pagamento.ts:297  idDoPagamento({ origem: "servico", bookingId })
payments.ts:50-52             if (ref.origem === "servico") return `pagamento_${ref.bookingId}`;
```

**Consequência decisiva: o histórico é sobrescrito, não acumulado.** Não nasce um
segundo documento, não fica órfão, a coleção não cresce. O teste
`correcao-transacao.test.ts:623` ("🔒 a contagem de documentos nunca cai") passaria
tranquilo neste caminho — a contagem realmente não cai, ela é **substituída**.
Depois de D, não existe no banco nenhum vestígio do documento anterior. O único
lugar onde os valores antigos continuam escritos é o `audit_log`, e só se uma
correção tiver acontecido. **[Ó]**

## 4.3 A comissão é recalculada? De onde vêm `commissionPct` e `commissionBase`?

**Do cadastro de hoje, os dois. É o P1-7, literal.**

```
:421-426   const [shopSnap, staffSnap] = await Promise.all([... .get(), ... .get()])
:428-434   policies → fees e padraoPct                       ← lidos AGORA
:441       commissionPctDoBarbeiro: staffSnap?.get("commissionPct") ?? null
:414       const valor = Number(depois.value) || 0           ← booking.value AGORA
:436-444   calcularEventoFinanceiro → commissionBase = valor, commissionAmount = valor × pct/100
```

O documento antigo é apagado em `:386` e **nunca é lido**. Nenhum campo do
congelamento anterior participa do novo cálculo. O comentário de `:419-420`
("Lidos AGORA e congelados: é este o ponto do arquivo inteiro") descreve
exatamente o problema: cada rematerialização é um congelamento **novo**, com o
cadastro do dia.

O sintoma que o próprio cabeçalho do arquivo usa como justificativa de existir
(`financial-events.ts:12-15`, *"o barbeiro renegocia de 40% para 50% em setembro
e o DRE de agosto passa a mostrar 50%"*) **acontece** por este caminho. **[Ó]**

**E é mais amplo que o R1:** não depende de correção nenhuma. Qualquer
`completed → no_show → completed` reescreve a comissão congelada, tenha havido
correção ou não. O R1 é vítima, não causa. **[J]**

## 4.4 O `audit_log` da correção sobrevive?

**Sobrevive, intacto.** Três razões independentes:

1. `firestore.rules:341-345` — `allow write: if false`, imutável inclusive para o dono;
2. o trigger financeiro toca só `commissions`, `payments` e o campo `cobertura` de
   `bookings` — `audit_log` não aparece em `financial-events.ts` em lugar nenhum;
3. o id é `correcao_{bookingId}_{chave}` (`correcao-de-pagamento.ts:250`), não colide com nada.

**Estado resultante — três desfechos, e nenhum é bom:**

| Desfecho | O log diz | O banco diz |
|---|---|---|
| **(a)** linha D | `de {pix,0,0,50}` → `para {credit,3.49,1.75,48.25}` | `pagamento_{id}` = `{cash,0,0,50}` |
| **(b)** linha E | ...idem, com `detail.paymentId` | **não existe documento com esse id** |
| **(c)** coincidência | ...idem | valores por acaso iguais — **indistinguível de (a)** |

O log passa a ser um registro verdadeiro sobre um mundo que foi desfeito.
Não há como, lendo só o banco, saber que a transição descrita foi revertida —
não existe evento de reversão em lugar nenhum. **[Ó] no mecanismo, [J] na leitura.**

**Achado que não estava em nenhum documento:** o `audit_log` é a **fonte de
idempotência do R1**. `gravarCorrecao` lê `logSnap.exists` **antes de qualquer
recusa** (`:322-340`) e devolve `repetida: true`. Depois do ciclo, uma rechamada
da callable com a **mesma chave** responde "pronto, já corrigido" sem tocar em
nada — descrevendo uma correção que foi apagada. Na tela isso **não** aprisiona o
dono: `corrigir-pagamento.tsx:63` gera chave nova a cada montagem do modal, e o
modal é montado condicionalmente (`page.tsx:818`). O risco vive num retry de rede
ou num script que reaproveite a chave. **[Ó] no código, [J] na gravidade — baixa.**

## 4.5 A cobertura do plano pode virar entre as duas conclusões?

**Pode, nas duas direções, e é o pior dos sete efeitos.**

O mecanismo é uma consequência direta do `FieldValue.delete()`:

```
:393        reserva perde o campo `cobertura`
:452-453    const cobertura = (depois.cobertura as Cobertura) ?? await resolverCobertura({...})
```

Como o campo foi apagado, o `??` **sempre** cai no `resolverCobertura`. E ele lê
dois retratos do presente:

```
:318-323   subscriptions where clientId == X and status == "ativo"   ← a assinatura de AGORA
:337-347   bookings do cliente, contando cobertura.tipo === "plano"
           na mesma competência                                      ← a cota de AGORA
```

O comentário de `:446-451` — *"Reprocessamento não redecide: a cobertura é
congelada como o percentual e a taxa"* — **é verdadeiro só para retry do trigger**.
Para o ciclo `no_show` ele é falso por construção, porque a perna anterior apagou
justamente o campo que o protegeria. **[Ó]**

**Direção 1 · avulso → plano** (assinatura reativada, ou a cota liberou porque
outro atendimento coberto foi revertido/cancelado no mês):
`coberto === true` → **`pagamentoRef.delete()`** (`:511-512`). O pagamento
corrigido **desaparece**. R$ 50,00 saem de `payments` e, com eles, as seis
leituras de dinheiro: `taxasDePagamento`, `caixaDiario`, `movimentosDeCaixa`,
projeção, `caixaDoDia` e o Fluxo. A comissão renasce com `cobertoPeloPlano: true`
e valor cheio. O `audit_log` fica apontando para o vazio.

**Direção 2 · plano → avulso** (plano cancelado, cota esgotada por outros cortes,
ou o plano `duplo` sem `servicesIncluded` — o defeito D-a): nasce um `PaymentDoc`
com o método que o modal respondeu. Se o dono clicou **"Concluir sem cobrar"**
(`page.tsx:871`, `concluirCom(null)`), ele nasce com `paymentMethod: null` e taxa
zero — **o caso 1 do R1, recriado pelo botão "Veio depois"**, com o card crítico
voltando a acender (`action-center.ts:132`). Que ele acenda está certo; que o
caminho exista logo depois de uma correção é o ponto.

**Detalhe fino:** `usoNaCompetencia` também é recontado (`mensalistas.ts:283`),
então o rótulo da linha ("Coberto pelo plano · Ilimitado · 3 atendimentos no mês",
`booking-status.ts:138-149`) pode mudar de número depois do ciclo, sem que nada
tenha mudado no plano. **[Ó]**

## 4.6 O `bookings.paymentMethod` e o terceiro método

O R1 grava os dois na mesma transação:

```
correcao-de-pagamento.ts:378   tx.update(pagamentoRef, para)
correcao-de-pagamento.ts:383   tx.update(reservaRef, { paymentMethod: params.metodo })
```

O "Veio depois" reabre o **modal de conclusão** (`page.tsx:710-713` →
`setAFechar(booking)`), que oferece os quatro métodos (`page.tsx:894-904`) e, se o
cliente tiver plano ativo **agora**, também "Concluir sem cobrar"
(`page.tsx:857-875`, condicionado a `assinaturaDoFechamento`, `page.tsx:167-169`).
`concluirCom` grava status e método na **mesma** escrita (`page.tsx:226-229`) — e o
trigger lê `depois.paymentMethod` (`:415`) para montar o pagamento.

**Estado final: consistente e errado.** Booking e payment terminam ambos no
terceiro método. Formalmente:

> **O invariante do R1 não é violado pelo "Veio depois".** Ele é *satisfeito* em
> torno do valor que apagou a correção. Um teste de concordância
> (`correcao-transacao.test.ts:162`) passa nos dois lados do ciclo. **[J]**

Isso muda o desenho da verificação: **não adianta conferir "booking == payment"
depois do ciclo.** O que prova o dano é comparar contra o `audit_log` e contra os
valores anteriores — nunca os dois documentos entre si.

A única divergência real é a da **linha C da matriz** (§3.1), no intervalo entre
as duas pernas.

## 4.7 A ordem importa?

**Importa, e a assimetria é dupla — de efeito e de acesso.**

**Efeito:**

| Ordem | Método/taxa no fim | Comissão | Cobertura |
|---|---|---|---|
| `Veio depois → corrige` | **a correção manda** — o `update` vem por último | **já foi recalculada** do cadastro de hoje | **já foi re-decidida** |
| `corrige → Veio depois` | **a conclusão manda** — a correção foi deletada | recalculada | re-decidida |

Ou seja: `Veio depois → corrige` salva o *meio de pagamento*, e **não** salva a
comissão nem a cobertura. Só o dano da §4.3 e §4.5 é comum às duas ordens;
o da §4.1 é exclusivo de `corrige → Veio depois`.

**Acesso — e este é o dado operacional que o briefing não tinha:**

A perna `completed → no_show` **não tem botão hoje**, e a razão é estrutural:

```
action-center.ts:253   if (!EM_ABERTO.includes(params.booking.status)) return false;   ← estaAtrasado
page.tsx:723           {atrasado && (<button> Não veio </button>)}
page.tsx:257           patchDoc(..., { status: "no_show" })   ← o ÚNICO writer de no_show em todo o web
```

Varredura de `no_show` em `web/src`: um só ponto de escrita, `marcarFalta`,
alcançável só por `estaAtrasado`, que exige `EM_ABERTO`. O item do Action Center
`marcarFalta` sai de `atendimentosAtrasados`, com o mesmo filtro. **[Ó]**

Logo: **a ordem destrutiva só é alcançável por escrita direta em `bookings`** — que
`firestore.rules:246` (`allow update, delete: if isStaffOf(barbershopId)`) libera
para qualquer membro da equipe, pelo console, por script ou por uma tela futura.
É a mesma frase de `booking.ts:952` citada na auditoria: *"interface não é guarda"*.

**[J]** Isso rebaixa a *probabilidade* do cenário no piloto e não muda a
gravidade: a porta existe, é permitida por regra, e a UI que fecha `completed`
hoje é um acaso de implementação (`estaAtrasado` filtrar por `EM_ABERTO`), não uma
guarda declarada. Uma tela de "desfazer conclusão" — que o próprio
`financial-events.ts:234-237` diz existir para o erro de operação — abre a porta
sem nenhum alarme disparar.

## 4.8 O invariante `decidirEfeito("completed","completed") === "nada"`

**Existe.** `financial-events.ts:276-285` — o primeiro `if` exige
`statusAntes !== "completed"`, o segundo exige `statusDepois !== "completed"`;
`completed → completed` cai no `return "nada"` de `:284`. **[Ó]**

**É testado, com nome, em duas suítes:**

| Onde | O quê |
|---|---|
| `correcao-de-pagamento.test.ts:280-298` | `describe("R1 · o invariante do qual a correção depende — cenário 6")` → `it("🔒 completed → completed não faz NADA — a correção não é rematerializada")` |
| `correcao-de-pagamento.test.ts:300-312` | fixa as duas pernas: `("completed","no_show") === "reverter"`, `("no_show","completed") === "materializar"` |
| `correcao-de-pagamento.test.ts:314-321` | **guard de fonte**: exige que `financial-events.ts` ainda contenha `pagamentoRef.delete()` e `pagamentoRef.set({` — se alguém puser `{merge:true}`, o teste falha de propósito |
| `financial-events.test.ts:323` | a mesma asserção, na suíte antiga |

**O que quebraria se esse ramo um dia materializasse — quatro coisas, e a quarta
não está em documento nenhum:**

1. **Toda correção do R1 se autodestruiria.** `tx.update(reservaRef, {paymentMethod})`
   acorda o trigger; ele faria `pagamentoRef.set({...})` sem merge. E o dano seria
   **invisível**: `paymentMethod` e as taxas cairiam no mesmo valor, porque a
   tabela de taxas é a mesma (`:433` e `correcao-de-pagamento.ts:462` fazem o
   idêntico merge sobre `SEM_TAXA`). Só `grossAmount` (recomputado de
   `booking.value`), `createdAt` e `paymentOrigin` denunciariam.
2. **Nenhuma comissão ficaria mais congelada.** Não só na correção: **qualquer**
   escrita em `bookings` de uma reserva concluída — reagendar, corrigir o nome do
   cliente, o próprio trigger gravando `cobertura` — recalcularia `commissionPct`
   e `commissionBase` do cadastro do dia. O arquivo inteiro perderia a razão de
   existir.
3. **`creditLoyaltyOnCompletion` (`loyalty.ts:45-56`) usa o mesmo `decidirEfeito`.**
   Re-`set` do carimbo a cada edição da reserva. Id derivado, então não duplica —
   só o `at` andaria.
4. **⚠️ O trigger deixaria de terminar.** `financial-events.ts:471` faz
   `reservaRef.set({ cobertura }, { merge: true })` — isto é, o próprio trigger
   **escreve em `bookings`**, que é a coleção que o dispara. Hoje esse ciclo morre
   na segunda passada porque `completed → completed` devolve `"nada"`. Com o ramo
   materializando, seria: materializa → grava `cobertura` → dispara → materializa →
   ... `"nada"` em `:284` é o que garante a **terminação**, e não só o histórico.
   **[Ó] no mecanismo, [J] na conclusão** (o Firestore emite `onDocumentUpdated`
   mesmo quando o valor gravado é igual? é o item **[NV]** que a auditoria anterior
   já tinha registrado, §7 — e ele decide se a recursão para na segunda ou na
   enésima volta).

Ou seja: aquela linha sustenta **três** propriedades independentes — a
sobrevivência da correção, a imutabilidade da comissão, e o fim da execução.
O teste nomeado que o briefing exigiu existe e está no lugar certo.

---

# 5 · O QUE PRECISA SER VERIFICADO NO GATE REAL

> Roteiro executável. Bancada com **auth + firestore + functions** de pé — sem
> os triggers ativos, **nada** desta seção acontece: as duas pernas do dano moram
> exclusivamente em `materializeFinancialsOnCompletion`.

## 5.0 Por que este roteiro é obrigatório e não substituível por teste

**Nenhum teste da base exercita trigger nenhum.** Verifiquei os 12 scripts de
emulador em `functions/package.json:15-25`: **todos** usam
`firebase emulators:exec --only firestore` (ou `firestore,storage`). Nenhum sobe
`functions`. E `correcao-transacao.test.ts:4,53-63` chama `gravarCorrecao`
**diretamente**, contra o emulador de Firestore puro.

```
Consequência:  o comportamento inteiro de materializeFinancialsOnCompletion
               — delete, set sem merge, releitura de staff/policies e
               re-decisão de cobertura — NUNCA foi executado por teste algum.
```

O que existe hoje sobre o cenário 6 são **asserções sobre funções puras e sobre o
texto-fonte** (`correcao-de-pagamento.test.ts:296-321`), que provam que o caminho
*está lá* — não o que ele *faz*. **[Ó]** Este gate é a primeira execução real. **[J]**

## 5.1 Preparação

```
# terminal 1 — emuladores (já de pé no gate)
firebase emulators:start --only auth,firestore,functions --project day-in-the-life

# terminal 2 — semear
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
node scripts/semear-day-in-the-life.mjs        # imprime SEMEADO

# terminal 3 — web contra o emulador
# .env.local: NEXT_PUBLIC_USE_EMULATOR=true e NEXT_PUBLIC_FIREBASE_PROJECT_ID=day-in-the-life
npm --prefix web run dev
```

| | Valor |
|---|---|
| Painel | `http://osiqueira.lvh.me:3000` · `dono@osiqueira.teste` / `dono12345` |
| Emulator UI | `http://localhost:4000/firestore` |
| Barbearia | `barbershops/shop-day-in-the-life` |
| Taxas do seed | `dinheiro 0 · pix 0 · débito 1,99 · crédito 3,49` |
| Barbeiro | `staff/b-rafael`, `commissionPct: null` → padrão da casa **40%** |
| Serviço | `services/corte`, **R$ 50,00** |

**A aritmética que vai provar tudo** (`payments.ts:69-84`, conferida à mão):

| Método | `feePct` | `feeAmount` | `netAmount` |
|---|---|---|---|
| Pix / Dinheiro | `0` | `0` | `50` |
| Débito | `1.99` | `1` | `49` |
| **Crédito** | **`3.49`** | **`1.75`** | **`48.25`** |

Comissão esperada com 40%: `commissionPct 40`, `commissionBase 50`,
`commissionAmount 20`.

## 5.2 Passo a passo — o caminho P0

Marque a reserva **para hoje**: a linha com o botão "Corrigir pagamento" só
aparece na tabela do dia (`page.tsx:78,98,763`).

---

### Passo 1 — criar e concluir com Pix

Painel → **Marcar no balcão** → cliente qualquer → `Corte` com `Rafael`, horário
de hoje → salvar. Na linha, **Concluir** → **Pix**.

**Inspecione** `barbershops/shop-day-in-the-life/payments/pagamento_{bookingId}`
(copie o `bookingId` da URL do doc em `bookings`).

**Prova:** `paymentMethod: "pix"`, `grossAmount: 50`, `feePct: 0`, `feeAmount: 0`,
`netAmount: 50`, `origin: "servico"`, `createdAt: T0`. **Anote `createdAt` inteiro —
ele é a testemunha do passo 5.**
Em `commissions/comissao_{bookingId}`: `commissionPct: 40`, `commissionBase: 50`,
`commissionAmount: 20`. Em `bookings/{id}`: `cobertura: {tipo:"avulso", motivo:"sem_plano"}`.

> Se `commissionPct` vier `0` em vez de `40`, **pare**: é o D1 e não o R1.

---

### Passo 2 — corrigir Pix → Crédito

Na linha, **Corrigir pagamento** → **Crédito** → confirmar.

**Inspecione o mesmo `pagamento_{bookingId}`.**

**Prova de que a correção funcionou:** `paymentMethod: "credit"`, `feePct: 3.49`,
`feeAmount: 1.75`, `netAmount: 48.25` — **e `createdAt` idêntico ao do passo 1**
(`update`, não `set`; `grossAmount` continua `50`).
Em `bookings/{id}`: `paymentMethod: "credit"`.
Em `audit_log/`: **exatamente um** doc `correcao_{bookingId}_{chave}`, com
`detail.de = {pix,0,0,50}` e `detail.para = {credit,3.49,1.75,48.25}`.
**Anote o id desse doc — ele é a testemunha dos passos 5 e 6.**

**Verificação de tela junto (o briefing §5 pede):** `caixaDoDia` muda de coluna
sem mudar o total; e o card *"taxas não configuradas"* (`action-center.ts:301`)
pode acender sozinho — se acender, **não é bug**.

---

### Passo 3 — mexer no cadastro, para o P1-7 ficar visível

No Emulator UI, edite **`staff/b-rafael`** → `commissionPct: 60`.

Não toque em mais nada. Este passo existe para que o dano da §4.3 apareça como
número, não como argumento.

---

### Passo 4 — a perna sem botão: `completed → no_show`

No Emulator UI, edite **`bookings/{bookingId}`** → `status: "no_show"`. Salve.

> Não há botão para isto na interface (§4.7) e a escrita é permitida por
> `firestore.rules:246`. Fazer pela UI do emulador **é** exercer a superfície real.

**Inspecione, nesta ordem, e espere ~2s pelo trigger:**

| Documento | O que prova |
|---|---|
| `payments/pagamento_{bookingId}` | **NÃO EXISTE MAIS.** Prova de `:387` |
| `commissions/comissao_{bookingId}` | **NÃO EXISTE MAIS.** Prova de `:386` |
| `bookings/{bookingId}` | campo **`cobertura` sumiu** (prova de `:393`) — **e `paymentMethod` ainda é `"credit"`** (achado §3.1-1) |
| `loyalty_transactions/credito_{bookingId}` | sumiu (`loyalty.ts:63`) |
| `audit_log/correcao_{bookingId}_{chave}` | **continua lá, intacto** |

**Na tela:** a linha vira "Não compareceu" **exibindo "Crédito"** na coluna
Pagamento, e o botão "Corrigir pagamento" some. Fotografe — é a divergência
booking×payment que a decisão B declara impossível.

---

### Passo 5 — "Veio depois", com um TERCEIRO método

Na linha, **Veio depois** → **Dinheiro**.

**Inspecione `payments/pagamento_{bookingId}`.**

| Campo | Valor que prova a afirmação | Afirmação provada |
|---|---|---|
| **existe de novo, mesmo id** | `pagamento_{bookingId}` | §4.2 — sobrescreve, não duplica |
| `paymentMethod` | **`"cash"`** | §4.1 — a correção foi apagada |
| `feePct` / `feeAmount` / `netAmount` | **`0` / `0` / `50`** | os quatro voltaram; `1,75` de taxa evaporou |
| **`createdAt`** | **DIFERENTE do anotado no passo 1** | o fato foi re-datado — `delete`+`create` de fato |

**Inspecione `commissions/comissao_{bookingId}`.**

| Campo | Valor | Afirmação |
|---|---|---|
| `commissionPct` | **`60`**, não `40` | §4.3 — **P1-7 ao vivo**: comissão de um fato passado recalculada do cadastro de hoje |
| `commissionAmount` | **`30`**, não `20` | o acerto com o barbeiro mudou sozinho |
| `createdAt` | novo | |

**Inspecione `audit_log/correcao_{bookingId}_{chave}`.**

| Campo | Valor | Afirmação |
|---|---|---|
| `detail.para.paymentMethod` | **`"credit"`** | §4.4(a) — o log descreve um pagamento que agora diz `"cash"` |
| `detail.para.feeAmount` | **`1.75`** | contra `0` no documento real |

**Confirme também:** `bookings/{id}.paymentMethod === "cash"` e o pagamento também
— **os dois concordam.** É o ponto da §4.6: *conferir concordância não detecta este
dano*. Só a comparação com o `audit_log` detecta.

**Na tela:** o Caixa de Hoje volta a mostrar R$ 50,00 líquidos; as taxas do mês
perdem R$ 1,75. O card crítico **não** acende (há método). Nada avisa.

---

### Passo 6 — a cobertura virando, e a receita sumindo

Sobre a **mesma reserva**, agora já `completed`:

1. Crie um mensalista para este cliente: painel → Mensalistas → plano **Ilimitado**.
   (Ou, no Emulator UI, `subscriptions/{novo}` com `clientId` do cliente,
   `status: "ativo"`, `unlimited: true`, `planId: "ilimitado"`,
   `planName: "Ilimitado"`, `startedAt` = primeiro dia do mês, `canceledAt: null`.)
2. Emulator UI → `bookings/{bookingId}` → `status: "no_show"`. Aguarde.
3. Painel → **Veio depois** → **Concluir sem cobrar**.

> O botão "Concluir sem cobrar" só aparece porque há assinatura ativa **agora**
> (`page.tsx:857`, `booking-status.ts:193-199`). Se não aparecer, a assinatura não
> ficou `status: "ativo"` — corrija antes de seguir.

**Inspecione:**

| Documento | Valor que prova | Afirmação |
|---|---|---|
| `payments/pagamento_{bookingId}` | **NÃO EXISTE** | §4.5 direção 1 — `:511-512`. **R$ 50,00 de receita realizada desapareceram** |
| `bookings/{id}.cobertura` | `{tipo:"plano", planName:"Ilimitado", cota:null, usoNaCompetencia:N}` | a cobertura foi re-decidida com a assinatura de agora, não com a do fato |
| `commissions/comissao_{bookingId}` | `cobertoPeloPlano: true`, `commissionAmount: 30` | comissão cheia sobre corte que não trouxe dinheiro |
| `audit_log/correcao_{bookingId}_{chave}` | intacto, `detail.paymentId = "pagamento_{bookingId}"` | §4.4(b) — **o log aponta para um documento que não existe** |

**Na tela:** DRE e Fluxo do mês perdem R$ 50,00 e R$ 1,75 de taxa. A linha exibe
"Coberto pelo plano". **Nenhum alerta, nenhum log, nenhuma tela registra a perda.**

---

### Passo 7 — a ordem inversa (controle)

Reserva **nova**, para hoje. Concluir com **Pix** → Emulator UI `status: "no_show"`
→ **Veio depois · Débito** → só então **Corrigir pagamento · Crédito**.

**Prova:** `pagamento_{...}` termina `{credit, 3.49, 1.75, 48.25}` — **a correção
sobrevive**. Mas `comissao_{...}` está em `commissionPct: 60` mesmo assim.
Confirma §4.7: a ordem salva o método e **não** salva a comissão.

---

### Passo 8 — o invariante, contra o trigger (o teste que não existe)

Reserva concluída e corrigida (repita 1 e 2). Agora, no Emulator UI, edite
`bookings/{id}` mexendo em **qualquer campo que não seja `status`** — por exemplo
`clientName` → `"Joana Silva"`.

**Prova:** `pagamento_{id}` continua `{credit, 3.49, 1.75, 48.25}` **com o
`createdAt` original**, e `comissao_{id}` continua em **40%**, mesmo com
`staff/b-rafael` em 60.

É `decidirEfeito("completed","completed") === "nada"` observado **em execução** —
hoje só existe como asserção de função pura (§4.8). Se este passo alterar
qualquer documento, o R1 não fecha: a premissa dele é falsa em runtime.

---

### Passo 9 — idempotência do log contra o ciclo

Depois do passo 5, sem fechar nada: reabra **Corrigir pagamento** na linha e
corrija para **Crédito** de novo.

**Prova:** funciona normalmente e nasce um **segundo** `audit_log`
`correcao_{bookingId}_{chave2}` — porque `corrigir-pagamento.tsx:63` gera chave
nova por montagem. Confirma que o dono **não fica preso** pelo log órfão (§4.4).
Se a tela disser "pronto" sem o pagamento mudar, a chave está sendo reaproveitada
e isso é defeito **novo**.

## 5.3 Tabela de fechamento do gate

| # | Afirmação deste relatório | Passo | Valor que prova |
|---|---|---|---|
| 1 | A correção é apagada | 4 → 5 | `feeAmount` `1.75` → `0`; `createdAt` muda |
| 2 | Mesmo id, histórico sobrescrito | 5 | doc `pagamento_{id}` existe, `payments` com 1 doc |
| 3 | Comissão recalculada de hoje | 3 → 5 | `commissionPct` `40` → `60` |
| 4 | `audit_log` sobrevive e mente | 5 e 6 | `detail.para.feeAmount = 1.75` vs. doc real |
| 5 | Cobertura vira e a receita some | 6 | `pagamento_{id}` deixa de existir |
| 6 | Terceiro método → consistente e errado | 5 | booking e payment ambos `"cash"` |
| 7 | A ordem importa | 7 | correção sobrevive; comissão não |
| 8 | O invariante segura em runtime | 8 | nada muda ao editar `clientName` |
| — | Divergência da linha C | 4 | `no_show` com `paymentMethod: "credit"` e sem pagamento |

---

# 6 · Gravidade — leitura, marcada **[J]**

**A correção pode ser apagada: confirmado, com evidência de código, nas duas
pernas.** A pergunta que interessa é se isso bloqueia o fechamento do R1.

**Minha leitura: NÃO bloqueia o R1 — e bloqueia o piloto, por outro motivo.** [J]

Os três argumentos, na ordem em que me convenceram:

1. **O R1 fez a coisa certa com o que lhe cabia.** Ele não criou o caminho,
   não podia consertá-lo (`financial-events.ts` é território de outro escopo),
   e fez o que o briefing exigiu: testou o invariante do qual depende, com nome
   (`correcao-de-pagamento.test.ts:280-321`), e ainda pôs um guard de fonte que
   quebra se alguém mexer no `set` sem merge. O contrato item a item (§4 do
   briefing) está cumprido — `update` nunca `set`, quatro campos, congelados
   parados, log dentro da transação, dono-only, janela no fuso certo. **[Ó]**

2. **O dano maior não é do R1 e não precisa dele.** `completed → no_show →
   completed` reescreve a comissão congelada e re-decide a cobertura **tenha ou
   não havido correção**. Barrar o R1 por isso deixaria o produto exatamente
   igual — com o P1-7 vivo e sem a única porta que corrige pagamento. Bloquear o
   R1 **piora** a situação em vez de melhorá-la.

3. **A ordem destrutiva não tem botão hoje** (§4.7): `estaAtrasado` filtra por
   `EM_ABERTO`, e `marcarFalta` é o único writer de `no_show` no web inteiro.
   Só uma escrita direta chega lá — permitida por `firestore.rules:246`, mas fora
   do gesto do balcão.

**O que eu bloquearia, então:**

| | Item | Gravidade | Por quê |
|---|---|---|---|
| **1** | **Rodar o roteiro §5 no gate, com trigger de verdade** | 🔴 **bloqueia o fechamento** | Nenhum teste da base executa trigger nenhum (§5.0). O comportamento das duas pernas está **[NV]** em execução. O passo 8 é o mais importante: se o invariante não segurar em runtime, o R1 é inválido |
| **2** | **P1-7 — comissão recalculada** | 🔴 **bloqueia o piloto**, não o R1 | Muda o acerto com o barbeiro retroativamente. É frente própria em `financial-events.ts`, e ela precisa existir antes de uma barbearia real usar |
| **3** | **Cobertura re-decidida apagando pagamento** (§4.5) | 🔴 **bloqueia o piloto** | Receita realizada desaparece sem tela, sem log, sem alerta. É a pior das sete consequências e a menos visível |
| **4** | **`paymentMethod` órfão no `no_show`** (§3.1-1) | 🟡 | Defeito claro, correção de uma linha em `:392-394`, mas fora do escopo do R1 |
| **5** | **`grossAmount` recriado de `booking.value`** (§3.1-2) | 🟡 | Só morde se alguém editar `value` de reserva concluída |
| **6** | **Log de idempotência órfão** (§4.4) | 🟢 | A tela gera chave nova; sobra o risco de retry programático |

**Resumo em uma linha:** o R1 pode fechar assim que o §5 rodar verde; o **piloto**
não pode abrir enquanto `completed → no_show → completed` puder reescrever
comissão congelada e apagar receita realizada. São dois portões diferentes, e
misturá-los é o que faria o R1 parecer culpado de um defeito que ele apenas
documentou. **[J]**

---

# 7 · Decisões de domínio que apareceram

Três. Nenhuma é derivável do que já foi decidido, e **nenhuma foi resolvida aqui**
— registro e sigo, conforme o protocolo.

**D-1 · A conclusão de um `no_show` que já foi `completed` é a mesma operação que
a conclusão de um atendimento novo?**
Hoje é: o mesmo botão, o mesmo modal, a mesma escrita. Mas no primeiro caso existe
um fato financeiro anterior que foi apagado, e no segundo não existe nada. Se
forem operações diferentes, "Veio depois" precisa de caminho próprio — que é
exatamente o argumento que o R1 usou para não reaproveitar o modal de conclusão
(`page.tsx:325-341`). **Não decido isto: é desenho de produto.**

**D-2 · Ao rematerializar, a comissão deve renascer do cadastro de hoje ou do
documento anterior?** Reusar o anterior exigiria ler antes de deletar — e teria de
responder o que fazer quando o barbeiro da reserva mudou entre as duas conclusões.
Recalcular é o que o código faz e contradiz o cabeçalho do próprio arquivo
(`:12-15`). **É a decisão que fecha o P1-7, e é sua.**

**D-3 · Reversão de conclusão deve ser permitida sobre um atendimento que já teve
correção — ou estorno?** O R1 recusa corrigir pagamento já estornado
(`motivoDaRecusa → ja_estornado`), mas **nada recusa reverter um pagamento
estornado**: `completed → no_show` deleta o pagamento e o `RefundDoc` fica
apontando para o vazio (`refunds.ts:378-386` prova que o estorno depende do
pagamento existir). É o item 6 do §6 do briefing, agora com uma segunda porta.
**Registro; não escolho.**

---

# 8 · O que eu NÃO consegui verificar

- **Nada foi executado.** Nenhum teste, nenhum typecheck, nenhum emulador — a
  bancada está com o gate. Toda a §3 e a §4 são leitura estática. **[NV]** em
  execução, **[Ó]** em código.
- **Se o Firestore emite `onDocumentUpdated` quando a escrita não altera valor.**
  Decide se a recursão descrita em §4.8-4 pararia na segunda volta ou não, e é o
  mesmo **[NV]** que a auditoria anterior registrou (§7). Só o passo 8 do gate
  responde.
- **Ordem e concorrência das duas pernas.** As três escritas da reversão saem num
  `Promise.all` (`:385-395`) e a rematerialização em outro (`:465-529`). Se as duas
  transições acontecerem em sequência muito rápida, não sei qual trigger termina
  primeiro nem se o `depois.cobertura` da segunda pode enxergar o campo antes do
  `delete` da primeira ter propagado. Se enxergar, a cobertura **não** seria
  re-decidida — e o resultado passa a depender de corrida. **[NV] — e é a única
  coisa neste relatório que pode inverter uma conclusão.**
- **Estado dos dados em produção**: quantas reservas já passaram por
  `completed → no_show → completed`. Se houver alguma, há comissão histórica já
  reescrita hoje. **[NV]**
- **Se o gate consegue mesmo editar `bookings.status` pela UI do emulador** com os
  triggers de pé — o Emulator UI grava via Admin, então deve disparar o trigger,
  mas não confirmei. Se não disparar, o passo 4 precisa virar um script `.mjs`
  com `firebase-admin`. **[NV]**
- **Não li nenhum outro arquivo em `docs/agent-reports/`**, por instrução.
- **Aparência e §19** — fora do meu escopo nesta rodada.
