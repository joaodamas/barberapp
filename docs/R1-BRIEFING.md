# R1 — Correção de pagamento de atendimento

> **Briefing congelado.** 18/08/2026 · decisões de A a E fechadas por João.
> Este documento é o contrato do agent: **nenhuma decisão de domínio fica em
> aberto dentro dele.** Se o implementador encontrar uma, para e registra.

---

# 1 · O que o R1 resolve

**Não é "corrigir pagamento esquecido".** É:

> corrigir um atendimento concluído cuja decisão de cobertura/pagamento resultou
> em estado financeiro incorreto ou divergente.

## O caso estrutural

```
Cliente com plano
      ↓
Dono conclui como "Coberto pelo plano"      page.tsx:803  concluirCom(null)
      ↓
Servidor verifica a cobertura real          financial-events.ts:349
      ↓
Plano NÃO cobre  (cota esgotada · plano inativo · plano_nao_cobre)
      ↓
PaymentDoc nasce com paymentMethod null, taxa zero
      ↓
Card crítico "Registrar pagamento"          action-center.ts:117
      ↓
Hoje: o card grava só bookings.paymentMethod, o card some, e o
      PaymentDoc fica nulo para sempre.  ← O VAZAMENTO
```

## Os dois casos que a mecânica cobre

| | Caso | Estado hoje |
|---|---|---|
| **1 · vazio** | plano não cobriu | card crítico existe; o caminho vaza |
| **2 · errado** | dono marcou Pix, cliente pagou dinheiro | **nenhuma tela detecta, nenhum caminho corrige** |

A callable não distingue os dois — ela corrige o método, qualquer que fosse o
anterior. **A detecção do caso 2 fica fora do R1** e permanece frente aberta.

---

# 2 · As decisões, fechadas

| | Decisão | **Diretriz** |
|---|---|---|
| **A** | Quem corrige | **Dono.** Staff **não** liberado nesta rodada |
| **B** | Fonte da verdade | **`payments` é o fato econômico**; `bookings.paymentMethod` é o **estado operacional**. Os dois atualizados na **mesma transação** |
| **C** | Auditoria | **`audit_log` imutável, criado pelo servidor.** O `PaymentDoc` **não** ganha flag de "corrigido" |
| **D** | Escopo | **Somente serviço/atendimento.** Produto e mensalidade fora |
| **E** | Plano com cota | **Adiado.** Frente própria, fora do caminho crítico do piloto |

## A · Dono, e por quê o staff fica de fora agora

> *"Não porque staff não deveria ter essa capacidade para sempre, mas porque
> estamos mexendo em fato financeiro já materializado. Para o primeiro piloto,
> prefiro o controle mais conservador."* — João

O argumento operacional a favor do staff é reconhecido e não foi descartado:
**quem está no balcão é quem percebe o erro.** A saída futura registrada é uma
permissão específica `corrigir_pagamento`, sem acesso administrativo completo.

Precedente que a decisão segue: `registrarEstorno` é dono-only
(`refunds.ts:593`).

## B · A duplicidade vira invariante

```
correção
   ↓
PaymentDoc.paymentMethod  ← novo método
PaymentDoc.feePct         ← recalculado
PaymentDoc.feeAmount      ← recalculado
PaymentDoc.netAmount      ← recalculado
booking.paymentMethod     ← novo método
   ↓
audit_log                 ← evento de correção
```

**tudo numa `runTransaction`.**

> *"booking e payment nunca podem terminar divergentes."*

Isso transforma a duplicidade de **risco silencioso** em **propriedade
verificada**. Molde existente: `concordancia.test.ts`.

Justificativa medida: nenhum dos seis leitores de `bookings.paymentMethod` soma
dinheiro (`(cliente)/page.tsx:104`, `reservas:42,320,374`, `painel:955`,
`action-center:117`, `booking-status:158`); as seis leituras de dinheiro saem de
`payments`.

## C · O histórico existe antes da tela que o mostra

Estrutura do evento:

```
action:  "payment.corrigido"          padrão dominio.verbo_no_particípio
by:      actorId                      quem corrigiu
at:      FieldValue.serverTimestamp()
detail: {
  bookingId,
  paymentId,
  de:   { paymentMethod, feePct, feeAmount, netAmount },
  para: { paymentMethod, feePct, feeAmount, netAmount },
}
```

