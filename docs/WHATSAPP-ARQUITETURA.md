# WhatsApp — como a amarração funciona

**Data:** 2026-08-02 · **Estado:** catálogo de **34 templates** pronto e validado; envio, webhook e gatilhos não existem.

---

## 1. A pergunta que decide tudo: de qual número sai a mensagem?

Essa é a primeira decisão, e ela determina o resto da arquitetura, o custo e a fricção do onboarding.

### O problema que quase todo mundo descobre tarde

**Um número não pode estar no app WhatsApp Business e na Cloud API ao mesmo tempo.**

O barbeiro usa o número dele no celular, conversando com cliente o dia todo. Se esse número for migrado para a API, **ele perde o aplicativo no telefone**. As conversas só existem via API — ou seja, dentro do seu produto, e você teria que construir uma caixa de entrada.

Isso não é detalhe: é o principal motivo de barbearia abandonar automação de WhatsApp.

### As três saídas

| | **A. Número da plataforma** | **B. Número novo da barbearia** | **C. Número atual migrado** |
|---|---|---|---|
| Quem aparece para o cliente | sua marca | a barbearia (número novo) | a barbearia (número de sempre) |
| Barbeiro mantém o app no celular | ✅ | ✅ (no número antigo) | ❌ **perde** |
| Cliente reconhece o remetente | ❌ | ⚠️ nome verificado ajuda | ✅ |
| Onboarding | instantâneo | ~10 min | ~10 min + trauma |
| Precisa de caixa de entrada no produto | não | não | **sim** |
| Custo de número | 1 para todos | 1 por barbearia | 1 por barbearia |

**Recomendação: B, com C como opção depois.**

A barbearia usa um número novo, dedicado ao automático (um chip pré-pago resolve). O cliente vê o **nome verificado da barbearia** no topo da conversa, não um número anônimo — a Meta exibe o nome do perfil comercial. O barbeiro continua com o WhatsApp dele no celular para conversa humana.

Quando o produto tiver caixa de entrada, quem quiser unifica no número principal. Aí a opção C vira upgrade, não requisito.

> A opção A é tentadora pela simplicidade e é **errada para este produto**. O cliente recebendo "Sua reserva na Barbearia do Zé foi confirmada" de um número que não é do Zé quebra exatamente a confiança que o produto promete. E a resposta do cliente cairia em você, não nele.

---

## 2. Como a barbearia conecta o número

### Embedded Signup

Você se registra como **Tech Provider** na Meta uma vez. Depois disso, cada barbearia conecta o próprio número por um popup dentro do seu app — sem você tocar em nada.

```
Onboarding, passo extra:  [ Conectar WhatsApp ]
        │
        ▼
  popup da Meta (Embedded Signup)
   1. entra com a conta Facebook/Meta dela
   2. cria ou escolhe a conta comercial (WABA)
   3. informa o número e confirma por SMS
   4. autoriza seu app
        │
        ▼
  você recebe: wabaId, phoneNumberId, token
  grava em /barbershops/{id}/integrations/whatsapp
        │
        ▼
  push automático dos 16 templates para a WABA dela
```

O que você guarda por barbearia:

```
/barbershops/{id}/integrations/whatsapp
  wabaId, phoneNumberId, displayPhone,
  status: "conectado" | "pendente" | "erro",
  templatesStatus: { confirmacao_reserva: "APPROVED", ... },
  connectedAt
```

### Os templates

Templates vivem **por WABA** — cada barbearia tem os dela. Mas você não pede para o dono escrever nada: assim que ele conecta, sua função empurra os 16 templates do catálogo (`functions/src/whatsapp/templates.ts`) para a WABA dele via API, e acompanha a aprovação pelo webhook.

Como os textos já são padronizados e passam na validação de regras da Meta, a aprovação de UTILITY costuma sair em minutos a horas. **MARKETING** (reativação, aniversário, comunicado) demora mais e exige opt-in registrado.

> É por isso que o teste de regras dos templates existe: um template reprovado numa WABA é reprovado em todas, e você descobre com o cliente esperando.

