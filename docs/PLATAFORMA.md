# CorteHub — documentação técnica e funcional

Este é o documento de referência da plataforma: o que existe, como se conecta,
quem pode o quê, e o que acontece em cada fluxo. Onde uma decisão parece
estranha, o motivo está escrito junto — quase toda uma delas veio de um defeito
real, e apagar o motivo é convidar o defeito de volta.

Última revisão: 03/08/2026.

---

## 1. O que a plataforma é

Um SaaS multi-barbearia. Cada barbearia tem o **próprio endereço**
(`osiqueira.cortehub.com.br`), a própria marca, o próprio catálogo e o próprio
financeiro. O cliente final agenda num app que parece daquela barbearia, não da
plataforma.

Dois produtos no mesmo código:

| | Quem usa | O que faz |
|---|---|---|
| **App do cliente** | Quem corta o cabelo | Agenda, remarca, cancela, vê fidelidade e planos |
| **Painel do dono** | Quem é dono da barbearia | Agenda do dia, financeiro, DRE, projeção, equipe, loja |

---

## 2. Arquitetura

```
Navegador
   │
   ├── PWA (Next.js 16, App Router, Turbopack)
   │     └── Firebase Hosting → Cloud Run (SSR)
   │
   ├── Firestore ────── regras de segurança (isolamento por barbearia)
   ├── Firebase Auth ── custom claims: barbershops { id: papel }
   └── Cloud Functions (southamerica-east1)
         ├── createBooking / cancelBooking / rescheduleBooking
         ├── signUpBarbershop / completeOnboardingStep
         ├── changeInitialPassword
         ├── creditLoyaltyOnCompletion / redeemLoyaltyReward
         ├── notifyBookingCreated  → WhatsApp Cloud API
         └── whatsappWebhook       ← WhatsApp Cloud API
```

### 2.1 Como o subdomínio vira barbearia

`osiqueira.cortehub.com.br` → `slugFromHost` extrai `osiqueira` →
`/slugs/osiqueira` → `barbershopId` → `/barbershops/{id}`.

Três armadilhas que já custaram produção parada, todas documentadas em
`lib/tenant-server.ts`:

1. **`x-forwarded-host` antes de `host`.** O Firebase Hosting reescreve o `Host`
   para `*.run.app`. Lendo só `host`, o subdomínio some, tudo cai no tenant
   padrão e o dono é expulso do próprio painel — **sem erro em log nenhum**.
2. **Nem Admin SDK, nem SDK cliente.** O primeiro é externalizado pelo Turbopack
   com nome hasheado e derruba toda rota com 500. O segundo falha em silêncio no
   Node. A leitura é `fetch` na REST do Firestore, sem bundler no caminho.
3. **Com o emulador ligado, a REST tem que apontar para o emulador.** Senão o
   servidor lê produção enquanto o navegador lê local, e o dono local vira
   cliente porque o claim não bate com o id errado.

Consequência arquitetural: ler o host torna **toda rota dinâmica**. A mitigação
é cache de borda por host (`s-maxage=300`, `Vary: Host`) — que deixa de ser
seguro no dia em que dado de usuário for renderizado no servidor.

### 2.2 Isolamento entre barbearias

O isolamento é **estrutural**, não por filtro: tudo vive em subcoleções de
`/barbershops/{id}`, e a regra do pai protege o que está abaixo. É impossível
"esquecer o `where`" e vazar dado de outra barbearia — que é exatamente o risco
do modelo com coleções na raiz e campo `tenantId`.

O vínculo pessoa↔barbearia mora no **custom claim**
`barbershops: { "<id>": "owner" | "staff" }`. Ler claim é grátis; ler um
documento de vínculo dentro da regra custaria uma leitura por avaliação.

**52 testes de regras** rodam contra o emulador (Firestore e Storage) provando
esse isolamento. É a suíte mais importante da plataforma: um furo aqui vaza o
financeiro de um cliente pagante para outro.

---

## 3. Modelo de dados