Chaves `de`/`para` seguem `subscription.ts:160`, o único precedente com de/para.

> *"Mesmo que a tela ainda não leia o audit log, o histórico passa a existir."*
> — João

**A visualização do histórico é frente própria.** Enquanto ela não existir, o
§26 item 3 (*o dono precisa enxergar o histórico*) permanece **parcialmente
descumprido, e isso está registrado, não esquecido.**

## D · Por que produto e mensalidade ficam fora

```
inventory.ts:586     if (!metodoValido(paymentMethod)) throw "Informe como o cliente pagou."
mensalistas.ts:543   if (!metodoValido(paymentMethod)) throw "Informe como o cliente pagou."
```

Ambos exigem o método na origem — **o caso 1 é impossível ali**. O caso 2
(digitação errada) existe, mas é lacuna de digitação, não estrutural. Frente
posterior de correção de pagamento.

---

# 3 · Duas precisões, dentro das decisões

Apareceram ao redigir o briefing. Nenhuma reabre decisão; ambas eliminam
ambiguidade que o agent teria de resolver sozinho.

## 3.1 ⚠️ "Taxa recalculada conforme a política definida" = **taxa de hoje**

A frase admite duas leituras. **R1.1 já decidiu**: taxa **vigente no momento da
correção**, sem versionamento.

```ts
// correto — a tabela de agora
const fees = { ...SEM_TAXA, ...(policies.paymentFees ?? {}) };
const { feePct, feeAmount, netAmount } = valoresDoPagamento({ ...  });
```

E a obrigação que veio junto: **a confirmação na tela precisa dizer que a taxa
aplicada é a de hoje**, e os três textos que prometem versionamento caem
(`financeiro/page.tsx:308`, `business-rules.ts:210`, `domain.ts:590`).

`valoresDoPagamento` (`payments.ts:69`) é **reusada, nunca reimplementada** —
`financial-events.ts:206-211` registra que três cópias da fórmula foi o defeito
mais encontrado nesta base.

## 3.2 ⚠️ A matriz exige uma porta que o caso 2 não tem

A matriz de teste inclui *"Corrige Pix → dinheiro"*. Mas o card crítico só
aparece quando `!b.paymentMethod` (`action-center.ts:117`): **um atendimento com
método preenchido não tem nenhum acesso à correção.** Metade da matriz não seria
alcançável pela interface.

Não é decisão de produto nova — é onde o botão mora. **Recomendação, a confirmar
no briefing:** o acesso à correção fica **na linha do atendimento concluído**, na
tabela do painel, servindo aos dois casos. O card crítico continua sendo o
**alerta** do caso 1, e passa a apontar para a mesma porta.

Consequência obrigatória: `executarIntencao` (`page.tsx:316`) **para de reabrir o
modal de conclusão** sobre uma reserva `completed`. É o elo que hoje produz o
vazamento.

---

# 4 · O contrato do R1, item a item

| | Item | Regra |
|---|---|---|
| 1 | **Escopo** | somente serviços/atendimentos |
| 2 | **Fonte econômica** | `payments` |
| 3 | **Estado operacional** | `bookings.paymentMethod` |
| 4 | **Correção** | atualiza os dois **atomicamente** |
| 5 | **Permissão** | dono |
| 6 | **Auditoria** | `audit_log` imutável, criado pelo servidor |
| 7 | **`PaymentDoc`** | **não** ganha flag de "corrigido" |
| 8 | **Idempotência** | corrigir duas vezes não cria pagamento novo nem altera valor indevidamente |
| 9 | **Taxa** | recalculada com a tabela **vigente na correção** (R1.1) |
| 10 | **Histórico** | não alterar `date`, `origin`, `grossAmount`, receita, comissão ou CMV — só os campos do meio de pagamento e taxa |
| 11 | **Janela** | mês corrente pelo `date` (R1.2) |
| 12 | **Método** | `update`, **nunca** `set` sem merge, nunca `delete`+`create` |
| 13 | **Fora** | produto e mensalidade |

