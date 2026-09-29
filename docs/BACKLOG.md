# Backlog do Topete

Frentes combinadas com o dono e ainda não feitas. Atualizado em 28/09/2026.
O histórico da fase 3 está em `BACKLOG-FASE-3.md`.

---

## 1. WhatsApp automático — um número do Topete (prioridade: em breve)

**Decidido em 28/09/2026:** um número só, do Topete, na API oficial da Meta. É o
mesmo modelo de apps como o Pierre. O número fala com os donos (avisos da
plataforma e da barbearia) e com os clientes de cada barbearia, sempre com o
nome da barbearia no texto. Número próprio por barbearia (Embedded Signup) fica
como opção paga depois.

Isso revê a recomendação de agosto em `WHATSAPP-ARQUITETURA.md` (um número por
barbearia). O motivo da mudança é a velocidade de entrada das fundadoras: pedir
chip e conta Meta a cada dono trava o onboarding.

### Como a mensagem sabe de qual barbearia é
- **Envio:** a reserva pertence a uma barbearia. A mensagem sai com
  "Topete · Nome da barbearia" e botões.
- **Botões:** cada botão carrega, escondido, o id da barbearia e da reserva
  (`CONF:{shopId}:{bookingId}`). A resposta nunca confunde, mesmo que o cliente
  seja de duas barbearias.
- **Mensagem livre do cliente:** segue a última conversa daquele telefone
  (`whatsapp_conversations/{telefone}`, que já existe). A resposta automática
  avisa a barbearia ou manda o link do WhatsApp dela.
- **Consentimento por barbearia**, com "SAIR" para cada uma.

### Parte do dono (Meta)
1. Conta empresarial em business.facebook.com (JP Projects, CNPJ).
2. Verificação da empresa: Central de segurança → Iniciar verificação. É o
   gargalo (dias a semanas). Precisa de site ou e-mail no domínio
   (**topete.com.br no ar ajuda**). Sem verificação: 250 destinatários por dia.
3. App em developers.facebook.com (tipo Empresa, "Topete") + produto WhatsApp.
   Mandar para o time: ID do app, ID do número de teste e token temporário.
4. Chip novo pré-pago, **sem instalar o app do WhatsApp nele**. Adicionar na
   API, nome de exibição "Topete", cartão no WhatsApp Manager.
5. Usuário do sistema com token permanente, gravado no Secret Manager.

### Parte do sistema
- **Fase 1:** envio por número único; webhook ligado (`whatsappWebhook`); registro
  de cada envio. Hoje o código assume um número por barbearia
  (`barbershops/{id}/private/whatsapp`).
- **Fase 2 · cliente:** opt-in ao agendar + confirmação do telefone por código
  (P1-18: hoje mandaria para qualquer número digitado); confirmação;
  lembrete na véspera com [Confirmar] [Remarcar] [Falar com a barbearia];
  cancelamento e remarcação; "SAIR".
- **Fase 3 · dono:** nova reserva, cancelamento, pedido de encaixe com
  [Aprovar] [Recusar] e resposta automática ao cliente; mensagem livre
  encaminhada.
- **Fase 4:** adaptar os 34 templates de `whatsapp/templates.ts` para o formato
  "Topete · barbearia" e submeter por script.
- **Fase 5:** DEV com número de teste → Siqueira por uma semana → fundadoras.
  **Cota mensal de mensagens no plano**: cada envio tem custo na Meta (estimado
  em R$ 0,04–0,06 por mensagem utilitária; conferir na tabela da Meta).

### Estado atual (conferido em 28/09)
- O Siqueira tem `private/whatsapp` com `enabled: true` e `phoneNumberId` desde
  03/08, mas **nenhuma mensagem foi enviada** (`whatsapp_messages` vazio). O
  automático não funciona em produção.
- O que funciona e está divulgado: **mensagem pronta em 1 toque**.

---

## 2. Integração com o Hub (lado do Topete)

Contrato em `hub/docs/CONTRATO-PLATAFORMA-BARBER.md`. O Hub já publicou a parte
dele (validado em 28/09). Falta no Topete:
- mandar os eventos (`cadastrada`, `onboarding_concluido`, `plano_escolhido`,
  `pediu_cancelamento`), incluindo uma carga única do Siqueira;