```
/slugs/{slug}                        → { barbershopId }        público
/users/{uid}                         → conta do cliente final
/platform_users/{uid}                → hash da senha provisória   negado a todos
/whatsapp_numbers/{phoneNumberId}    → número → barbearia         negado a todos
/whatsapp_sent/{messageId}           → mensagem → barbearia       negado a todos
/whatsapp_conversations/{telefone}   → telefone → última barbearia negado a todos

/barbershops/{id}                    ficha PÚBLICA (vitrine)
   ├── private/{doc}                 contrato, cobrança, config do WhatsApp
   ├── members/{uid}                 quem tem LOGIN e com que papel
   ├── staff/{staffId}               os BARBEIROS (login opcional)
   ├── services/{id}                 catálogo
   ├── plans/{id}                    mensalidades
   ├── products/{id}                 loja
   ├── bookings/{id}                 agenda
   ├── expenses/{id}                 despesas
   ├── cash_entries/{id}             caixa
   ├── commissions/{id}              comissão por barbeiro
   ├── subscriptions/{id}            mensalistas
   ├── loyalty_transactions/{id}     fidelidade por transação
   ├── whatsapp_messages/{id}        registro de envio e recebimento
   └── audit_log/{id}                imutável, inclusive para o dono
```

### 3.1 Decisões de modelagem que valem explicar

**Barbeiro é recurso, não usuário.** `members` é quem tem login; `staff` é quem
ocupa uma cadeira. Existe barbeiro sem e-mail e sem vontade de aplicativo. Se o
barbeiro só existisse com conta, o dono não conseguiria cadastrar metade da
equipe. `staff.uid` é opcional.

**A barbearia nunca tem zero barbeiros.** Um é criado no cadastro, a partir do
dono. Assim nenhum caminho do código precisa tratar "e se não houver barbeiro?"
— o estado não existe. E o dono de uma barbearia solo nunca vê a palavra
"barbeiro" na tela, porque a escolha só aparece a partir do segundo.

**Fidelidade é transação, não contagem.** Era `atendimentos % 10`, que funciona
até o primeiro resgate — depois a conta continua subindo com o histórico e o
cliente "reganha" o prêmio sozinho. Cada crédito e resgate é um documento; o
saldo é a soma, e o extrato existe de graça.

**A ficha da barbearia é pública.** Nome, endereço, horário e marca são
legíveis sem login: é o que o servidor lê para pintar a página antes de existir
usuário, e é informação de vitrine — a mesma que está na fachada. Contrato e
cobrança ficam em `private`.

---

## 4. Fluxos

### 4.1 Nasce uma barbearia (self-service)

```
landing → cria conta → escolhe endereço (slug) → signUpBarbershop
   ├── grava barbearia + slug + membro dono
   ├── cria o PRIMEIRO BARBEIRO a partir do dono
   ├── semeia 4 serviços com preço zero
   ├── abre trial de 7 dias
   └── concede o claim owner
         ↓
   onboarding guiado (4 passos)
     1. Sua barbearia   nome, endereço, WhatsApp, cor
     2. Seus serviços   preço e duração — sem isso não há o que agendar
     3. Seus horários   é daqui que saem os slots
     4. Compartilhe     o link para os clientes
```

O slug é registrado **dentro de uma transação** que lê o documento antes de
gravar: dois cadastros simultâneos no mesmo endereço, um ganha e o outro recebe
erro — em vez de os dois "conseguirem".

Só quatro passos, de propósito: são os que impedem a primeira reserva. Despesas,
planos e produtos são pedidos dentro da própria tela, quando o dono chegar lá —
quem precisa lançar o aluguel antes de conseguir receber um agendamento fecha a
aba.

### 4.2 Uma reserva acontece

