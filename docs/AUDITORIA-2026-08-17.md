# Auditoria da plataforma — 17/08/2026

> ## Estado da correção — atualizado em 17/08, branch `hardening/p0-2026-08-17`
>
> | | Achado | Estado | Evidência |
> |---|---|---|---|
> | 🔴 | **P0-1** assinatura falsa | ✅ corrigido | checkout removido; a tela virou vitrine com contato da barbearia. `subscription-context.tsx` **apagado** |
> | 🔴 | **P0-2** agenda duplicada | ✅ corrigido | `agenda.ts` + 28 testes puros + **13 de concorrência real** contra o emulador |
> | 🔴 | **P0-3** cancelamento apaga receita | ✅ corrigido | guarda no `cancelBooking` + `decidirEfeito` no gatilho + 7 testes |
> | 🔴 | **P0-4** telefone do cliente | ✅ corrigido | campo obrigatório no passo 3, perfil grava de verdade, 17 testes de formato |
> | 🔴 | **P0-5** modo leitura decorativo | ✅ corrigido | `trava-de-escrita.ts` nos 5 pontos do repositório + `useFeature` unificado + 12 testes |
> | 🔴 | **P0-6** trial e plano | ✅ corrigido | `trial` no provisionamento, `definirPlano`, `featuresExtras` + 13 testes |
> | 🟠 | **P1-3** encaixe | ✅ removido da proposta | decisão de produto de 17/08; servidor recusa, interface limpa |
> | 🟠 | **P1-5** política cravada | ✅ corrigido | agendar e perfil leem `policies.cancellation` |
> | 🟠 | **P1-6** preço inventado | ✅ corrigido | "R$ 149" saiu das duas telas |
> | 🟠 | **P1-16** notificações que não persistem | ✅ corrigido | as chaves falsas saíram; o texto diz o que acontece |
>
> **Suíte:** functions 141 → **188** · web 177 → **268** · concorrência **13** (nova) · build limpo.
>
> ### Achados posteriores ao Gate A
>
> | | Achado | Origem | Estado |
> |---|---|---|---|
> | 🔴 | **D13** · o dono **não consegue criar uma reserva** | Day in the Life, 09:00 | potencial release blocker — decisão de produto pendente |
> | ✅ | **P1-11** · a legenda do caixa ensina uma regra que não existe mais | confirmado **na interface** | corrigido na Rodada 1 · 4 testes de invariante |
> | ✅ | **D14** · templates de WhatsApp prometem **pagamento online e estorno**, que não existem | varredura da regra canônica | corrigido na Rodada 1 — eram **15 templates e 30 ocorrências**, não 2 |
> | 🟠 | **D17** · `pos_atendimento` convida o cliente a **avaliar o atendimento**, e não existe avaliação em lugar nenhum do produto | varredura de D14 | promessa removida na Rodada 1 · **gap permanece aberto** no Bloco 2 |
> | 🟡 | **D15** · a **lista de todas as barbearias** é enumerável sem login | isolamento multi-tenant | exposição comercial da plataforma |
> | 🟡 | **D16** · o índice de **slugs** também é enumerável | isolamento multi-tenant | mesma origem de D15 |
> | ✅ | ~~"login válido não avança"~~ | **retirado** — ver §8 | não era achado |
>
> **Rodada 1 (Fase 3) executada em 17/08: os dez itens fechados, relatório em
> `RODADA-1.md`.** Além de P1-11, D14 e D17, fecharam D10, D6/P1-2, P1-1, P1-15,
> D2, D9, P1-14 e P1-9. Nenhum tocou o modelo financeiro: **D3 e D8/D11 seguem
> pendentes de decisão.**
>
> **Isolamento multi-tenant: 166 verificações, nenhuma violação passou.** A Alfa
> não lê nem escreve nada da Beta, em nenhuma das 19 subcoleções, nem por
> collection group, nem por query filtrada. Detalhe em
> `ISOLAMENTO-MULTI-TENANT.md`.
>
> D1–D12 (reconciliação e matriz) estão em `LEDGER-DE-VALIDACAO.md` e
> `MATRIZ-FATO-VISAO.md`. **D3, D8 e D11 seguem em decisão pendente** até a
> evidência operacional fechar.
>
> Os **P1 financeiros** (P1-1, P1-2, P1-7, P1-9, P1-10, P1-11, P1-14) são a
> próxima frente, junto da reconciliação de ponta a ponta com massa conhecida.
> Nada aqui foi promovido por leitura de código: cada linha ✅ tem teste que
> falha sem a correção.