Campos que podem mudar — **os quatro, e são conjunto indivisível**:
`paymentMethod`, `feePct`, `feeAmount`, `netAmount`.

Campos congelados: `origin`, `bookingId`, `movementId`, `invoiceId`, `clientId`,
`date`, `paymentOrigin`, `grossAmount`, `createdAt`, `registradoPor`.

---

# 5 · A matriz de verificação

**Obrigatória.** Não basta `conclui → corrige → conferiu`.

| # | Cenário | Resultado esperado |
|---|---|---|
| 1 | Coberto de verdade | **sem** `PaymentDoc` |
| 2 | Plano não cobre | `PaymentDoc` sem método + correção disponível |
| 3 | Corrige Pix → dinheiro | **um único** `PaymentDoc` |
| 4 | Corrige Pix → Pix novamente | nenhum efeito financeiro adicional |
| 5 | Corrige Pix → dinheiro | `booking` e `payment` **iguais** |
| 6 | Reabre como "Veio depois" | **não recalcula histórico** |
| 7 | Atualiza taxa | caixa/DRE refletem **uma única vez** |
| 8 | Usuário sem permissão | **não consegue** corrigir |
| 9 | Auditoria | **um único** evento de correção |

## O cenário 6 é o mais perigoso, e não é hipotético

```
completed → no_show    pagamentoRef.delete()       financial-events.ts:387
no_show → completed    pagamentoRef.set({...})     financial-events.ts:513  ← sem merge
                       relê policies e staff AGORA           :421-434
```

O botão existe: **"Veio depois"** (`page.tsx:691`). Uma correção do R1 pode ser
apagada por ali, e a comissão volta a ser recalculada do cadastro de hoje — o
P1-7 ressuscitando.

O R1 **passa a depender** de `decidirEfeito("completed","completed") === "nada"`
(`financial-events.ts:284`). Essa dependência precisa de **teste nomeado**, não
de confiança.

## Depois da matriz: verificação de tela, com dado real

> *"O problema mais perigoso do JP Barber não está dentro de cada função. Está
> na interação entre duas coisas que individualmente estão corretas."* — João

§19 e §25. **Nenhum agent declara o R1 fechado por teste.** O fechamento é do
orquestrador, na integração, com a tela aberta.

Pontos de tela que a matriz não cobre:
- o card crítico **desaparece pelo motivo certo** (o pagamento existe), não por
  `bookings` ter sido preenchido;
- `caixaDoDia` muda de coluna **sem mudar o total** — "Sem forma informada" cai,
  "Cartão" sobe, total igual. Precisa ser lido como correto, não como bug;
- o card **"taxas não configuradas"** pode **acender sozinho** ao corrigir
  Pix→Crédito com taxas zeradas (`action-center.ts:301`);
- a confirmação diz que a taxa aplicada é a de hoje.

---

# 6 · O que fica registrado como aberto

| # | Item | Por quê |
|---|---|---|
| 1 | **Caso 2 não é detectado** por nenhuma tela | erro financeiro silencioso; **bloqueia o piloto junto com o R1** |
| 2 | Nenhuma tela lê `audit_log` | §26 item 3 parcialmente descumprido, por decisão consciente |
| 3 | Permissão `corrigir_pagamento` para staff | adiada, não descartada |
| 4 | Correção em produto e mensalidade | frente posterior |
| 5 | Plano com cota (E) | frente própria |
| 6 | Pagamento **já estornado** — `RefundDoc` congelou o método antigo (`refunds.ts:386`) | **não decidido**; o R1 deve **recusar** e registrar, em vez de escolher sozinho |
| 7 | Versionamento de taxa | frente futura; os três textos que o prometem caem no R1 |
| 8 | Fechamento de mês explícito | frente futura; a janela é o mês corrente |
| 9 | Defeitos D-a a D-f da auditoria | ver `AUDITORIA-R1-N7.md §3` |

---

# 7 · Estado do piloto

**Bloqueado.** Dois motivos, e o segundo é o mais forte:

1. O R1 não está implementado.
2. **O caso 2 já está acontecendo hoje sem que nada no produto o revele.**

> *"É exatamente o tipo de erro financeiro silencioso que você não quer descobrir
> depois que uma barbearia já começou a usar o sistema."* — João
