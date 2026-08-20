# Rodada 2 — a operação que falta

> **Parcial: G3-mínimo, D13, P1-4 e P1-13 fechados. G1 e G2 seguem abertos.**

Baseline de comparação: `aadf76f`. Rodada 1 em `283b11c`.

Nenhum item toca o modelo financeiro. D3 e D8/D11 continuam intactos.

---

## 1. A auditoria que veio antes do código

A decisão de identidade de G3 exigia saber o que `bookings.clientId` **é hoje**,
não o que o blueprint gostaria que fosse. O levantamento achou nove pontos:

| # | Onde | O quê |
|---|---|---|
| 1 | `booking.ts:214,223` | grava `clientId: uid`. Era o **único** caminho de criação |
| 2 | `firestore.rules:201` | `bookings`: `resource.data.clientId == request.auth.uid` |
| 3 | `firestore.rules:253` | `ownsResource()` — vale para `payments`, `commissions`, `loyalty_transactions` |
| 4 | `booking.ts:386` | `rescheduleBooking`: `booking.clientId !== uid && !ehDono` |
| 5 | `booking.ts:562,599` | `cancelBooking`, e o rótulo `peloDono` |
| 6 | `booking.ts:289` | teto de reservas ativas: `where("clientId","==",uid)` |
| 7 | `loyalty.ts:93` | saldo de carimbos: `where("clientId","==",uid)` |
| 8 | `use-shop-data.ts:59,71` | `useMyBookings(user?.uid)` / `useLoyalty(user?.uid)`, em 3 telas |
| 9 | `autorizacao-functions.test.ts:196` · `isolamento-multi-tenant.test.ts:233,303` | testes que **falham** se o contrato mudar |

**Conclusão: `clientId = uid` é o contrato**, e ele não foi refatorado.

O blueprint §3.5 diz *"referência a `clients/{id}`"*, mas §3.6 mostra o idioma
dele para esse caso: `CommissionDoc` carrega `staffId` **e** `uid` como campos
separados. Ele separa referência de identidade quando precisa das duas.
`clients/{uid}` faz as duas coincidirem para quem tem conta — mesma intenção,
menos peça, e zero migração.

---

## 2. G3-mínimo — o cliente da barbearia

```
com conta   clients/{uid}       uid: "abc"   origin: "app"
sem conta   clients/{gerado}    uid: null    origin: "balcao"
```

Escopo exatamente o que foi pedido: identificação, WhatsApp único por barbearia,
uid opcional, origin, vínculo. **Não é CRM** — visitas, ticket médio e risco de
perda continuam sendo derivados de `bookings`, como o blueprint manda.

### Três decisões, e o que cada uma protege

**Número incompleto não é chave.** `whatsappServeComoChave` exige 10–13 dígitos.
Se "119" servisse, duas pessoas com digitação pela metade virariam um cadastro
só, e a reserva de uma apareceria no histórico da outra. Pior que duplicar.

**A fusão preserva o fato.** Balcão que depois cria conta: o cadastro antigo vira
`active: false` com `mergedInto` apontando para o novo, e **as reservas antigas
continuam apontando para o id antigo**. Reescrever histórico para arrumar um
cadastro seria trocar o fato pelo cadastro.

**A reserva de balcão é invisível para qualquer conta do app.** O `clientId`
gerado não iguala nenhum `request.auth.uid`. É o desenho, e é também um limite
declarado: o walk-in que criar conta depois não vê o histórico anterior até haver
fusão.

### O defeito que a arquitetura do Firestore quase deixou passar

A primeira versão lia e gravava numa função só. **Transação do Firestore exige
todas as leituras antes de qualquer escrita** — ela teria passado por typecheck e
pelos testes puros e explodido em runtime, na primeira reserva real.

`resolverCliente` foi partida em duas fases: só lê, e devolve o id junto com a
escrita pendente, que roda no fim ao lado do `tx.set` da reserva. O primeiro
teste de `clients-transacao.test.ts` existe só para travar isso.

### Isolamento

