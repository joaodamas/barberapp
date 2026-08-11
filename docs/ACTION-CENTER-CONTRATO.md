# Action Center — contrato de decisão

Especificação das situações que o painel Hoje deve levantar. **Não é desenho de
interface** — é a regra que decide o que aparece, quando, com que prioridade e o
que o dono pode fazer a respeito.

Escrito em 11/08/2026 sobre a tag `milestone/bloco-1-financeiro-confiavel`.
Abre o Bloco 2. Nenhuma linha de código foi escrita para produzi-lo.

---

## 1. O princípio

> **Indicador informa estado. Item do Action Center exige decisão.**

Um número que o dono lê e segue a vida é indicador — vai para o topo da tela.
Um item que o dono lê e precisa *fazer alguma coisa* é ação — vai para o Action
Center. A fronteira é essa, e ela é dura:

| Frase | Onde vive | Por quê |
|---|---|---|
| "Faturamento hoje: R$ 850" | indicador | não há o que fazer |
| "Faturamento 22% abaixo do esperado para este horário" | atenção | pode-se agir sobre a tarde |
| "1 atendimento concluído sem forma de pagamento" | crítico | há uma ação exata |
| "3 horários livres entre 16h e 19h" | oportunidade | dá para preencher |

Sem essa fronteira o painel vira o problema clássico: dezessete cards, nove
alertas, e o dono abrindo o sistema sem saber o que fazer.

**Regra de admissão.** Um item só entra no Action Center se responder às três
perguntas: *o que aconteceu*, *por que isso importa agora* e *o que eu faço*.
Faltando qualquer uma, é indicador.

---

## 1.1 Invariantes do Action Center

Aprovados em 11/08. Valem para toda regra, presente e futura.

1. **Só situação acionável.** Se a única resposta possível for "entendi", é
   indicador.
2. **Ação não executável pelo sistema nunca é crítica.** Alerta que não leva a
   lugar nenhum vira, no máximo, atenção.
3. **`insufficient` nunca gera ação.** Indicador ruim é ignorado; alerta falso
   destrói a confiança no produto.

   ```
   real         → pode gerar ação
   estimated    → pode aparecer; nunca como crítico
   insufficient → não entra no Action Center
   ```

4. **Não criar estado persistente para o que se determina com segurança do
   estado existente.** Evita inflação do domínio. Revisar só se a inferência
   produzir falso positivo.
5. **Política mora no tenant, não no código.** O motor conhece
   `policies.booking.lateToleranceMinutes`, nunca o número 15.
6. **A decisão pertence ao motor, não à interface.** A UI apresenta o que o
   motor decidiu; não existe regra de negócio em JSX.

   ```
   ActionCenterEngine → avaliadores → ActionItem[] → UI
   ```

7. **Item morre por mudança de estado, nunca por descarte.** O Action Center
   é retrato da operação agora, não caixa de notificações. Não existe
   "dispensar".
8. **Uma representação canônica por problema.** O mesmo atendimento sem
   pagamento não pode gerar três itens com nomes diferentes. O `id` do item é
   derivado de tipo + alvo, e isso é o que garante a unicidade.

## 2. Vocabulário de prioridade

| Nível | Significado | Custo de ignorar |
|---|---|---|
| 🔴 `critical` | dinheiro ou cliente em risco **agora** | perde receita ou confiança hoje |
| 🟡 `warning` | desvio do esperado, ainda reversível | vira crítico se ninguém agir |
| 🔵 `opportunity` | ganho possível, sem risco | não perde nada, deixa de ganhar |

Não existe nível "informação" — isso é indicador, não ação.

**Teto de itens:** no máximo 3 críticos visíveis por vez. Uma lista de dez itens
críticos não é urgência, é ruído — e o dono aprende a ignorar a seção inteira.

**O teto exige ordem, senão vira ocultação.** Dentro da mesma severidade, a
posição é decidida por urgência operacional:

| Urgência | Significado | Exemplos |
|---|---|---|
| `P1` | impede operar ou corrompe o financeiro | sem serviço cadastrado · fechamento pendente |
| `P2` | atendimento acontecendo agora | atraso · encaixe aguardando |
| `P3` | risco operacional sem prazo imediato | taxas não configuradas |

O que passa do teto **não some**: fica atrás de um "ver mais N". Esconder
problema é pior que listar demais.

---

## 3. O ciclo operacional que existe hoje

Levantado no código. É a base de qualquer regra, e tem buracos.