---

## 3. A amarração: como uma mensagem sabe de quem é

Toda mensagem carrega o vínculo em três lugares, e o webhook usa isso para fechar o ciclo.

```
        RESERVA                          MENSAGEM                        RESPOSTA
  /barbershops/{bid}/           /barbershops/{bid}/               webhook recebe
     bookings/{bookingId}          whatsapp_messages/{msgId}        button payload
  ┌────────────────────┐        ┌──────────────────────┐         ┌──────────────┐
  │ clientId           │───────▶│ bookingId  ◀─────────┼─────────│ APPROVE_FITIN│
  │ clientWhatsapp     │        │ clientId             │         │ :{bookingId} │
  │ date, time, value  │        │ template, params[]   │         └──────────────┘
  │ status             │        │ wamid (id da Meta)   │                 │
  └────────────────────┘        │ status: enviada →    │                 ▼
            ▲                   │   entregue → lida    │         atualiza a reserva
            └───────────────────┤ direction: out|in    │         e responde o cliente
                                └──────────────────────┘
```

**Três chaves:**

1. **`bookingId` no payload do botão.** Quando o barbeiro toca em "Aprovar ✅", a Meta devolve o payload que você definiu — `APPROVE_FITIN:{bookingId}`. É isso que amarra o toque à reserva certa, sem ambiguidade, mesmo com três encaixes pendentes.
2. **`wamid`** — o id que a Meta devolve no envio. É por ele que os status de entrega e leitura, que chegam depois pelo webhook, encontram a mensagem.
3. **`clientWhatsapp` normalizado** (`55DDNNNNNNNNN`). Se o cliente responder texto livre, é o número que identifica quem é.

E o log em `whatsapp_messages` não é só auditoria: é o que impede mandar o mesmo lembrete duas vezes quando um gatilho reprocessa. Mesma ideia da fidelidade — **id determinístico**: `lembrete_{bookingId}` só existe uma vez.

---

## 4. O que dispara cada mensagem

| Régua | Gatilho | Tipo |
|---|---|---|
| Confirmação de reserva | reserva criada / pagamento aprovado | trigger do Firestore |
| Lembrete com botões | 3h antes do horário | agendada, varre a janela |
| Cancelamento | status vira cancelado | trigger do Firestore |
| Encaixe → barbeiro | reserva criada como `fit_in_requested` | trigger do Firestore |
| Encaixe expira em 45 min | agendada, a cada 5 min | agendada |
| Alternativas ao cliente | recusa ou expiração | consequência do webhook |
| Pós-atendimento | status vira `completed` | trigger do Firestore |
| Resumo do dia | 7h da manhã | agendada |
| Régua de mensalista D-5→D+5 | vencimento da assinatura | agendada, diária |
| Aviso de agenda alterada | dono bloqueia agenda | ação do painel |
| Reativação / aniversário | cliente sem vir há 45 dias / data | agendada, semanal |

**Dois tipos de gatilho, e a diferença importa:**

- **Trigger do Firestore** (`onDocumentWritten`) — reage a um fato que acabou de acontecer. Imediato, barato, e já é o padrão que a fidelidade usa.
- **Função agendada** (Cloud Scheduler) — varre quem "está na hora". O lembrete de 3h antes não é um evento; é uma varredura. Roda a cada 15 min buscando reservas na janela e marcando as que já foram avisadas.

A varredura **precisa** do índice `bookings(status, date)` — que já está aplicado em produção.

---

## 5. Limites da Meta que moldam o produto

**Janela de 24 horas.** Fora dela, só template aprovado. Dentro dela (cliente escreveu primeiro), texto livre. Isso é o que torna o botão do lembrete valioso: o toque abre a janela e permite conversar sem template por 24h.

> ⚠️ A partir de **1º de outubro de 2026** a Meta passa a cobrar também as mensagens de serviço dentro da janela de 24h. Isso muda a conta de quem planeja conversar muito — vale confirmar as tarifas antes de fechar o preço do plano.