```
cliente escolhe serviço → dia → (barbeiro, se houver mais de um) → horário
                                        ↓
                              createBooking (Cloud Function)
   valida: dia aberto · antecedência mínima · barbeiro existe e faz o serviço
   soma preço e duração DO CATÁLOGO
   ┌─ transação ────────────────────────────────────┐
   │ teto de reservas ativas por cliente (3)        │
   │ conflito por (data, hora, BARBEIRO)            │
   │ grava com status decidido pelo servidor        │
   └────────────────────────────────────────────────┘
                                        ↓
                        notifyBookingCreated (gatilho)
                    ├── nova_reserva → dono
                    └── confirmacao_reserva → cliente
```

**Por que no servidor, e não no cliente** — três motivos, nenhum de conveniência:

1. **Preço.** Se o cliente mandasse o valor, mandaria zero.
2. **Conflito.** Dois clientes tocando "confirmar" no mesmo segundo precisam de
   uma transação para que só um ganhe o horário.
3. **Status.** As regras proíbem o cliente de gravar `status` — senão dá para
   marcar "confirmado" sem pagar.

Verificado em produção enviando `value: 0` e `status: "completed"`: o servidor
devolveu R$ 90 e `confirmed`.

**Criar reserva direto no Firestore é negado** (`allow create: if false`). A
regra antiga permitia, desde que o cliente não mexesse em status e valor — e por
ali passava reserva sem `status`, que não bloqueia horário na checagem de
conflito e mesmo assim aparece na agenda do dono.

### 4.3 Cancelamento e remarcação

Ambos passam por Cloud Function. A tela escrevia direto no Firestore, as regras
negavam, e o `catch` só fazia `console.error`: o modal fechava, o cliente achava
que tinha cancelado, **e a agenda do barbeiro continuava com ele**.

O reembolso é calculado com a política da própria barbearia — o cliente não
escolhe nem a faixa nem o status. A remarcação disputa o horário novo na mesma
transação, senão remarcar seria a porta dos fundos para furar a fila.

### 4.4 WhatsApp

**34 templates** em `functions/src/whatsapp/templates.ts`, que é a fonte da
verdade do texto. 26 para o cliente, 5 para o barbeiro, 3 da plataforma para o
dono. Detalhados em `MENSAGENS-WHATSAPP.md`.

**Um número para toda a plataforma.** Um número por barbearia significaria uma
verificação na Meta por cliente — semanas cada. O custo é que o remetente é o
CorteHub e a nota de qualidade é compartilhada.

Isso quebrava o webhook, que descobria a barbearia pelo `phone_number_id`. Cada
evento passou a ter a própria origem de verdade:

| Evento | Como o sistema sabe de quem é |
|---|---|
| Botão tocado | A barbearia vai no payload, dentro da requisição assinada |
| Entrega / leitura | `whatsapp_sent/{messageId}` |
| Texto livre | `whatsapp_conversations/{telefone}` — a última conversa |

O webhook confere a assinatura `X-Hub-Signature-256` contra o corpo **cru** —
reserializar o JSON muda espaços e o hash deixa de bater. E confere **quem
tocou**: confirmar e cancelar são do cliente da reserva; aprovar encaixe é de
quem toca a barbearia.

Responde 200 **antes** de processar, porque a Meta reenvia o evento se demorar —
e cada reenvio reprocessaria o mesmo toque.

---

## 5. Permissões

| | Cliente | Barbeiro (`staff`) | Dono (`owner`) | Plataforma |
|---|---|---|---|---|
| Ficha da barbearia | lê | lê | edita | tudo |
| Catálogo e equipe | lê | lê | edita | — |
| Agenda | só a dele | toda | toda | — |
| Comissão | — | **só a dele** | toda | — |
| Despesas, DRE, caixa | — | — | tudo | — |
| Contrato e cobrança | — | — | lê | edita |
| Log de auditoria | — | — | lê | lê |

A comissão ser "só a dele" é regra nova: antes era `isStaffOf`, ou seja qualquer
barbeiro lia o salário dos colegas. Com uma cadeira só isso nunca apareceu — o
único `staff` era o dono.

---

## 6. Financeiro