```
                    createBooking
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   confirmed                       fit_in_requested
        │                                 │
        │ ◄── webhook WhatsApp            │ ◄── dono aprova (painel)
        ▼                                 ▼
 confirmed_by_client ──────────────► confirmed
        │
        │ ◄── dono conclui + informa método (painel)
        ▼
   completed ──► commission + payment materializados
        │
        │ ◄── cancelBooking
        ▼
 cancelled_by_client / cancelled_by_shop
```

### Estados e quem os alcança

| Estado | Quem grava | Alcançável? |
|---|---|---|
| `confirmed` | `createBooking` | ✅ |
| `fit_in_requested` | `createBooking` com `isFitIn` | ✅ |
| `confirmed_by_client` | webhook do WhatsApp (botão) | ⚠️ só por WhatsApp, não pela UI |
| `completed` | painel Hoje | ✅ |
| `cancelled_by_client` / `cancelled_by_shop` | `cancelBooking` | ✅ |
| `no_show` | **ninguém** | ❌ estado órfão |
| `pending_payment` | **ninguém** | ❌ depende de gateway |
| `expired` | **ninguém** | ❌ o webhook só o lê |

### As três lacunas do ciclo

1. **`no_show` é estado órfão.** Existe em `OCCUPIES_SLOT`, em
   `bookingStatusMeta` e nas listas do servidor, e nenhum caminho o grava. Sem
   ele, falta é indistinguível de atendimento que ninguém fechou.

2. **Não existe "em atendimento".** O ciclo pula de `confirmed` para
   `completed`. Sem esse estado não dá para saber se o barbeiro está ocupado
   agora, e "atendimento atrasado" precisa ser inferido do relógio.

3. **`confirmed_by_client` só chega pelo WhatsApp.** O painel exibe o rótulo
   "Confirmou presença" e não tem como registrá-lo. Enquanto o envio não estiver
   ativo, o estado é inalcançável na prática.

---

## 4. Catálogo de situações

Formato fixo: condição · prioridade · fonte · ação · quando some · confiança ·
eventos necessários · suporte atual.

### 4.1 🔴 Fechamento pendente

O atendimento foi concluído e ninguém informou como o cliente pagou.

| | |
|---|---|
| **Condição** | `status = completed` **e** `paymentMethod = null` |
| **Fonte** | `bookings` — campo já existe e é gravado desde 11/08 |
| **Ação** | *Registrar pagamento* → abre o modal de fechamento |
| **Some quando** | `paymentMethod` deixa de ser nulo |
| **Confiança** | 🟢 real |
| **Eventos** | nenhum novo |
| **Suporte hoje** | ✅ **regra implementável sem nada novo** |

> Custo de ignorar: o pagamento fica materializado com taxa zero e o lucro do
> mês aparece maior do que é. É a primeira regra que eu implementaria — a única
> crítica que já tem fonte de dado completa.

### 4.2 🔴 Atendimento atrasado

Passou do horário e a reserva continua em aberto.

| | |
|---|---|
| **Condição** | `status ∈ {confirmed, confirmed_by_client}` **e** `data+hora + tolerância < agora`, no fuso do tenant |
| **Fonte** | `bookings` + `tenant.locale.timeZone` |
| **Ação** | *Concluir* · *Marcar falta* |
| **Some quando** | vira `completed`, `no_show` ou cancelado |
| **Confiança** | 🟡 estimado — o sistema infere do relógio, não observa a cadeira |
| **Eventos** | `cliente.nao_compareceu` para a segunda ação |
| **Suporte hoje** | ⚠️ detecção sim; a ação "marcar falta" não existe |

> **Tolerância precisa ser política, não constante.** Barbearia trabalha com
> atraso normal. Sugiro `policies.booking.lateToleranceMinutes`, padrão 15 —
> sem isso, todo atendimento vira alerta e a seção perde credibilidade antes do
> almoço.

### 4.3 🔴 Encaixe aguardando resposta

| | |
|---|---|
| **Condição** | `status = fit_in_requested` |
| **Fonte** | `bookings` |
| **Ação** | *Aprovar* · *Recusar* — ambas já existem no painel |
| **Some quando** | vira `confirmed` ou `cancelled_by_shop` |
| **Confiança** | 🟢 real |
| **Eventos** | nenhum novo |
| **Suporte hoje** | ✅ **já implementado** no "Precisa de você" |

> `bookingPolicy.fitInExpirationMinutes` (45) existe e ninguém expira nada.
> Passado o prazo, o item deveria virar `expired` — hoje fica pendente para
> sempre.

### 4.4 🔴 Nenhum serviço cadastrado

| | |
|---|---|
| **Condição** | `services` vazio **e** consulta em estado `pronto` |
| **Fonte** | `services` |
| **Ação** | *Cadastrar serviços* |
| **Some quando** | existe ao menos um serviço ativo |
| **Confiança** | 🟢 real |
| **Suporte hoje** | ✅ **já implementado** |