`clients` foi acrescentada à suíte de ataque, que enumerava 19 subcoleções e
teria deixado de fora justamente a que guarda a carteira de contatos. **76 → 87
verificações**, incluindo: o dono da Alfa não lista os clientes da Beta, o
cliente lê só o próprio cadastro, ninguém escreve direto.

---

## 3. D13 — a reserva que nasce no balcão

`createBookingAtCounter`, e o fluxo `MarcarNoBalcao` no painel Hoje — onde o dono
está quando alguém chega.

**O que não foi duplicado.** `validarPedido` foi extraída e serve os dois
caminhos: barbeiro, serviço, jornada, catálogo, preço e duração. A gravação passa
por `gravarComTravaDeHorario` — a mesma transação, a mesma janela de ocupação, a
mesma trava exercida por `booking-concorrencia.test.ts`. Duplicar teria recriado
o padrão que esta auditoria mais encontrou: duas fontes para a mesma pergunta,
com a correção aplicada só numa delas.

**As duas diferenças deliberadas:**

1. **Quem chama** é `owner` ou `staff` daquela barbearia — é o que permite marcar
   em nome de outra pessoa sem reabrir o buraco que `createBooking` fecha ao usar
   sempre o próprio uid.
2. **Não há antecedência mínima.** A regra existe para o cliente não marcar às
   14:55 um horário de 15:00 que o barbeiro não veria a tempo. No balcão quem
   marca é quem vai atender. Dia anterior continua barrado — lançar atendimento
   de ontem move receita entre competências, e isso é decisão de modelo.

**Sem pagamento.** O fluxo termina em reserva confirmada. Pagamento antecipado
saiu do produto em 17/08, e trazê-lo de volta aqui de carona seria reintroduzir
pela porta lateral o que D14 tirou da frente.

**O teto por cliente NÃO foi isentado** — decisão de executar com a regra atual e
medir na operação. Tem teste: a quarta reserva ativa do mesmo cliente de balcão é
recusada.

---

## 4. O que só apareceu ao abrir a tela

Os testes estavam verdes antes disto. **Nenhum dos três defeitos abaixo seria
encontrado por suíte** — os três foram vistos operando o produto.

| O que estava errado | Como apareceu |
|---|---|
| **A tela não oferecia o caso mais comum.** Com 15:55 no relógio, o primeiro horário era **17:00**: o fluxo pedia horários por `availableSlots`, que aplica a antecedência mínima do cliente. O servidor aceitava "agora"; a tela não deixava chegar lá | escolhendo serviço e barbeiro e olhando a lista |
| **Frase falsa na tela.** Com um WhatsApp válido digitado, a dica dizia *"Sem WhatsApp, este cliente não é reconhecido na próxima visita"* — a condição tinha dois estados onde precisava de três | preenchendo o formulário |
| **A busca por número não funcionava.** Ela usava `normalizarWhatsapp`, que é a função de **gravar**: devolve `""` abaixo de 10 dígitos. Todo fragmento virava string vazia, e procurar "97777" com o cadastro "(11) 97777-6666" na base não devolvia nada — o dono não acha, clica em "Cliente novo", e nasce o cadastro duplicado que G3 existe para evitar | procurando um cliente que eu sabia estar lá |

O terceiro virou `lib/clientes-busca.ts` com 12 testes. **Guardar e procurar são
operações diferentes, e a normalização de uma não serve para a outra.**

> Vale registrar o inverso também: numa das tentativas o modal *pareceu* não
> abrir. Não era defeito — os cliques sintéticos da automação não chegavam ao
> React. Verificado por script (`overlays: 0 → 1`) antes de virar achado. É a
> regra 2 funcionando: **nenhum FAIL sem evidência que reproduza o
> comportamento do produto.**

---

## 5. A evidência de operação

Ambiente isolado no emulador (`.env.development.local`, removido depois), base
semeada sem nenhuma reserva.