| Tela | Responde |
|---|---|
| Hoje | Quem vem hoje, quanto entra, quem não confirmou |
| Fluxo de Caixa | Quanto entrou por dia, por meio de pagamento |
| DRE Gerencial | Sobrou quanto, depois de tudo |
| Despesas | Onde o dinheiro sai |
| Projeção | O caixa fecha no azul? Em que dia vira |
| Números | Ocupação, recorrência, top serviços |
| Mensal | Fechamento do mês |

**Projeção tem horizonte** — mensal, trimestral, semestral e anual. Acima de um
mês, tabela e gráfico passam a ser por mês.

E ela **diz quanto é estimativa**. Ninguém marca corte para daqui a seis meses,
então além de ~60 dias quase toda receita vem da média histórica por dia da
semana. Projeção anual apresentada com a mesma confiança da mensal é número
bonito que induz decisão errada.

**Gráficos em SVG puro, sem biblioteca.** O app carrega o Firebase sob demanda
justamente para não cobrar 400 KB de quem só quer agendar; puxar 100 KB para
desenhar barra e linha andaria contra isso.

---

## 7. Qualidade

| Suíte | Testes | O que prova |
|---|---|---|
| `functions` | 90 | Templates, senha, fuso, formatação, payload de botão |
| `web` | 69 | Regras de negócio, slots, formatação, tenant |
| Regras (emulador) | 52 | **Isolamento entre barbearias**, Firestore e Storage |

O princípio que orienta a verificação: **rodar, não ler.** Cinco defeitos só
apareceram executando — `Timestamp` derrubando rota com 500,
`upgrade-insecure-requests` quebrando assets em subdomínio, `allowedDevOrigins`
faltando (a página carregava e nenhum botão respondia, **sem erro no console**),
`RecaptchaVerifier` matando o login em silêncio, e a resolução de tenant lendo o
header errado.

---

## 8. O que existe e o que não existe

### Funciona, verificado em produção

Cadastro self-service · onboarding guiado · reserva com preço e status no
servidor · conflito por barbeiro · limite por cliente · cancelamento e
remarcação · fidelidade transacional · isolamento entre barbearias · webhook
assinado · troca obrigatória da senha provisória · backup diário

### Não existe ainda

| O quê | Consequência |
|---|---|
| **Envio de WhatsApp em produção** | Falta o número. O código está pronto e testado |
| **Pagamento do cliente** (Pix/cartão) | Só "pagar no salão". Sem proteção contra falta |
| **Cobrança da plataforma** | Não há como receber de uma barbearia |
| **Ficha de cliente** | Sem histórico por pessoa, reativação e aniversário não funcionam |
| **Multi-barbeiro nas telas** | O modelo e o servidor já suportam; falta a interface |
| **LGPD** | Sem política, termos, consentimento nem exclusão de dados |
| **App Check** | Qualquer um chama as funções de fora do app |
| **Tradução** | 18 telas em português, cravado |
| **Nota fiscal** | Não emite |

---

## 9. Onde ler mais

| Documento | Assunto |
|---|---|
| `ARQUITETURA.md` | Detalhe técnico das camadas |
| `PLANO-MULTI-BARBEIRO.md` | Construção da equipe, fase a fase |
| `MENSAGENS-WHATSAPP.md` | As 34 mensagens, por público |
| `WHATSAPP-ARQUITETURA.md` | Cloud API, WABA, limites e verificação |
| `PLANOS-E-FUNCIONALIDADES.md` | O que entra em cada plano e por quanto |
| `ESTRATEGIA-SAAS.md` | Posicionamento e mercado |
| `COMPARATIVO-MERCADO-2026-08.md` | Concorrentes |
| `CHECKLIST-O-SIQUEIRA.md` | O que falta para a piloto entrar em uso |
| `AUDITORIA-2026-08-02.md` | Os 47 achados e o que virou correção |
| `REVISAO-UIUX-2026-08-02.md` | Contraste, hierarquia e o que ainda melhora |
