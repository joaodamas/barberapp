# Avisos no Telegram (01/10/2026)

Bot único do Topete que avisa a **equipe** da barbearia (dono e barbeiros). O
cliente continua no WhatsApp. Grátis: a API de bots do Telegram não cobra.

## O que chega

| Aviso | Quem recebe | Quando |
|---|---|---|
| Pedido de encaixe, com **Aprovar / Recusar** | dono; barbeiro da cadeira | na hora |
| Cliente cancelou | dono; barbeiro da cadeira | na hora (só `cancelled_by_client`) |
| Novo agendamento | dono; barbeiro da cadeira | na hora (só `origin: "app"`, fora do fixo) |
| Agenda do dia | dono (tudo); barbeiro (a dele) | 7h |
| Fechamento do dia | só dono | 21h |

Cada aviso liga e desliga por pessoa em **Ajustes → Avisos**.

## Como liga

1. O dono toca em "Conectar meu Telegram" (ou "Convite para {barbeiro}").
   `criarConviteTelegram` grava `telegram_convites/{codigo}` (15 min, uso
   único) e devolve `t.me/{bot}?start={codigo}`.
2. A pessoa toca em **Iniciar**. `telegramWebhook` consome o convite e grava
   `barbershops/{id}/telegram_contatos/{chatId}` + `telegram_chats/{chatId}`.
3. Toque em Aprovar/Recusar: o webhook acha a barbearia pelo chat (nunca pelo
   botão), confere o contato (barbeiro só a própria cadeira) e chama
   `aplicarRespostaDoEncaixe` — a mesma transação do painel.

## Configurar o bot (uma vez)

1. No Telegram, falar com **@BotFather** → `/newbot` → nome "Topete Avisos",
   usuário terminando em `bot` (ex.: `TopeteAvisosBot`). Ele devolve o token.
2. Gravar o token **sem colar no chat**:
   `printf '%s' 'TOKEN' | gcloud secrets versions add TELEGRAM_BOT_TOKEN --project axon-barber --data-file=-`
3. Publicar as functions (o segredo é lido no deploy).
4. `cd functions && node scripts/telegram-configurar.mjs` — registra webhook,
   comando /parar e descrição.

Enquanto o token for `pendente`, tudo fica desligado sem erro, e a tela diz que
o bot está sendo configurado. Um bot tem um webhook só: o de produção aponta
para o `axon-barber`; para testar no DEV, crie um segundo bot.

## Notificação do app (PWA) — mesmos avisos, sem Telegram

Em **Ajustes → Avisos → Neste celular**, cada aparelho liga a sua notificação
(`registrarPush` grava `barbershops/{id}/push_tokens/{sha1(token)}`). Os
gatilhos `pushAoCriarReserva` / `pushAoMudarReserva` usam a mesma régua do
Telegram (`avisoDaCriacao`) e mandam só `data` pelo FCM; quem desenha a
notificação é `web/public/sw.js` (handlers `push` e `notificationclick`, sem
tocar no cache). Tocar abre `/painel/agenda`. iPhone: só com o app na tela de
início (iOS 16.4+) — a tela explica. Aparelho que sumiu é apagado no envio.