| Passo | O que aconteceu |
|---|---|
| login | abriu **direto em e-mail**, sem aba de celular — P1-15 confirmado na tela |
| painel | legenda do caixa com o texto novo — P1-11 confirmado na tela |
| marcar | Corte · Rafael · **16:00** (relógio 15:59) · "Seu Zé da Esquina" · 11977776666 |
| resumo | `R$ 50,00 · 30 min · Rafael` · **"pagamento no atendimento"** |
| confirmar | *"Reserva confirmada"* |
| agenda | `16:00 · Seu Zé da Esquina · (11) 97777-6666 · Corte · A pagar no salão · R$ 50,00` com **Concluir** e **Cancelar** |
| KPIs | `R$ 50,00 previsto · 1 atendimento · 3% ocupação · 35 horários livres` |
| segundo atendimento | achado pela busca "97777", cadastro **reusado** |

Estado no banco ao final:

```
CLIENTES: 1
  zXiRFYVpgazHTfdSnuyO  Seu Zé da Esquina  5511977776666  uid=null  balcao
RESERVAS: 2
  16:00  [Corte]  clientId=zXiRFYVpgazHTfdSnuyO  origin=balcao
  18:30  [Barba]  clientId=zXiRFYVpgazHTfdSnuyO  origin=balcao
```

Duas reservas, **um cadastro**. `paymentMethod: null`, `paymentOrigin:
"in_person"`, `status: confirmed`.

### O que esta evidência NÃO é

Não é o Day in the Life. Quem operou fui eu, que construí o fluxo — sei onde
clicar e o que esperar. O que ela prova é que **o caminho existe e funciona
ponta a ponta**; se uma pessoa que nunca viu o produto o encontra e entende,
continua sendo pergunta em aberto, para um executor humano independente.

---

## 6. P1-4 e P1-13

**P1-13 era pior que o registrado.** O achado dizia "o limite vive num `useState`
e zera com F5". A verdade: `rescheduleBooking` **nunca ouviu falar do limite** —
validava só a janela de horas. A regra não existia; existia a frase na tela.

`rescheduleCount` virou campo do documento, gravado com `FieldValue.increment(1)`
**dentro da transação** que move o horário — contar fora dela deixaria duas
remarcações concorrentes passarem pelo mesmo teto. Sete testes, incluindo:
contagem ausente vale zero (não pune reserva antiga), valor negativo não vira
crédito, `maxPerBooking: 0` proíbe em vez de cair no padrão, e o dono não tem
teto — mesma isenção que ele já tem na janela de horas.

**P1-4:** a remarcação usava `slotsForDate` passando como ocupados **apenas as
reservas do próprio cliente**. Passou a usar `availableSlots` com o `staffId` da
própria reserva — remarcar mantém o profissional, e perguntar pela loja inteira
devolveria horário livre em outro barbeiro, trazendo o erro de volta pela porta
de trás.

---

## 7. Verificação

| | Rodada 1 | Agora |
|---|---|---|
| `web` — typecheck · lint · testes | 303 | ✅ **314** |
| `web` — build | ✅ | ✅ compilado |
| `functions` — typecheck · testes | 222 | ✅ **237** |
| concorrência (emulador) | 13 | ✅ **13** |
| clientes G3 (emulador) | — | ✅ **15** |
| balcão D13 (emulador) | — | ✅ **23** |
| isolamento multi-tenant | 76 | ✅ **87** |
| regras Firestore + Storage | 66 | ✅ **66** |
| | 680 | **755** |

Como sempre: **755 não significa produto pronto.** O estado é *755 verificações
automatizadas válidas + a evidência de operação da §5 + o Day in the Life ainda
pendente*.

---

## 8. O que falta na Rodada 2

**G1 — venda de produto.** `InventoryMovementDoc` já prevê `paymentMethod` e
`unitCost` **congelado**: fazer G1 certo produz exatamente o dado que D3, D4 e D7
vão precisar. Não corrigir D3 ainda — primeiro o sistema produz o fato.

**G2 — mensalista.** `clientId → subscription → plano → cobrança contratada`, sem
contaminar a receita realizada. A regra de D6 vale aqui: contratado projeta,
realizado fatura.

Depois disso os três fatos existem, e a Rodada 3 corrige CMV, caixa e taxas sobre
dado que nasce no produto.

---

*Executada em 17/08/2026 sobre `283b11c`.*