> A guarda de `status === "pronto"` é o padrão a repetir em toda regra: lista
> vazia porque não chegou é diferente de vazia porque não existe.

### 4.5 🟡 Cliente não compareceu

| | |
|---|---|
| **Condição** | `status = no_show` sem tratamento posterior |
| **Fonte** | `bookings` |
| **Ação** | *Reagendar* · *Registrar ocorrência* |
| **Some quando** | reagendado, ou a ocorrência é registrada |
| **Confiança** | 🟢 real, uma vez que o estado seja alcançável |
| **Eventos** | `reserva.nao_compareceu` — grava `status = no_show` na reserva |
| **Suporte hoje** | ❌ **estado órfão — nada grava `no_show`** |

> **Pré-requisito do bloco: dar um caminho ao `no_show`.** Sem ele não há como
> medir falta, entender perda de receita nem alimentar a régua de pagamento
> antecipado, cujo template de WhatsApp já existe.
>
> **`client_occurrences` NÃO entra junto.** São camadas diferentes: `no_show` é
> evento operacional da reserva; `client_occurrences` é estrutura relacional do
> cliente. Acoplar as duas criaria uma pseudo-entidade de cliente antes de
> Cliente existir de fato — e o Bloco 3 herdaria um modelo torto.
>
> ```
> Bloco 2:  Booking → no_show                    (operacional)
> Bloco 3:  Booking + Client → client_occurrences (relacional)
> ```
>
> Quem dispara o `no_show` é decisão de produto ainda em aberto: dono marca à
> mão, o sistema sugere após a tolerância, ou fecha automaticamente no fim do
> expediente. **Definir antes de implementar.**

### 4.6 🟡 Profissional ocioso

| | |
|---|---|
| **Condição** | barbeiro ativo sem reserva que ocupe slot por ≥ N minutos dentro do expediente |
| **Fonte** | `staff` + `bookings` + `tenant.schedule` |
| **Ação** | *Ver agenda do dia* |
| **Some quando** | recebe reserva, ou o expediente acaba |
| **Confiança** | 🟢 real |
| **Eventos** | nenhum novo |
| **Suporte hoje** | ⚠️ dados existem; a regra de janela contínua não |

> Só faz sentido com 2+ profissionais — é o ICP. Na operação solo, "ocioso" é
> informação que o dono já tem olhando em volta.

### 4.7 🟡 Ritmo abaixo do esperado

| | |
|---|---|
| **Condição** | realizado até agora < X% do esperado para esta hora, comparado com a média do mesmo dia da semana |
| **Fonte** | `bookings` históricos + `payments` |
| **Ação** | *Ver agenda* |
| **Some quando** | o realizado alcança a faixa, ou o dia acaba |
| **Confiança** | 🟡 estimado — **⬜ insuficiente com menos de 4 semanas de histórico** |
| **Eventos** | nenhum novo |
| **Suporte hoje** | ❌ regra nova; a base existe |

> **Trava obrigatória:** com histórico raso, este item **não aparece**. Não vira
> "estimativa fraca", não vira zero: fica fora. Barbearia nova receberia alarme
> falso todo dia da primeira semana, e é assim que se perde a confiança na
> seção inteira.

### 4.8 🔵 Horários livres em faixa de alta demanda

| | |
|---|---|
| **Condição** | slots livres hoje/amanhã dentro da faixa historicamente mais cheia |
| **Fonte** | `availableSlots` (servidor) + mapa de calor |
| **Ação** | *Ver agenda* · futuramente *Oferecer a clientes* |
| **Some quando** | preenchidos, ou a faixa passa |
| **Confiança** | 🟡 estimado — ⬜ insuficiente sem histórico para definir "alta demanda" |
| **Suporte hoje** | ⚠️ `availableSlots` existe; identificar a faixa é regra nova |

### 4.9 🔵 Cliente recorrente fora do intervalo

| | |
|---|---|
| **Condição** | `lastVisitDaysAgo > avgIntervalDays × 1,5` com ≥ 3 visitas |
| **Fonte** | `recorrenciaDeClientes` |
| **Ação** | *Ver cliente* · *Enviar lembrete* |
| **Some quando** | o cliente agenda, ou o dono descarta |
| **Confiança** | 🟡 estimado — ⬜ insuficiente com menos de 3 visitas |
| **Eventos** | entidade **Cliente** (Bloco 3) |
| **Suporte hoje** | ⚠️ o cálculo existe e não tem tela; a ação depende do Bloco 3 |

> Entra no Action Center **só no Bloco 3**. Sem entidade Cliente, a ação leva a
> lugar nenhum — e item sem ação executável é o que o princípio proíbe.