Varredura completa do código no commit `659091a` (`main`, após o merge dos PRs
#12 a #19). Cobre as 21 Cloud Functions, as regras do Firestore e do Storage, a
camada de dados do web, o motor financeiro, o Action Center e as 25 telas.

**Método.** A régua é a lente de confiança que o projeto já adotou
(`HANDOFF.md` §3.1):

> O sistema não pode afirmar que algo aconteceu quando não aconteceu.
> E não pode deixar de reconhecer algo que aconteceu.

Todo achado abaixo nomeia **arquivo e linha**, o **caminho concreto** que leva a
ele e o que **quebra na operação real**. Nenhum foi levantado por leitura de
documentação: os documentos foram lidos depois, para checar o que já estava
registrado — e a §5 lista onde eles divergem do código.

**Estado executável, conferido nesta auditoria:**

| | |
|---|---|
| `web`: typecheck + lint + testes | ✅ 177 testes em 9 arquivos |
| `functions`: typecheck + testes | ✅ 141 testes em 10 arquivos |
| Testes de regras (emulador) | não executados aqui — exigem emulador |
| Repositório local | atualizado, `main` = `origin/main` = `659091a` |

Pela regra 1 do `GO-LIVE-READINESS.md`, suíte verde não promove nada. **Os 12
achados P0 e P1 desta auditoria passam todos por uma suíte verde.**

---

## Índice

1. [Resumo](#1-resumo)
2. [P0 — bloqueadores](#2-p0--bloqueadores)
3. [P1 — o sistema mente sobre o próprio estado](#3-p1--o-sistema-mente-sobre-o-próprio-estado)
4. [P2 — estrutura e consistência](#4-p2--estrutura-e-consistência)
5. [Onde a documentação diverge do código](#5-onde-a-documentação-diverge-do-código)
6. [O que está certo e vale preservar](#6-o-que-está-certo-e-vale-preservar)
7. [Ordem de correção sugerida](#7-ordem-de-correção-sugerida)
8. [Um achado retirado, e a regra que ele produziu](#8-um-achado-retirado-e-a-regra-que-ele-produziu)
9. [D13 contra a especificação](#9-d13-contra-a-especificação--o-que-o-blueprint-diz)

---

## 1. Resumo

| Prioridade | Quantidade | O que caracteriza |
|---|---|---|
| 🔴 **P0** | 6 | impedem entregar a uma barbearia real: corrompem dinheiro, agenda ou afirmam ao cliente final algo que não aconteceu |
| 🟠 **P1** | 16 | a tela mostra um número ou uma promessa que o dado não sustenta |
| 🟡 **P2** | 12 | dívida estrutural, divergência entre caminhos, cobertura |

Três padrões concentram quase tudo:

1. **Duas fontes para a mesma pergunta.** `useFeature` × `useAcesso`,
   `slotsForDate` × `availableSlots`, constante do módulo × política do tenant.
   Em todos os casos a correção foi aplicada num caminho e o outro ficou para
   trás — e o caminho esquecido é sempre o que atende o cliente final.
2. **Rótulo que sobreviveu à mudança do cálculo.** A legenda continua descrevendo
   a regra antiga depois que a regra mudou (`isReceived`, receita de mensalista,
   "no mês" das despesas).
3. **Tela que confirma sem gravar.** Assinatura, perfil e preferências de
   notificação anunciam sucesso sem persistir nada.

O terceiro padrão é o mesmo que o `soAvisaSeGravou` fechou no painel do dono em
12/08. **Ele continua aberto no app do cliente**, que é o lado onde a afirmação
vai para um terceiro e não se desfaz.

---

## 2. P0 — bloqueadores

### P0-1 · A assinatura de mensalista é um checkout falso, e quem recebe a promessa é o cliente final

**Onde:** `web/src/lib/subscription-context.tsx:36-59` ·
`web/src/app/(cliente)/planos/page.tsx:47-52, 236-238, 269-285`

`SubscriptionProvider` é `useState` em memória — não grava no Firestore, não
chama function nenhuma, não passa por `localStorage`. Some ao recarregar a
página.

Em cima disso, a tela afirma três coisas ao cliente:

| Onde | O que a tela diz | O que acontece |
|---|---|---|
| modal de checkout, l. 237 | *"Primeira cobrança hoje. A próxima cai em {data}."* | não existe cobrança |
| modal de sucesso, l. 281 | *"Plano ativado! Seu plano X já está valendo."* | nada foi gravado |
| modal de sucesso, l. 282 | *"Enviamos a confirmação no seu WhatsApp."* | nenhuma mensagem sai, e não há número |

**O caminho é o normal do produto**, não um atalho: `/` → card *"Vire mensalista
e economize"* → `/planos` → escolher plano → escolher Pix ou cartão →
*"Confirmar assinatura"*.

**Por que é P0 e não P1.** As outras telas que mentem enganam o dono, que é
cliente da plataforma e pode ser avisado. Esta afirma a um **terceiro** — o
cliente da barbearia — que ele contratou e foi cobrado. Ele acredita que é
mensalista; o dono abre `/painel/mensal`, lê `subscriptions` no Firestore e não
vê ninguém, porque nada foi escrito. Na próxima visita o cliente cobra um plano
que o dono não sabe que existe. É exposição de consumo, e o prejudicado é quem
nunca contratou nada com a plataforma.

**Correção mínima:** tirar `/planos` do `clienteNavItems`
(`web/src/lib/nav-items.ts:49`) e do card da Início, e trocar o fluxo por uma
chamada ao WhatsApp da barbearia — que é como a contratação de fato acontece
hoje. **Correção certa:** `subscriptions` escrita por Cloud Function, com o
gateway. Enquanto o gateway não existir, a tela não pode existir.

---

### P0-2 · Duas reservas no mesmo barbeiro, ao mesmo tempo — pelo fluxo normal do app

**Onde:** `functions/src/availability.ts:96-101` ·
`functions/src/booking.ts:216-231` e `338-347`

A ocupação é calculada por **horário exato de início**, e nunca pela duração:

```ts
// availability.ts:97-101 — o que está ocupado
const ocupados = new Set(
  reservas.docs
    .filter((d) => d.get("staffId") === barbeiro.id && OCUPAM_SLOT.includes(d.get("status")))
    .map((d) => String(d.get("time")))   // ← só o INÍCIO. `durationMin` não é lido.
);
```

```ts
// booking.ts:216-224 — a checagem de conflito na transação
.where("date", "==", date)
.where("time", "==", time)              // ← igualdade exata, não interseção
```

`durationMin` é gravado na reserva (`booking.ts:244`) e **não é lido em lugar
nenhum** para decidir disponibilidade ou conflito.

**O caminho, com o dado que toda barbearia recebe ao nascer.** O catálogo
semente tem `Corte + barba` com `durationMin: 60`
(`signup.ts:30`, `provisioning.ts:27`) e a jornada padrão tem `slotMinutes: 30`
(`signup.ts:39`):

1. Cliente A marca *Corte + barba* às **15:00** → ocupa de fato 15:00–16:00.
2. Cliente B abre a agenda e escolhe *Corte* (30 min).
   `availableSlots` monta `ocupados = {"15:00"}` — **15:30 não está lá** e é
   oferecido como livre.
3. Cliente B confirma 15:30. A transação procura `date == && time == "15:30"`,
   não encontra nada e **grava**.
4. Dois clientes na mesma cadeira às 15:30. O barbeiro descobre no balcão.

Não há corrida, não há chamada direta à API, não há má-fé: é o produto
funcionando como está escrito. E o comentário do próprio `agendar/page.tsx:114`
afirma o contrário — *"os horários dependem da duração TOTAL escolhida"* —, o
que é verdade só para a duração da reserva **nova**, nunca para a que já existe.

**Correção:** comparar intervalos em vez de instantes, nos dois lugares.
`ocupados` passa a ser uma lista de `[início, início + durationMin)` e o teste
vira interseção (`inicioA < fimB && inicioB < fimA`) — a mesma conta que
`availability.ts:114` já faz para os intervalos de almoço. Reserva antiga sem
`durationMin` assume `slotMinutes`.

---

### P0-3 · O cliente cancela um atendimento já concluído e apaga a receita da barbearia

**Onde:** `functions/src/booking.ts:420-466` (ausência de guarda) ·
`functions/src/financial-events.ts:148-160` (o efeito)

`rescheduleBooking` recusa reserva que não esteja aberta:

```ts
// booking.ts:302
if (!EM_ABERTO.includes(booking.status)) {
  throw new HttpsError("failed-precondition", "Essa reserva não está mais aberta.");
}
```

**`cancelBooking` não tem essa checagem.** Ele valida autor e calcula devolução,
e grava direto:

```ts
// booking.ts:458-462
await bookingRef.update({
  status,                       // cancelled_by_client
  cancelledAt: FieldValue.serverTimestamp(),
  refundedAmount: refund,
});
```

Cancelar uma reserva `completed` a tira desse estado, e o gatilho financeiro lê
isso como conclusão desfeita:

```ts
// financial-events.ts:149-159
const deixouDeSerConcluido = antes.status === "completed" && depois.status !== "completed";
if (deixouDeSerConcluido) {
  await Promise.all([
    comissaoRef.delete().catch(() => undefined),    // a comissão do barbeiro
    pagamentoRef.delete().catch(() => undefined),   // a receita do atendimento
  ]);
  return;
}
```

`creditLoyaltyOnCompletion` (`loyalty.ts:56-58`) faz o mesmo com o carimbo.

**Resultado:** o atendimento aconteceu, o dinheiro entrou na gaveta, e
`payments/pagamento_{id}` e `commissions/comissao_{id}` **desaparecem**. A
receita some do DRE, do fluxo de caixa e do acerto do barbeiro. O horário
continua ocupado (`cancelled_*` não está em `OCCUPIES_SLOT`, então ele nem
aparece mais na agenda) e não existe tela onde reencontrá-lo — o Action Center
só procura reservas em aberto (`action-center.ts:123`).

**Quem consegue disparar:** o próprio cliente, chamando `cancelBooking` com o
`bookingId` de uma reserva dele já concluída. A regra do Firestore não protege —
a escrita é do Admin SDK. E o dono, sem querer, se a interface um dia oferecer o
botão fora da janela em que ele hoje aparece (`painel/page.tsx:628` limita a
`emAberto`, o que hoje é a única barreira, e é de interface).

**Correção:** a mesma guarda do `rescheduleBooking`, em `cancelBooking`, antes de
calcular qualquer coisa. Cancelamento de reserva concluída é operação de
estorno, e estorno tem outro caminho.

---

### P0-4 · O produto se define pelo WhatsApp e nunca coleta o número do cliente

**Onde:** `web/src/app/(cliente)/agendar/page.tsx:90` ·
`web/src/app/(cliente)/perfil/page.tsx:82-88` ·
`functions/src/whatsapp/notify.ts:104`

A reserva nasce com o WhatsApp lido do Firebase Auth:

```ts
// agendar/page.tsx:90
clientWhatsapp: user?.phoneNumber ?? undefined,
```

`user.phoneNumber` só existe para quem entrou **por SMS** — e o provider Phone
não está habilitado no projeto (`GO-LIVE-READINESS.md` §5, e a própria mensagem
de erro em `login/page.tsx:46`). Com e-mail/senha ou Google, que são os dois
caminhos que funcionam, o campo é sempre `null`. **Nenhuma tela pede o telefone
do cliente**: o fluxo de agendar tem 4 passos e nenhum campo de contato.

A tela de Perfil parece resolver, e não resolve:

```ts
// perfil/page.tsx:82-88
function saveProfile() {
  setSaved(true);                       // ← mostra "Salvo!"
  savedTimer.current = setTimeout(() => {
    setSaved(false);
    setOpenMenu(null);
  }, 900);
}
```

O cliente digita nome e celular, clica **Salvar**, lê **"Salvo!"** e o modal
fecha. Nada foi gravado — nem em `users/{uid}`, nem na reserva.

**O que quebra em cadeia:**

| Onde | Consequência |
|---|---|
| `notify.ts:104` | `if (reserva.clientWhatsapp)` nunca é verdadeiro → o cliente **nunca** recebe a confirmação, mesmo depois de a Meta liberar o envio |
| `painel/page.tsx:569-583` | a coluna **Telefone** da agenda do dia mostra `—` para todos |
| `painel/page.tsx:230-236` | `avisarCancelamento` retorna cedo por falta de dígitos — e o modal de cancelamento afirma, na l. 740, *"O cliente é avisado pelo WhatsApp em seguida"* |
| `painel/page.tsx:283` | `resolveFitIn` abriria `wa.me/` sem número |

A decisão de produto registrada no `GO-LIVE-READINESS.md` §6 é que o WhatsApp é
o que faz o cliente aparecer. **Hoje o produto não teria para onde enviar, mesmo
com a Meta aprovada** — e isso não está em lista nenhuma, porque o bloqueador
registrado é a verificação comercial, não a ausência do dado.

**Correção:** campo de WhatsApp obrigatório no passo 3 de `/agendar`, pré-
preenchido com o que estiver em `users/{uid}`, e `saveProfile` gravando de
verdade. É o mesmo dado que a LGPD já declara que a barbearia coleta
(`agendar/page.tsx:538`).

---

### P0-5 · O modo leitura não trava nada, e o aviso afirma que trava

**Onde:** `web/src/lib/tenant.ts:365-396` ·
`web/src/components/ui/bloqueio-plano.tsx:81-112` ·
`web/src/lib/tenant-context.tsx:37-51`

`acessoDaBarbearia` decide `podeEditar` com cuidado — trial vencido, suspensa e
encerrada caem em leitura. **Uma varredura por `podeEditar` no `web/src` inteiro
encontra dois usos: a definição, e o banner que anuncia o modo leitura.**
Nenhuma tela de edição o consulta.

O banner afirma:

```tsx
// bloqueio-plano.tsx:95-96
Você continua vendo tudo, mas não consegue alterar.
```

E, com o trial vencido, o dono continua conseguindo:

| Tela | Escrita que continua funcionando |
|---|---|
| `/painel` | concluir atendimento, marcar falta, cancelar, aprovar e recusar encaixe |
| `/painel/servicos` | editar preço, duração, ocultar, excluir |
| `/painel/equipe` | adicionar, editar comissão e salário, remover |
| `/painel/configuracoes` | taxas de maquininha e tolerância de atraso |

As regras do Firestore não ajudam: elas autorizam por `isOwnerOf(barbershopId)` e
**não consultam `status` nem `trial`** — decisão consciente, registrada em
`firestore.rules:13-16` (ler o claim é grátis; um `get()` custaria uma leitura
por avaliação). O gate é inteiramente de interface, e a interface não o aplica.

**O segundo furo, na mesma família.** Existem duas fontes para "este recurso está
liberado?":

```ts
// tenant-context.tsx:37-39 — lê o documento CRU
export function useFeature(feature) {
  return useContext(TenantContext).features[feature];   // ignora status e trial
}

// tenant-context.tsx:49-51 — passa pela decisão
export function useAcesso() {
  return acessoDaBarbearia(useContext(TenantContext));  // status e trial contam
}
```

`/painel/loja` e `/painel/mensal` usam `useFeature` (`loja/page.tsx:33`,
`mensal/page.tsx:40`). Numa barbearia **suspensa**, `acessoDaBarbearia` devolve
`features: NADA`, mas `tenant.features` no documento continua dizendo
`store: true` — então as duas telas seguem abertas. `/painel/financeiro/dre` tem
os **dois** gates (l. 31 e l. 208) e só funciona porque o segundo pega o que o
primeiro deixa passar.

Isso contradiz a decisão de arquitetura escrita no `HANDOFF.md` §4:

> A decisão de acesso mora num lugar só (`acessoDaBarbearia`). As telas leem o
> resultado por `useAcesso`; nenhuma tela decide sozinha o que o plano libera.

**Correção:** `useFeature` passa a derivar de `acessoDaBarbearia` (uma linha), e
as escritas consultam `podeEditar` — o caminho barato é bloquear no
`patchDoc`/`patchTenant`/`createDoc` do `repository.ts`, que é por onde toda
escrita do painel passa, em vez de botão a botão em dez telas.

---

### P0-6 · A barbearia provisionada fica em teste para sempre, e não existe como mudar de plano

**Onde:** `functions/src/provisioning.ts:106-127` · `web/src/lib/tenant.ts:378-382`
· `web/src/lib/tenant-shape.ts:128-134`

São três defeitos que se somam no mesmo ponto: o ciclo de cobrança não fecha.

**a) Trial sem data de fim nunca vence.** `provisionBarbershop` grava
`status: "trial"` (l. 108) e **não grava o campo `trial`**. `signUpBarbershop`
grava (`signup.ts:135-138`); o caminho assistido, não. Então:

```ts
// tenant-shape.ts:133 — sem startedAt/endsAt, o trial é nulo
return startedAt && endsAt ? { startedAt, endsAt } : null;

// tenant.ts:246-249 — trial nulo nunca expira
export function isTrialExpired(trial, now) {
  const left = trialDaysLeft(trial, now);   // null quando não há trial
  return left !== null && left <= 0;        // → false
}

// tenant.ts:378-382 — e trial não expirado libera TUDO
if (tenant.status === "trial") {
  return trialAcabou
    ? { podeEditar: false, features: NADA, motivo: "trial_vencido" }
    : { podeEditar: true, features: ALL_FEATURES, motivo: null };
}
```

`revisarAssinaturas` também desiste dessa barbearia (`billing.ts:50-52`:
*"trial sem data de fim válida"* → `continue`). **A barbearia piloto foi criada
por este caminho** — ela tem o plano de cima, de graça, sem prazo, e nenhuma
rotina a alcança.

**b) Nada muda o plano.** Uma varredura por escrita em `plan` ou `features` nas
functions devolve apenas os dois pontos de **criação**. Não existe função de
contratação, upgrade, downgrade ou reativação. Sair de `trial` para `ativo` só
acontece por edição manual no console — que é o único caminho que a regra
permite (`firestore.rules:146`, `isPlatformAdmin`).

**c) E o downgrade manual não faz efeito.** `features` gravado no documento vence
o plano, nos dois lados:

```ts
// tenant-shape.ts:73
features: { ...featuresForPlan(plan), ...features },
// tenant.ts:393
features: { ...doPlano, ...tenant.features },
```

Toda barbearia self-service nasce com `features: featuresFor("gestao")` gravado
(`signup.ts:155`, porque o trial roda no plano de cima). Trocar `plan` para
`"agenda"` no console **não tira nada**: o spread do documento sobrepõe o do
plano e a barbearia mantém DRE, loja e mensalistas.

O comentário em `tenant.ts:384-387` chama isso de recurso ("é como o suporte
libera algo pontualmente sem mexer no plano"), e é uma escolha defensável — mas
combinada com (a) e (b) o efeito líquido é que **o produto não consegue cobrar de
ninguém**.

**Correção:** `provisionBarbershop` grava `trial` como o signup; a mudança de
plano vira uma function (`definirPlano`) que reescreve `plan` **e** `features`
juntos; e o override em `features` passa a ser explícito (`featuresOverride`),
para não ser confundido com o retrato do plano.

---

## 3. P1 — o sistema mente sobre o próprio estado

### P1-1 · A tela de Despesas soma o histórico inteiro e chama de "no mês" — com "julho de 2026" cravado

**Onde:** `web/src/app/painel/(dashboard)/financeiro/despesas/page.tsx:44-64, 180-213, 293-303`

A consulta não filtra período:

```ts
// l. 44-47
const { items: expenses } = useShopCollection("expenses", {
  orderByField: "date", direction: "desc",     // sem `equals`, sem recorte de mês
});
// l. 61-64
const total = expenses.reduce((s, e) => s + e.value, 0);       // TUDO
```

E os quatro KPIs, o rodapé e a legenda afirmam mês:

| Linha | Texto na tela | O que o número é |
|---|---|---|
| 187 | "Lançamentos · **no mês atual**" | todos os lançamentos já feitos |
| 192-196 | "Total no mês" / **"julho de 2026"** | total histórico, com o mês **escrito no código** |
| 203 | "Recorrentes · **por mês**" | soma de todo recorrente já lançado |
| 211 | "Maior categoria · **no mês**" | maior categoria de toda a história |
| 296 | rodapé "**Total do mês**" | total histórico |

O erro cresce com o uso: no terceiro mês o "Total no mês" mostra o triplo do que
o dono gastou no mês. E a legenda "julho de 2026" já está errada há duas
semanas — é texto fixo, não formatação de data.

**Correção:** filtrar por `mesAtual()` como as demais telas do financeiro fazem
via `useFinanceiro`, ou trocar todos os rótulos para "total lançado". A primeira
é o que o dono espera; a segunda é uma linha.

---

### P1-2 · O DRE lista mensalistas dentro de uma receita que não os contém

**Onde:** `web/src/app/painel/(dashboard)/financeiro/dre/page.tsx:69-74, 102-139, 321-330`

O PR #18 tirou a mensalidade da receita realizada — decisão correta e bem
justificada em `analytics.ts:81-109`. A árvore do DRE não acompanhou:

```tsx
// l. 69-74 — a lista que vira os filhos
const revenueBreakdown = [
  { label: "Serviços avulsos", value: receita.servicos },
  { label: "Produtos (loja)",  value: receita.produtos },
  { label: "Mensalistas",      value: receita.mensalistas },   // ← não está em `bruta`
  { label: "Encaixes",         value: receita.encaixes },
].filter((i) => i.value > 0);

// l. 322-324 — o cabeçalho do grupo
<ExpandableGroup label="Receita realizada" value={grossRevenue} items={receitaTree} …/>
```

`grossRevenue` é `receita.bruta`, que é `servicos + encaixes + produtos`
(`analytics.ts:115-125`). Com um mensalista de R$ 149, o dono abre o grupo
"Receita realizada · R$ 5.000" e lê quatro linhas que somam R$ 5.149. Some na
mão e não fecha.

Pior: o mesmo valor aparece logo abaixo no cartão "Receita contratada"
(l. 303-318), que existe justamente para separar contratado de realizado. **O
número aparece duas vezes, e uma das duas está no lugar errado.**

A tela `/painel/financeiro` já faz isso certo (`financeiro/page.tsx:36-43`,
com o comentário explicando por quê). O DRE ficou para trás no mesmo PR.

**Correção:** remover a linha de mensalistas do `revenueBreakdown` do DRE. Uma
linha, e o cartão de receita contratada continua cobrindo a informação.

---

### P1-3 · O encaixe morreu no app do cliente, e as duas pontas continuam anunciando que ele existe

**Onde:** `web/src/app/(cliente)/agendar/page.tsx:171-177, 364-372, 438-449`

Quando os horários passaram a vir do servidor, a tela perdeu a noção de "ocupado":
`availableSlots` devolve **apenas os livres** (`availability.ts:120-123`). A tela
monta os slots assim:

```tsx
// agendar/page.tsx:171-175
const slots = (horariosLivres ?? []).map((time) => ({
  time,
  available: true,      // ← cravado
  isFitIn: false,       // ← cravado
}));
const isFitIn = Boolean(selectedSlot?.isFitIn);   // sempre false
```

Com isso, **nenhum caminho do cliente cria um encaixe**. E quatro pedaços de
interface continuam pressupondo que ele existe:

| Onde | O que continua na tela |
|---|---|
| `agendar:370` | *"peça um encaixe nos horários marcados em vermelho"* — horários que nunca aparecem |
| `agendar:380` | o ramo `if (!slot.available && !slot.isFitIn)` é código morto |
| `agendar:438-449` | o cartão "Solicitação de encaixe" é inalcançável |
| `agendar:186-188` | o rótulo "Solicitar encaixe" do botão é inalcançável |

Do outro lado, o painel tem a seção **"Encaixes pendentes"**
(`painel/page.tsx:428-479`), a regra `encaixesAguardando` no Action Center
(`action-center.ts:339-358`) e o template `encaixe_solicitacao` no WhatsApp
(`notify.ts:59-79`) — tudo esperando um documento que nada cria.

E há um teste verde sobre a função que a tela abandonou:

```ts
// web/src/lib/__tests__/slots.test.ts:81
expect(slots.find((s) => s.time === "10:00")?.isFitIn).toBe(true);
```

`slotsForDate` continua correta e continua testada; ela só não é mais quem monta
a agenda. É a mesma lição do `sw.js` registrada no `HANDOFF.md` §3 — código
correto que nunca executa é indistinguível de código ausente, e nenhum teste
unitário pega.

**Correção:** `availableSlots` passa a devolver também os ocupados, marcados
(`{ time, livre: false }`), e a tela volta a oferecer encaixe sobre eles. O
cuidado que motivou devolver só os livres — não entregar a agenda ao cliente —
continua atendido: uma lista de horários sem nome de quem reservou não é a
agenda. Alternativa barata: remover as quatro peças de interface e assumir que
encaixe é caminho de WhatsApp.

---

### P1-4 · Remarcar oferece horários que já são de outra pessoa

**Onde:** `web/src/app/(cliente)/reservas/page.tsx:111-118`

A tela de agendar foi corrigida para pedir a disponibilidade ao servidor. A de
remarcar continua calculando local, com uma lista de ocupados que só enxerga as
reservas **do próprio cliente**:

```ts
// reservas/page.tsx:111-118
const slots = slotsForDate(selectedDay.iso, {
  durationMin: duracaoDaReserva,
  allowFitIn: false,
  schedule: tenant.schedule,
  ocupados: minhas.filter((b) => b.date === selectedDay.iso).map((b) => b.time),
  //        ^^^^^^ só as reservas DELE — as dos outros clientes são invisíveis
});
```

É exatamente o defeito que `availableSlots` foi criada para resolver, descrito em
`availability.ts:12-18`: *"a tela oferecia todos os horários; o cliente escolhia,
tocava em confirmar, e só então o servidor respondia que aquele horário já era de
outra pessoa"*. Na remarcação isso continua acontecendo — com o agravante de
que o cliente já tem um horário e pode ficar tentando várias vezes.

**Correção:** trocar `slotsForDate` por `availableSlots` nesta tela, como em
`/agendar`.

---

### P1-5 · A política de cancelamento mostrada ao cliente é a da plataforma, não a da barbearia

**Onde:** `web/src/app/(cliente)/agendar/page.tsx:481-488`

```tsx
<p>
  Cancelamento até 24h antes: 100% de volta. Entre 24h e 6h: taxa
  de cancelamento. Menos de 6h ou não comparecimento: sem reembolso.
</p>
```

Os números estão **escritos no JSX**, ignorando `tenant.policies.cancellation`.
Numa barbearia que configurou 48h/12h, a tela promete ao cliente uma janela que o
servidor não vai aplicar — e `cancelBooking` decide pela política da barbearia
(`booking.ts:454`).

É o mesmo defeito que o PR #16 corrigiu no painel do dono e está documentado no
`GO-LIVE-READINESS.md` §2.5 (*"`refundAmountFor` lia a constante da plataforma e
ignorava `tenant.policies.cancellation`"*). A correção foi aplicada onde o
**dono** vê a conta, e não onde o **cliente** vê. E viola a regra escrita em
`business-rules.ts:8-9`: *"NENHUM percentual, janela ou prazo pode ser escrito
direto numa tela"*.

A tela de Perfil (`perfil/page.tsx:294-325`) já lê da política — mas de
`cancellationPolicy`, a constante do módulo, não de `tenant.policies`. Mesmo
problema, um grau mais sutil.

**Correção:** as duas telas leem `usePolicies().cancellation`.

---

### P1-6 · Preço de mensalista inventado na tela do cliente

**Onde:** `web/src/app/(cliente)/page.tsx:129-130` ·
`web/src/app/(cliente)/perfil/page.tsx:157`

```tsx
Corte ilimitado a partir de R$ 149/mês      // Início
Planos a partir de R$ 149/mês                // Perfil
```

O valor não vem de `plans` — é literal. Numa barbearia cujo plano custa R$ 89, ou
que não tem plano nenhum cadastrado, a tela anuncia R$ 149 ao cliente final. E o
link leva ao checkout do P0-1.

**Correção:** derivar do menor `plan.price` ativo, e esconder o card quando não
houver plano.

---

### P1-7 · A Loja calcula comissão e imposto com a constante da plataforma

**Onde:** `web/src/app/painel/(dashboard)/loja/page.tsx:15, 59-72, 208, 308-322`

```ts
import { commissionSplit, splitSale, taxRatePct } from "@/lib/business-rules";
```

`splitSale` (`business-rules.ts:152-162`) usa `commissionSplit.barberPct` (40) e
`taxRatePct` (6) **do módulo**, não de `tenant.policies`. A barbearia que
combinou 50/50 vê 40% no simulador, na prévia de precificação e no rótulo
"Comissão do profissional (40% do lucro)".

A tela de Equipe já foi corrigida para isso, com o comentário explicando o motivo
(`equipe/page.tsx:32-33`): *"Do tenant, não da constante da plataforma: a
barbearia que combinou 50/50 via 40% aqui e o split correto no DRE — duas telas,
dois números"*. A Loja é a tela que ficou.

**Correção:** `splitSale` recebe as políticas por parâmetro, como
`refundAmountFor` já faz.

---

### P1-8 · A Loja não movimenta estoque nem gera receita

**Onde:** `web/src/app/painel/(dashboard)/loja/page.tsx` (ausência) ·
`web/src/lib/analytics.ts:77-79, 396-399`

Nada no repositório escreve em `inventory_movements` — a varredura por `createDoc`
encontra apenas `staff`, `products` e `expenses`. Não existe tela de venda, nem
de entrada de compra, nem edição de produto.

Consequências no financeiro, todas silenciosas:

| Cálculo | Fonte | Valor real hoje |
|---|---|---|
| `receita.produtos` | `movements` com `kind: "venda"` | sempre 0 |
| `cmv` | `movements` com `kind: "compra"` | sempre 0 |
| `commissionsLoja` | derivada do lucro da loja | sempre 0 |
| estoque do produto | campo `stock`, gravado no cadastro | nunca baixa |
| alerta de estoque mínimo | `p.stock < p.minStock` | só dispara se o dono cadastrar já abaixo |

A tela é, na prática, um cadastro com simulador de precificação. Isso é **escopo
ausente**, não defeito — exceto pelo alerta de estoque, que promete um controle
que não existe. Já estava registrado no `DOCUMENTACAO-TECNICA-FUNCIONAL.md` §17
e continua valendo.

---

### P1-9 · "Comissão do profissional" embaixo do faturamento da loja mostra a comissão total

**Onde:** `web/src/app/painel/(dashboard)/financeiro/page.tsx:284-290`

```tsx
<KpiTile
  label="Faturamento da loja"
  value={formatBRL(commercialStats.storeRevenue)}
  caption={`comissão do profissional: ${formatBRL(r.commissions)}`}
/>
```

`r.commissions` é `servico.total + commissionsLoja` (`analytics.ts:441`) — a
comissão do mês inteiro. Sob o cartão de faturamento da loja, ela lê como sendo
a comissão **daquela** receita. Numa barbearia com R$ 500 de loja e R$ 12.000 de
serviço, o cartão diz "Faturamento da loja R$ 500 · comissão do profissional
R$ 5.000".

O valor certo existe e está ao lado: `r.commissionsLoja`.

---

### P1-10 · "Crescimento líquido de mensalistas" conta os ativos como novos

**Onde:** `web/src/app/painel/(dashboard)/financeiro/page.tsx:51-60, 262-269`

```ts
const ativos = raw.subscribers.filter((s) => s.status === "ativo");
const commercialStats = {
  newSubscribers: ativos.length,          // ← todos os ativos, não os novos do mês
  cancellations: raw.subscribers.filter((s) => s.status === "cancelado").length,
  …
};
```

O KPI apresenta `+X novos · −Y cancelamento(s)`, com X sendo a base inteira. O
dado não sustenta a afirmação: `SubscriberDoc` (`domain.ts:124-134`) não tem
`createdAt` nem `canceledAt` — é o mesmo motivo pelo qual `receitaDoMes` limita o
MRR ao período de referência (`analytics.ts:105-109`).

**Correção:** enquanto não houver data no documento, o cartão deve dizer
"mensalistas ativos" e "cancelados", sem a leitura de fluxo.

---

### P1-11 · A legenda do caixa de hoje descreve a regra antiga

**Onde:** `web/src/app/painel/(dashboard)/page.tsx:373-376`

```tsx
<p className="text-xs text-ivory-muted">
  Pix e cartão contam assim que confirmados; dinheiro só entra quando
  o cliente é atendido e marcado como concluído.
</p>
```

`isReceived` foi unificado em `status === "completed"` para todos os métodos, e a
mudança está documentada no próprio `domain.ts:246-263` — inclusive com o motivo
(*"misturava regime de caixa com competência dentro do mesmo número"*). A
legenda ficou descrevendo o comportamento anterior, na tela que o dono abre
todo dia.

---

### P1-12 · O encaixe "expira em até 45 min" e nada expira

**Onde:** `web/src/app/painel/(dashboard)/page.tsx:446-448` ·
`web/src/app/(cliente)/agendar/page.tsx:443-448`

Os dois lados anunciam o prazo, e o cliente ainda ouve que *"sem resposta em até
45 min, o sistema libera opções de horários livres automaticamente"*. Não há
rotina de expiração: `fitInExpirationMinutes` é lido apenas para escrever esses
dois textos. Já registrado em `GO-LIVE-READINESS.md` §3; entra aqui porque a
tela **afirma** o comportamento em vez de apenas não tê-lo.

Detalhe secundário: os dois usam `bookingPolicy` do módulo, não
`tenant.policies.booking` — a barbearia que configurar outro prazo continuará
vendo 45.

---

### P1-13 · A política de 2 remarcações vive num `useState`

**Onde:** `web/src/app/(cliente)/reservas/page.tsx:84, 132-136, 165`

```ts
const [rescheduleCount, setRescheduleCount] = useState(0);   // zera a cada F5
…
const podeReagendar = … && rescheduleCount < reschedulePolicy.maxPerBooking;
const motivoBloqueio = … `Limite de ${reschedulePolicy.maxPerBooking} reagendamentos por reserva atingido.`
```

`rescheduleBooking` não grava contador nenhum (`booking.ts:355-361`). A tela
anuncia um limite que não existe — recarregar a página o remove. Já registrado
como pós-piloto; entra aqui pelo mesmo motivo do item anterior: a interface
afirma a regra.

---

### P1-14 · A projeção diz "acumulado nos 30 dias" em todos os horizontes

**Onde:** `web/src/app/painel/(dashboard)/financeiro/projecao/page.tsx:132-138`

O `caption` é fixo, e o seletor oferece 30, 91, 182 e 365 dias. Ao escolher
"Anual", o KPI mostra o acumulado de 365 dias rotulado como 30.

---

### P1-15 · O login abre na aba que não funciona

**Onde:** `web/src/app/login/page.tsx:68` · `web/src/app/login/page.tsx:46-47`

```ts
const [method, setMethod] = useState<Method>("phone");   // padrão
```

O provider Phone/SMS não está habilitado no projeto, e o próprio código sabe
disso — tem uma mensagem pronta para o erro:

```ts
"auth/operation-not-allowed":
  "Login por SMS ainda não está habilitado no projeto. Use e-mail ou Google.",
```

O cliente que recebe o link da barbearia cai em `/login` (o layout do app exige
sessão — ver P2-1), encontra **"Celular"** selecionado, digita o número, pede o
código e leva um erro que fala de "projeto". É o primeiro contato de todo cliente
com o produto, e ele está quebrado por padrão.

**Correção:** enquanto o provider não estiver habilitado, o padrão é `email` e a
aba "Celular" não aparece. A mensagem de erro também não deve falar em
configuração de projeto para o cliente final.

---

### P1-16 · Preferências de notificação não persistem, e a legenda promete entrega

**Onde:** `web/src/app/(cliente)/perfil/page.tsx:65-70, 260-291`

Quatro chaves em `useState`, nunca gravadas, com a legenda *"As mensagens chegam
no WhatsApp cadastrado na sua conta"* — não há WhatsApp cadastrado (P0-4) e não
há mensagens (integração pendente). Mesma família do P0-1, com dano menor porque
não envolve dinheiro.

---

## 4. P2 — estrutura e consistência

| # | Achado | Onde | Efeito |
|---|---|---|---|
| **P2-1** | Todo o app do cliente exige sessão: `AuthGuard` envolve o layout inteiro, inclusive a vitrine e `/agendar` | `(cliente)/layout.tsx:24` | quem recebe o link da barbearia não vê nada antes de criar conta. É atrito de conversão no principal canal de aquisição, e combina mal com o P1-15 |
| **P2-2** | `rescheduleBooking` valida a jornada da **loja**, e `createBooking` valida a do **barbeiro** | `booking.ts:312` vs `booking.ts:135-137` | remarcar para um dia em que aquele barbeiro folga é aceito pelo servidor |
| **P2-3** | Nenhuma das duas valida se o horário está **dentro** da jornada | `booking.ts:147-155`, `271-336` | uma chamada direta a `createBooking` grava reserva às 03:00. A tela não oferece, o servidor não recusa |
| **P2-4** | A jornada por barbeiro é lida pelo servidor e não tem interface | `availability.ts:77-84`, `equipe/page.tsx` | `staff.schedule` nasce `null` e nunca muda: folga e horário próprio são funcionalidade inalcançável |
| **P2-5** | `provisionBarbershop` não grava `schedule` | `provisioning.ts:106-127` | a barbearia assistida cai nos defaults do código (09:00–19:00, sem intervalo) em vez de ter a jornada no documento, como a self-service |
| **P2-6** | O limite "uma barbearia por conta" é verificado fora da transação | `signup.ts:119-129` | duas requisições simultâneas passam as duas. Impacto baixo, correção barata |
| **P2-7** | Fidelidade não consulta a feature do plano | `loyalty.ts:26, 68` | barbearia no plano Agenda (sem `loyalty`) acumula e resgata carimbos pelo servidor; só a tela esconde |
| **P2-8** | `reabrirConta` devolve para `suspenso` | `data-deletion.ts:143-149` | quem encerrar durante o teste e se arrepender perde o trial e cai em modo leitura |
| **P2-9** | O expurgo varre `collectionGroup("memberships")` inteiro e filtra em memória | `data-deletion.ts:203-206` | custo cresce com a base toda, não com a barbearia apagada |
| **P2-10** | As regras do Storage continuam fora do deploy | `.github/workflows/deploy.yml` | inofensivo hoje (nenhuma tela usa Storage); vira buraco na primeira tela de upload. Já registrado |
| **P2-11** | O comentário do deploy sobre função órfã está desatualizado | `deploy.yml` (bloco "Publicar functions por NOME") | `revisarAssinaturas` **está** no repositório desde 12/08; o texto ainda a descreve como órfã |
| **P2-12** | Mapa de calor e "hoje" usam o fuso do navegador | `analytics.ts:649`, `painel/page.tsx:56, 295` | consistente com a decisão registrada em `action-center.ts:186-192`, mas diverge do servidor, que usa `tenant.locale.timeZone`. Só aparece com barbearia fora do fuso do dono |

---

## 5. Onde a documentação diverge do código

O `HANDOFF.md` §5.5 pede explicitamente que a documentação não seja tratada como
fonte de verdade acima do código. Estas são as divergências encontradas ao cruzar
os dois:

| Documento | O que afirma | O que o código mostra |
|---|---|---|
| `STATUS-ATUAL.md` §3 | "Cloud Functions — 18 no código" | **21**. A lista omite `encerrarConta`, `reabrirConta` e `expurgarContasEncerradas` |
| `GO-LIVE-READINESS.md` §2.2 | "As 19 Cloud Functions executam com essa identidade" | 21. O risco descrito não muda |
| `STATUS-ATUAL.md` §1 | "13 commits de 12/08, **não empurrados**" | tudo mergeado; `main` local = `origin/main` = `659091a` |
| `HANDOFF.md` §8 | "`main` = `c9b3671` — mais o PR #18, verde e aguardando merge" | `main` = `659091a`, e o PR #18 **entrou** — o conteúdo dele veio junto no `659091a` (#19) |
| `DOCUMENTACAO-TECNICA-FUNCIONAL.md` §4 | `plan: "entrada" \| "completo"` | `"agenda" \| "crescimento" \| "gestao"` desde 12/08 |
| `DOCUMENTACAO-TECNICA-FUNCIONAL.md` §4 | `isReceived` = ocupa horário **e** pagamento ≠ `local` | `status === "completed"`, para todos os métodos |
| `DOCUMENTACAO-TECNICA-FUNCIONAL.md` §10 | "Bloqueio total, não modo leitura" | modo leitura desde 12/08 — e não aplicado (P0-5) |
| `DOCUMENTACAO-TECNICA-FUNCIONAL.md` §12 | `bruta = caixa + mensalistas` | `bruta = caixa` desde o PR #18 |
| `DOCUMENTACAO-TECNICA-FUNCIONAL.md` §17 | "Taxa de maquininha: `gatewayFeesTotal` é sempre 0; não há onde cadastrar" | existe em `/painel/configuracoes` e alimenta o DRE |

> **Sobre as dez branches "não mergeadas".** `git branch -r --no-merged main`
> lista dez, e isso assusta mais do que deveria: o repositório usa **squash
> merge**, então a branch de origem nunca é registrada como mesclada, ainda que
> o conteúdo inteiro esteja na `main`.
>
> Conferidas uma a uma com `git diff main origin/<branch>`: **nenhuma acrescenta
> arquivo ou linha que a `main` não tenha.** Todo o diff é de remoção — ou seja,
> são fotografias mais antigas do mesmo trabalho. `docs/lente-de-confianca` é
> idêntica à `main`; a do PR #18 difere só por um `HANDOFF.md` anterior. As
> únicas adições encontradas são os logs do `.playwright-mcp/`, apagados de
> propósito em 12/08.
>
> As dez são seguras de apagar, e o critério é este diff — não a lista de não
> mergeadas, que com squash merge não significa o que parece.

A §6 deste documento e a `DOCUMENTACAO-TECNICA-FUNCIONAL.md` foram reescritas
nesta rodada para o estado atual.

---

## 6. O que está certo e vale preservar

Auditoria que só lista defeito faz refatorar o que está bom. Estes pontos foram
verificados e sustentam o resto:

- **Isolamento multi-tenant.** Estrutural, por subcoleção, com fallback `if false`
  duplo e nenhum `get()` dentro da regra. `paths.ts` torna impossível escrever um
  caminho sem `barbershopId`. Não achei caminho de vazamento entre barbearias.
- **Congelamento do dinheiro no fato.** `materializeFinancialsOnCompletion` grava
  `commissionPct`, `commissionBase`, `feePct` e `feeAmount` no momento da
  conclusão, com id derivado do `bookingId` — idempotente por construção. O
  fallback derivado em `comissoesDeServico` só vale para o histórico anterior ao
  gatilho, exatamente como deve.
- **Comissão por pessoa nas regras.** `commissions` só é legível pelo dono ou
  pelo barbeiro dono do `uid`. É o tipo de detalhe que raramente aparece antes de
  causar problema.
- **Fuso por barbearia, sem padrão implícito.** `locale.ts` calcula o
  deslocamento para a data em questão, e não fixo — horário de verão incluído.
- **Motor de decisão fora da tela.** `action-center.ts` e `analytics.ts` são
  funções puras, testáveis sem emulador, e as telas apresentam o que elas
  decidiram. É o que permitiu que 318 testes cobrissem regra de negócio de
  verdade.
- **`soAvisaSeGravou`.** A regra "grava antes de avisar" virou módulo com teste.
  Falta aplicá-la no app do cliente (P0-1, P0-4, P1-16).
- **A esteira de deploy.** Trava de alvo por três origens independentes, Actions
  fixadas por SHA, credencial escrita depois de todo `npm ci` e destruída no fim,
  aprovação humana obrigatória. É melhor que a média do mercado.
- **`tenant-shape.ts` como normalização única.** Servidor e painel leem a mesma
  ficha pelo mesmo merge, com política parcial tratada campo a campo.

---

## 7. Ordem de correção sugerida

A ordem é por **dano × custo**, não por gravidade pura.

### Antes de qualquer barbearia real entrar

| # | Achado | Custo | Por que primeiro |
|---|---|---|---|
| 1 | **P0-1** — tirar `/planos` do app do cliente | minutos | é o único que produz dano a um terceiro, e a correção mínima é remover uma rota do menu |
| 2 | **P0-3** — guarda de status no `cancelBooking` | minutos | 4 linhas; evita apagar receita já registrada |
| 3 | **P0-2** — conflito por intervalo | algumas horas | é o defeito que o dono descobre com dois clientes na cadeira, e o que mais destrói confiança |
| 4 | **P0-4** — coletar o WhatsApp do cliente | algumas horas | sem ele, nada do plano de comunicação funciona, mesmo com a Meta liberada |
| 5 | **P1-15** — login abrir no e-mail | minutos | é a porta de entrada de todo cliente |

### Antes de cobrar de alguém

| # | Achado | Por quê |
|---|---|---|
| 6 | **P0-6** — trial com data, função de plano, `features` explícito | sem isso não existe cobrança possível |
| 7 | **P0-5** — `useFeature` derivando de `acessoDaBarbearia`, e `podeEditar` no `repository.ts` | sem isso o plano não separa nada e o aviso de leitura mente |

### Higiene de números — barato e visível

| # | Achados | Custo |
|---|---|---|
| 8 | **P1-1** (despesas "no mês"), **P1-2** (mensalista no DRE), **P1-9** e **P1-10** (rótulos do Financeiro), **P1-11** (legenda do caixa), **P1-14** (horizonte da projeção) | uma linha cada, quase todos |
| 9 | **P1-5**, **P1-6**, **P1-7** — política e preço vindos do tenant, não do módulo | pequeno, e fecha uma classe inteira de defeito |

### Decisão de produto, não de código

| # | Achado | A pergunta |
|---|---|---|
| 10 | **P1-3** — encaixe | reativar o fluxo no app ou assumir que encaixe é caminho de WhatsApp? Hoje ele está anunciado nos dois lados e não existe |
| 11 | **P1-8** — loja | vender produto pelo sistema entra no piloto? Se não, o alerta de estoque deveria sair |
| 12 | **P2-1** — vitrine sob login | a barbearia consegue divulgar um link que exige cadastro antes de mostrar preço? |

---

*Auditoria conduzida sobre `659091a` em 17/08/2026. Cada achado nomeia arquivo e
linha; nenhum foi promovido a partir de documentação.*

---

## 8. Um achado retirado, e a regra que ele produziu

Durante o Day in the Life de 17/08, foi levantado como **achado crítico** que o
dono autenticava com credenciais válidas e a tela não saía do login.

A evidência era o `lastLoginAt` do emulador de Auth, que mostrava uma
autenticação bem-sucedida segundos antes da observação.

**O achado estava errado.** O log do servidor de desenvolvimento mostrava, nas
mesmas tentativas:

```
[auth] auth/user-not-found   FirebaseError
[auth] auth/user-not-found   FirebaseError
[auth] auth/wrong-password   FirebaseError
```

A autenticação **falhou de fato**, por resíduo acumulado nos campos pela
automação do teste. O produto se comportou corretamente: recusou a credencial e
exibiu *"Senha incorreta."* em português.

`lastLoginAt` registrava uma sessão anterior, e foi lido como se fosse a da
tentativa observada. **Uma evidência adjacente foi tomada por prova.**

### A regra

> **Nenhum FAIL sem evidência que reproduza o comportamento do produto.**
>
> Sinal de infraestrutura — timestamp, contador, métrica — indica onde procurar.
> Não substitui ver o produto fazendo a coisa errada.

É a mesma família dos defeitos que esta auditoria persegue, invertida: em vez de
o sistema afirmar algo que não aconteceu, foi **a auditoria** que quase afirmou.
Registrado porque o custo de um falso P0 é alto — ele desvia esforço de
correções reais e corrói a confiança em toda a lista.

O episódio também expôs um limite de método: **automação não executa Day in the
Life.** Metade do que ele mede é se a pessoa entende a tela, e isso nenhum script
responde. O roteiro em `DAY-IN-THE-LIFE.md` é para execução humana, por alguém
que não participou da construção.

---

## 9. D13 contra a especificação — o que o BLUEPRINT diz

Levantado em 17/08 para decidir se **D13** (o dono não consegue criar uma
reserva) é divergência de produto ou comportamento conforme.

A pergunta é uma só: **o proprietário deveria conseguir criar reserva em nome do
cliente, segundo a proposta oficial?**

### O que o BLUEPRINT especifica

**§3.2 — Cliente** (`barbershops/{id}/clients/{id}`, marcado ❌ **criar**):

```ts
uid: string | null;                        // conta no app; nulo para walk-in
origin: "app" | "balcao" | "importacao";
```

> **Invariante:** `whatsapp` único por barbearia — chave de deduplicação entre
> quem agenda pelo app e **quem chega no balcão**.
>
> **Escreve:** `createBooking` (upsert), **tela de Clientes**.

**§3.5 — Reserva:** *"Criada **só** por `createBooking`."*

**Bloco 2 — OPERAR** lista as ações do painel: *"iniciar · concluir · não
compareceu"*, e *"Agenda semanal e por profissional"* como ausente. **Não
menciona criar reserva.**

### O que isso permite afirmar

✅ **O produto prevê o cliente que não usa o app.** `uid: null` para walk-in e
`origin: "balcao"` são explícitos, e a invariante de deduplicação existe
justamente para conciliar quem agenda pelo app com quem chega no balcão.

✅ **A especificação prevê uma tela de Clientes** que escreve esse documento —
ela não existe hoje.

❌ **A especificação NÃO diz, em nenhum ponto, que o dono cria reservas.** Ela
diz que a reserva é criada *só* por `createBooking`, e `createBooking` usa o
`uid` de quem chama como `clientId` — ou seja, no desenho atual só cria reserva
**para si mesmo**.

### Conclusão

**D13 permanece 🟠 GAP DE PRODUTO / DECISÃO PENDENTE.** Não sobe a release
blocker, porque a especificação não o contradiz explicitamente.

Mas o levantamento acrescenta uma evidência que aperta a decisão: **a
especificação descreve um cliente de balcão, sem conta no app, e não descreve o
caminho pelo qual a reserva dele nasce.** É uma lacuna da própria especificação,
não uma decisão de manter o produto self-service.

A pergunta para a decisão deixa de ser *"o blueprint permite?"* e passa a ser:

> Como um cliente com `origin: "balcao"` e `uid: null` — que a especificação
> prevê — consegue ter um horário marcado?

Hoje não consegue. Ou a resposta é uma tela de agendamento no painel, ou é a
tela de Clientes prevista em §3.2 com a reserva saindo dali. As duas passam pelo
mesmo lugar: **alguém que não é o cliente precisa poder criar a reserva.**

> **A regra que este levantamento respeita.** A auditoria quase criou um bug de
> login que não existia (§8); o risco simétrico é transformar uma expectativa
> nossa em requisito que nunca foi especificado. Por isso D13 fica onde está até
> a decisão de produto — e o que está registrado acima é o que o documento diz,
> não o que seria razoável ele dizer.