**Opt-in.** UTILITY (transacional) é permitido para quem já é cliente. MARKETING exige consentimento registrado — e o registro precisa existir no seu banco, com data e origem, porque a Meta pode pedir.

**Qualidade do número.** Bloqueio e "parar de receber" derrubam a nota. Nota baixa reduz o limite diário de envio. Na prática: reativação e aniversário são as mensagens que queimam a nota, e são justamente as de MARKETING. Elas precisam de limite por cliente e botão de descadastro.

**Preço por mensagem, pelo país de quem recebe.** Desde julho de 2025 a Meta cobra por mensagem, não por conversa. UTILITY custa uma fração de MARKETING.

---

## 6. Quem paga a Meta

| Modelo | Como é | Quando usar |
|---|---|---|
| **Barbearia paga direto** | ela cadastra o cartão na Meta; você não vê a conta | mais simples, zero risco de caixa |
| **Você paga e embute** | sua conta é debitada; o custo entra na mensalidade | melhor experiência, exige margem e monitoramento |

**Recomendação: barbearia paga direto no começo.** Você não conhece o volume real ainda, e absorver custo variável desconhecido num plano de preço fixo é a forma mais rápida de descobrir que a margem sumiu. Quando houver histórico de consumo por barbearia, embutir vira diferencial de venda ("WhatsApp incluso, sem cartão na Meta").

Independente do modelo, **medir o consumo por barbearia desde o primeiro dia** — é isso que informa a decisão depois.

---

## 6.5. Dois números, não um

O catálogo tem `sender`, e ele separa duas conversas que não podem sair do mesmo lugar:

| Sai da **WABA da barbearia** | Sai da **sua WABA** |
|---|---|
| 26 templates para o cliente final | `trial_terminando` |
| 5 templates operacionais para o barbeiro | `trial_encerrado` |
| | `cobranca_falhou` |

Cobrança do SaaS e aviso de trial são **você falando com a barbearia**. Sair do WhatsApp dela apareceria para o cliente final dela como se a barbearia estivesse cobrando a si mesma — e, pior, a resposta do dono cairia na caixa que atende os clientes.

Um teste trava isso: toda mensagem com `audience: "cliente"` precisa ter `sender: "barbearia"`.

---

## 7. O que precisa ser construído

| # | Item | Depende de |
|---|---|---|
| 1 | Cadastro como Tech Provider na Meta | conta comercial verificada |
| 2 | **Submeter os 16 templates** | nada — pode ser feito hoje |
| 3 | Client da Cloud API (envio + status) | credenciais |
| 4 | Embedded Signup no onboarding | 1 |
| 5 | Push automático dos templates por WABA | 1, 3 |
| 6 | Webhook (status, botões, texto livre) | 3 |
| 7 | Log `whatsapp_messages` com id determinístico | 3 |
| 8 | Triggers do Firestore (confirmação, cancelamento, pós-atendimento, encaixe) | 3, 7 |
| 9 | Funções agendadas (lembrete, expiração, régua, resumo) | 3, 7 |
| 10 | Registro de opt-in com data e origem | — |
| 11 | Painel de mensagens no produto (log e falhas) | 7 |
| 12 | Caixa de entrada — só se for adotar o modelo C | 3, 6 |

**O item 2 não depende de nada e é caminho crítico.** A aprovação leva dias e os textos já passam na validação automatizada. Submeter agora, em paralelo com o resto, é a única decisão desta lista que custa zero e economiza uma semana.

---

## 8. Referências

- [Preços da API do WhatsApp Business em 2026](https://www.uptail.ai/blog/whatsapp-business-api-pricing-2026-what-it-costs-and-how-billing-works) — modelo por mensagem
- [Categorias e o que mudou](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- [`../functions/src/whatsapp/templates.ts`](../functions/src/whatsapp/templates.ts) — os 16 templates
- [`../functions/src/whatsapp/validate.ts`](../functions/src/whatsapp/validate.ts) — validação das regras da Meta
- [`PLANOS-E-FUNCIONALIDADES.md`](./PLANOS-E-FUNCIONALIDADES.md) — WhatsApp está no plano de entrada