- endpoints `/plataforma/provisionar` e `/plataforma/status`;
- `/api/health`;
- copiar os tokens `PLATAFORMA_TOKEN` e `CORTEHUB_TOKEN` para o axon-barber.

**Acertar antes, no contrato:**
- a URL de exemplo é `.jpproject.com.br`, tem que ser `topete.com.br`;
- o status `cancelado` do Hub vira `encerrada` no Topete (dispara LGPD em 90 dias);
- a cobrança fica no Hub (boleto Inter), o que aposenta a parte de Mercado Pago
  de `COBRANCA-E-ENTRADA.md`;
- o valor de exemplo `89.9` não bate com os planos.

## 3. Domínio topete.com.br

> **Decisão do dono (29/09): o O Siqueira NÃO migra.** Fica em
> `osiqueira.jpproject.com.br` definitivamente, porque o endereço já foi
> divulgado. `jpproject.com.br` continua como domínio legado
> (`NEXT_PUBLIC_DOMINIOS_LEGADOS`) e `barbershops/{id}.dominio` guarda o
> endereço dele. Só as barbearias novas nascem em `*.topete.com.br`
> (Worker da Cloudflare, a cargo da conversa do Hub).

- Comprado em 28/09, DNS a configurar.
- Página simples no ar (também ajuda a verificação da Meta).
- Apontar o link da apresentação e a bio do Instagram.
- Barbearias em `*.topete.com.br` pelo balanceador: certificado curinga, DNS, e o
  segredo `CORTEHUB_LB_SEGREDO` no SSR mais o cabeçalho no backend service.
- Tira as barbearias do `*.jpproject.com.br`, que é de outro projeto do dono.
- **Os materiais de venda já usam `suabarbearia.topete.com.br`** (manuais,
  apresentação, criativos). Não gerar QR code nem link real a partir deles antes
  de o domínio atender. O app ainda usa `NEXT_PUBLIC_ROOT_DOMAIN=jpproject.com.br`,
  e o Siqueira segue em `osiqueira.jpproject.com.br` até a migração.

**Urgente:** apagar no Cloudflare o `A *` → `136.81.166.97`. O curinga do
jpproject é do outro projeto e hoje responde com dois IPs.

## 4. Trocar "CorteHub" por "Topete" no código

- Textos da landing e das telas, mensagens das functions, `DEFAULT_TENANT`.
- Ícones e manifest da plataforma com o mascote (`docs/marca`).
- Endereço do DEV (`cortehub-dev.web.app`).
- O guia publicado em artifact (versão CorteHub).

## 5. Planos e cobrança

- Decidir a proposta: Agenda R$ 97 (até 3 barbeiros), Crescimento R$ 197 (até 6),
  Gestão R$ 247 (até 10), R$ 19 por barbeiro extra, anual "pague 10, use 12",
  fundadores 30% vitalício nas 20 primeiras.
- Refletir no código (`plans.ts`) e fazer o gating valer: hoje nenhuma tela
  obedece plano nem trial.
- O cadastro self-service ("Testar 7 dias") segue fechado por decisão do dono.

## 6. White-label (restante da auditoria de 28/09)

- Envio de logo pela barbearia (hoje exige commit).
- Tela de admin para ativar barbearia nova (hoje é script ou `provisionBarbershop`).
- Login Google/SMS em subdomínio novo: conferir os domínios autorizados no Firebase.
- Manual e guia do cliente com a marca de cada barbearia (modelo com variáveis).

## 7. Segurança (pendentes da auditoria de 28/09)

- Religar o App Check com tempo-limite, depois de dias com o #72 nos celulares.
- Papel mínimo para a conta de serviço das functions (hoje `roles/editor`).
- Fase 2 das regras (taxas fora da ficha pública).
- Expurgo LGPD em `DRY_RUN = true`.
- Telefones nos logs do webhook.

## 8. Acesso próprio para cada barbeiro

Hoje o painel é só do dono. O manual já diz "em breve".