### 4.10 🟡 Taxas de maquininha não configuradas

| | |
|---|---|
| **Condição** | todas as `policies.paymentFees` iguais a zero **e** existe pagamento em débito ou crédito no mês |
| **Fonte** | `barbershops/{id}.policies` + `payments` |
| **Ação** | *Configurar taxas* |
| **Some quando** | ao menos uma taxa for informada |
| **Confiança** | 🟢 real |
| **Suporte hoje** | ✅ implementável — ambas as fontes existem |

> A condição exige pagamento em cartão de propósito: barbearia que só recebe
> Pix e dinheiro tem taxa zero de verdade, e não deve ser cobrada por isso.

---

## 5. Eventos de domínio que o bloco exige

| Evento | Materializa | Destrava |
|---|---|---|
| `cliente.nao_compareceu` | `client_occurrences` | 4.5, régua de antecipado, no-show em indicadores |
| `reserva.remarcada` | `rescheduleCount` na reserva | política de 2 remarcações, hoje burlável com F5 |
| `encaixe.expirado` | `status = expired` | 4.3 parar de acumular pendência eterna |
| `atendimento.iniciado` *(a decidir)* | `status` novo | ocupação real em vez de inferida do relógio |

Sobre o último: **não recomendo criar agora.** Exige um clique a mais no fluxo
mais repetido do dia, e o ganho é precisão de um alerta. A inferência pelo
relógio, com tolerância configurável, resolve 4.2 sem custo operacional. Revisar
se o dono reclamar de alarme falso.

---

## 6. O que já é sustentado hoje

| Situação | Estado | O que falta |
|---|---|---|
| 4.1 Fechamento pendente | ✅ pronta para implementar | nada |
| 4.3 Encaixe aguardando | ✅ já no ar | expiração |
| 4.4 Sem serviço | ✅ já no ar | nada |
| 4.10 Taxas não configuradas | ✅ pronta para implementar | nada |
| 4.2 Atendimento atrasado | ⚠️ detecção | tolerância em `policies`, ação "marcar falta" |
| 4.6 Profissional ocioso | ⚠️ dados existem | regra de janela |
| 4.5 Não compareceu | ❌ | caminho para `no_show` + `client_occurrences` |
| 4.7 Ritmo abaixo | ❌ | regra + trava de histórico mínimo |
| 4.8 Horário em alta demanda | ❌ | definição de faixa |
| 4.9 Cliente fora do intervalo | ❌ | entidade Cliente (Bloco 3) |

**Quatro situações são implementáveis sem nenhuma entidade nova.** Duas delas já
estão no ar. É por aí que o bloco começa.

---

## 7. Confiança do dado aplicada

O tipo `Indicador<T>` do Blueprint vale aqui com uma regra mais dura:

> **Item com confiança ⬜ insuficiente NÃO É EXIBIDO.**

Em indicador, "sem dados" é resposta honesta e útil. Em Action Center, um item
que não sabe se deve existir não pode pedir ação — e a seção inteira perde
autoridade no dia em que o dono descobre que um alerta era chute.

| Situação | Trava |
|---|---|
| 4.7 ritmo | ≥ 4 semanas de histórico do mesmo dia da semana |
| 4.8 alta demanda | ≥ 4 semanas para definir a faixa |
| 4.9 recorrência | ≥ 3 visitas do cliente |

---

## 8. O que NÃO entra no Action Center

- **Indicadores.** Faturamento, ticket, ocupação, atendimentos — topo da tela.
- **Histórico.** "Ontem faturou X" não é ação de hoje.
- **Item sem ação executável.** Se o botão leva a uma tela que não resolve, o
  item não existe ainda.
- **Alerta derivado de dado insuficiente.** Ver §7.
- **Parabéns.** "Ticket subiu 11%" é indicador. O Action Center é o lugar do que
  precisa de decisão, não do que precisa de aplauso — misturar os dois faz o
  dono parar de ler.

---

## 9. Ordem sugerida de implementação

1. **4.1 fechamento pendente** — crítica, fonte pronta, fecha o ciclo do Bloco 1
2. **4.10 taxas não configuradas** — barata, evita que o DRE minta em silêncio
3. **`no_show` + `client_occurrences`** — destrava 4.5 e o resto do ciclo
4. **4.2 atraso** com tolerância em `policies`
5. **`rescheduleCount`** e **expiração de encaixe** — fecham os desvios do ciclo
6. **4.6 ocioso** — primeiro item que exige 2+ profissionais
7. **4.7 e 4.8** — só depois de haver histórico que os sustente

As três primeiras não dependem de entidade nova nem de decisão de produto
pendente.
