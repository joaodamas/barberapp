/**
 * Catálogo de templates do WhatsApp Business Cloud API.
 *
 * Este arquivo é a FONTE DA VERDADE dos textos: o que estiver aqui é o que deve
 * ser submetido à Meta para aprovação (Business Manager > WhatsApp Manager >
 * Modelos de mensagem). Depois de aprovado, o envio usa apenas `name` +
 * `language` + os parâmetros na ordem declarada em `params`.
 *
 * Regras da Meta que este catálogo respeita:
 * - Mensagens iniciadas pela empresa exigem template aprovado.
 * - Categoria UTILITY para transacional (reserva, cobrança, aviso de agenda);
 *   MARKETING para reengajamento/promoção (exige opt-in e tem custo maior).
 * - Placeholders são posicionais ({{1}}, {{2}}, ...) e não podem começar nem
 *   terminar o corpo da mensagem, nem ficar adjacentes.
 */

export type TemplateCategory = "UTILITY" | "MARKETING";

export type QuickReply = {
  /**
   * Texto do botão exibido no WhatsApp.
   *
   * Máx. 25 caracteres e **sem emoji, quebra de linha, variável ou
   * formatação** — a Meta recusa na submissão. Descoberto na prática: o
   * `lembrete_confirmacao` foi rejeitado por causa de um ✅ no botão, enquanto
   * o mesmo emoji no corpo passa sem problema. A regra vale só para botão.
   */
  label: string;
  /** Prefixo do payload devolvido no webhook quando o botão é tocado. */
  action: ButtonAction;
};

export type ButtonAction =
  | "CONFIRM_BOOKING"
  | "CANCEL_BOOKING"
  | "APPROVE_FITIN"
  | "DECLINE_FITIN"
  | "RESCHEDULE";

export type TemplateDef = {
  name: string;
  category: TemplateCategory;
  language: string;
  /** Corpo com placeholders posicionais. */
  body: string;
  /** Nome de cada parâmetro, na ordem em que aparece no corpo. */
  params: string[];
  /** Exemplo para submissão na Meta (obrigatório na aprovação). */
  example: string[];
  buttons?: QuickReply[];
  /** Para quem essa mensagem vai. */
  audience: "cliente" | "barbeiro";
  /**
   * De qual WhatsApp sai.
   *
   * `barbearia` — a WABA do cliente, conectada por Embedded Signup.
   * `plataforma` — a SUA WABA. Cobrança do SaaS e avisos de trial não podem
   *   sair do número da barbearia: é você falando com ela, não ela com o
   *   cliente dela.
   */
  sender?: "barbearia" | "plataforma";
  /** O que dispara o envio — documentação operacional. */
  trigger: string;
};

export const TEMPLATES = {
  /* ---------------------------------------------------------------------- */
  /* Régua de agendamento (cliente)                                          */
  /* ---------------------------------------------------------------------- */

  confirmacao_reserva: {
    name: "confirmacao_reserva",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Reserva criada. O acerto é no salão — não há pagamento online.",
    /* A régua de cancelamento saiu do corpo em 17/08 (D14).
     *
     * Ela prometia "100% de devolução" e "taxa de cancelamento" a quem nunca
     * pagou nada: `paymentMethod` nasce nulo (booking.ts:237) e só é conhecido
     * no fechamento, e `refundAmountFor` devolve `sem_pagamento` justamente
     * nesse caso. Prometer devolução de dinheiro não recebido é a promessa mais
     * cara do catálogo — e esta é a única mensagem que o produto JÁ envia.
     *
     * Os números 24h/6h eram um segundo problema em cima do primeiro: estavam
     * cravados no texto enquanto `policies.cancellation` é configurável por
     * barbearia. Quem mudasse a política teria a antiga saindo por WhatsApp. */
    body:
      "Olá {{1}}! Sua reserva na {{2}} está confirmada.\n\n" +
      "Serviço: {{3}}\n" +
      "Quando: {{4}} às {{5}}\n" +
      "Valor: {{6}} ({{7}})\n" +
      "Endereço: {{8}}\n\n" +
      "O acerto é feito na barbearia, no dia do atendimento. Se não puder vir, " +
      "avise por aqui com antecedência para liberarmos o horário. Te esperamos!",
    params: [
      "primeiroNome",
      "nomeBarbearia",
      "servicos",
      "data",
      "hora",
      "valor",
      "formaPagamento",
      "endereco",
    ],
    example: [
      "João",
      "O Siqueira Barbearia",
      "Corte + barba",
      "domingo, 02 de agosto",
      "16:30",
      "R$ 90,00",
      /* `formaPagamento(null)` — é o que sai de verdade. A reserva nasce com
       * `paymentMethod: null` e o gatilho dispara na criação, então nenhuma
       * confirmação pode dizer "pago". O exemplo é o que a Meta aprova como
       * amostra canônica: ele precisa mostrar o texto real. */
      "pagar no salão",
      "Rua das Tesouras, 120 — Centro",
    ],
  },

  lembrete_confirmacao: {
    name: "lembrete_confirmacao",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger:
      "No dia do atendimento (ex.: 3h antes). Principal proteção contra no-show — nunca é pulado.",
    body:
      "Oi {{1}}, tudo certo para hoje?\n\n" +
      "Seu horário na {{2}} é às {{3}} ({{4}}).\n\n" +
      "Confirma que você vem? É só tocar em um dos botões abaixo.",
    params: ["primeiroNome", "nomeBarbearia", "hora", "servicos"],
    example: ["João", "O Siqueira Barbearia", "16:30", "Corte + barba"],
    buttons: [
      { label: "Confirmo que vou", action: "CONFIRM_BOOKING" },
      { label: "Preciso cancelar", action: "CANCEL_BOOKING" },
    ],
  },

  cancelamento_reserva: {
    name: "cancelamento_reserva",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Cancelamento confirmado (pelo cliente ou pela loja).",
    /* O parâmetro `detalheReembolso` saiu em 17/08 (D14).
     *
     * Ele era texto livre num campo chamado "reembolso", com o exemplo
     * aprovado na Meta dizendo "em até 5 dias úteis na mesma forma de
     * pagamento" — prazo de bandeira de cartão, num produto sem captura de
     * cartão. Quem fosse preencher copiaria o exemplo, porque é para isso que
     * o exemplo existe.
     *
     * Não há reembolso porque não houve cobrança: o acerto acontece no
     * atendimento, e uma reserva cancelada não chegou lá. A frase que entrou no
     * lugar afirma exatamente isso — e é a informação que o cliente precisa. */
    body:
      "Olá {{1}}, sua reserva de {{2}} às {{3}} foi cancelada.\n\n" +
      "Nada foi cobrado: o acerto acontece no atendimento, na barbearia.\n\n" +
      "Quando quiser remarcar, é só abrir o app em {{4}} — te esperamos!",
    params: ["primeiroNome", "data", "hora", "linkApp"],
    example: [
      "João",
      "domingo, 02 de agosto",
      "16:30",
      "https://osiqueira.jpproject.com.br",
    ],
  },

  encaixe_alternativas: {
    name: "encaixe_alternativas",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger:
      "Encaixe recusado pelo barbeiro OU expirado sem resposta (45 min).",
    body:
      "Oi {{1}}, não consegui encaixar o horário das {{2}}. 😕\n\n" +
      "Mas tenho estes horários livres para {{3}}:\n{{4}}\n\n" +
      "Garanta o seu em um toque no link {{5}} — leva menos de um minuto.",
    params: ["primeiroNome", "horaSolicitada", "servicos", "horariosLivres", "linkApp"],
    example: [
      "João",
      "16:30",
      "Corte + barba",
      "14:00, 15:00 e 18:30",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  pos_atendimento: {
    name: "pos_atendimento",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Atendimento marcado como concluído no painel.",
    /* Achado durante a correção de D14: o convite para avaliar apontava para um
     * recurso que não existe em lugar nenhum do produto — não há nota, estrela
     * nem review no web, nas functions ou no domínio. O link ia para `/perfil`,
     * que mostra carimbos de fidelidade e nada mais.
     *
     * O cliente clicava e não achava o que fazer. É a mesma classe de D14, com
     * uma diferença: aqui a promessa não era de dinheiro, era de voz — e quem
     * pede opinião e não tem onde recebê-la perde mais que uma resposta. */
    body:
      "Valeu pela visita, {{1}}! 💈\n\n" +
      "Você agora tem {{2}} de {{3}} carimbos — faltam {{4}} para {{5}}.\n\n" +
      "Acompanhe seus carimbos em {{6}} — até a próxima!",
    params: [
      "primeiroNome",
      "carimbos",
      "meta",
      "faltam",
      "recompensa",
      "linkPerfil",
    ],
    example: [
      "João",
      "8",
      "10",
      "2",
      "1 corte grátis",
      "https://osiqueira.jpproject.com.br/perfil",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Régua operacional (barbeiro/dono)                                       */
  /* ---------------------------------------------------------------------- */

  encaixe_solicitacao: {
    name: "encaixe_solicitacao",
    category: "UTILITY",
    language: "pt_BR",
    audience: "barbeiro",
    trigger:
      "Cliente solicitou encaixe em horário ocupado. Expira em 45 min sem resposta.",
    body:
      "🔔 Pedido de encaixe\n\n" +
      "Cliente: {{1}}\n" +
      "Serviço: {{2}}\n" +
      "Quando: {{3}} às {{4}}\n" +
      "Valor: {{5}} ({{6}})\n\n" +
      "Responda em até 45 minutos — depois disso o pedido expira e o cliente " +
      "recebe horários alternativos automaticamente.",
    params: ["nomeCliente", "servicos", "data", "hora", "valor", "formaPagamento"],
    example: [
      "João Damas",
      "Corte + barba",
      "domingo, 02 de agosto",
      "16:30",
      "R$ 90,00",
      "pagar no salão",
    ],
    buttons: [
      { label: "Aprovar encaixe", action: "APPROVE_FITIN" },
      { label: "Recusar", action: "DECLINE_FITIN" },
    ],
  },

  resumo_do_dia: {
    name: "resumo_do_dia",
    category: "UTILITY",
    language: "pt_BR",
    audience: "barbeiro",
    trigger: "Diariamente às 7h (configurável).",
    body:
      "☀️ Bom dia! Sua agenda de hoje ({{1}}):\n\n" +
      "Atendimentos: {{2}}\n" +
      "Confirmados: {{3}} · Sem confirmação: {{4}}\n" +
      "Previsão de caixa: {{5}}\n" +
      "Horários ainda livres: {{6}}\n\n" +
      "Detalhes no painel {{7}} — bom trabalho!",
    params: [
      "data",
      "totalAtendimentos",
      "confirmados",
      "naoConfirmados",
      "previsaoCaixa",
      "horariosLivres",
      "linkPainel",
    ],
    example: [
      "sexta, 31 de julho",
      "8",
      "6",
      "2",
      "R$ 640,00",
      "4",
      "https://osiqueira.jpproject.com.br/painel",
    ],
  },

  alerta_operacional: {
    name: "alerta_operacional",
    category: "UTILITY",
    language: "pt_BR",
    audience: "barbeiro",
    trigger:
      "Cancelamento de última hora, mensalista regularizado, estoque abaixo do mínimo.",
    body:
      "⚠️ Atenção: {{1}}\n\n" +
      "O que aconteceu: {{2}}\n\n" +
      "Confira os detalhes no painel {{3}} quando puder.",
    params: ["titulo", "detalhe", "linkPainel"],
    example: [
      "Cancelamento de última hora",
      "João Damas cancelou o horário das 16:30 de hoje (Corte + barba, R$ 90,00). O slot já foi liberado na agenda.",
      "https://osiqueira.jpproject.com.br/painel",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Régua de mensalistas (cobrança)                                         */
  /* ---------------------------------------------------------------------- */

  /* Todo este bloco foi reescrito em 17/08 (D14).
   *
   * Ele descrevia uma operação de cobrança que não existe em nenhuma camada:
   * `subscription.ts` diz, em comentário, que "não há checkout — a contratação
   * é humana, por WhatsApp"; a coleção `subscriptions` não é escrita por
   * caminho nenhum (G2); e o `/planos` para onde os links apontavam virou
   * vitrine com contato da barbearia quando P0-1 removeu o checkout falso.
   *
   * O que mudou, e o que NÃO mudou: o valor, o vencimento e a consequência
   * continuam na mensagem — o mensalista precisa saber quanto deve, quando, e
   * o que acontece se não pagar. O que saiu foi só o MEIO: "pague pelo link"
   * virou "acerte com a barbearia", que é como o dinheiro realmente anda hoje.
   *
   * `linkPagamento` virou `linkPlanos` em todo o bloco. O nome do parâmetro é
   * documentação: quem fosse preencher iria procurar um link de pagamento que
   * não existe, e colocar ali o que tivesse à mão. */

  mensalidade_aviso: {
    name: "mensalidade_aviso",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "D-5, D-3 e D-1 do vencimento da mensalidade.",
    body:
      "Oi {{1}}! Sua mensalidade do plano {{2}} ({{3}}) vence em {{4}}.\n\n" +
      "O acerto é feito direto com a barbearia — é só responder por aqui. " +
      "Os detalhes do plano ficam em {{5}}, quando quiser conferir.",
    params: ["primeiroNome", "nomePlano", "valor", "vencimento", "linkPlanos"],
    example: [
      "João",
      "Ilimitado",
      "R$ 149,00",
      "05/08",
      "https://osiqueira.jpproject.com.br/planos",
    ],
  },

  mensalidade_hoje: {
    name: "mensalidade_hoje",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "D0 — dia do vencimento.",
    body:
      "Oi {{1}}, hoje é o vencimento da sua mensalidade do plano {{2}}: {{3}}.\n\n" +
      "Como funciona: {{4}}\n\nQualquer dúvida, é só responder por aqui.",
    params: ["primeiroNome", "nomePlano", "valor", "instrucao"],
    example: [
      "João",
      "Ilimitado",
      "R$ 149,00",
      "O acerto é feito direto na barbearia — é só responder por aqui para combinar.",
    ],
  },

  mensalidade_atraso: {
    name: "mensalidade_atraso",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "D+1 e D+3 após o vencimento.",
    body:
      "Oi {{1}}, sua mensalidade do plano {{2}} ({{3}}) venceu em {{4}} e ainda " +
      "consta em aberto.\n\n" +
      "Para manter seus benefícios ativos, é só responder por aqui e acertar " +
      "com a barbearia. O plano está em {{5}}, se quiser conferir os detalhes.",
    params: ["primeiroNome", "nomePlano", "valor", "vencimento", "linkPlanos"],
    example: [
      "João",
      "Ilimitado",
      "R$ 149,00",
      "05/08",
      "https://osiqueira.jpproject.com.br/planos",
    ],
  },

  mensalidade_suspensao: {
    name: "mensalidade_suspensao",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "D+5 — aviso final antes da suspensão do plano.",
    body:
      "Oi {{1}}, este é o último aviso sobre a mensalidade do plano {{2}} " +
      "({{3}}), vencida em {{4}}.\n\n" +
      "Se não for regularizada, seu plano será suspenso e os benefícios ficam " +
      "pausados até o acerto. Responda por aqui e a gente resolve agora — o " +
      "plano está em {{5}}, se quiser conferir os detalhes.",
    params: ["primeiroNome", "nomePlano", "valor", "vencimento", "linkPlanos"],
    example: [
      "João",
      "Ilimitado",
      "R$ 149,00",
      "05/08",
      "https://osiqueira.jpproject.com.br/planos",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Avisos de agenda                                                        */
  /* ---------------------------------------------------------------------- */

  agenda_alterada: {
    name: "agenda_alterada",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger:
      "Gestor bloqueou agenda (folga, férias, feriado) ou alterou uma reserva. " +
      "Dispara para todos os clientes com horário afetado.",
    body:
      "Oi {{1}}, precisamos avisar sobre o seu horário de {{2}} às {{3}}.\n\n" +
      "Motivo: {{4}}\n\n" +
      "Escolha um novo horário em um toque pelo link {{5}} — leva menos de um minuto.",
    params: ["primeiroNome", "data", "hora", "motivo", "linkReagendamento"],
    example: [
      "João",
      "domingo, 02 de agosto",
      "16:30",
      "A barbearia estará fechada nesse dia por conta do feriado. Sentimos muito pelo transtorno!",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
    buttons: [{ label: "Escolher novo horário", action: "RESCHEDULE" }],
  },

  comunicado_geral: {
    name: "comunicado_geral",
    category: "MARKETING",
    language: "pt_BR",
    audience: "cliente",
    trigger:
      "Ação avulsa do gestor ('Enviar aviso aos clientes'). Respeita opt-in e limites anti-spam.",
    body:
      "💈 {{1}}\n\n" +
      "Detalhes: {{2}}\n\n" +
      "Para aproveitar: {{3}} — qualquer dúvida, é só responder por aqui.",
    params: ["titulo", "mensagem", "chamadaParaAcao"],
    example: [
      "Horário especial de fim de ano 💈",
      "De 24/12 a 02/01 vamos funcionar das 9h às 15h. A partir de 03/01 voltamos ao horário normal.",
      "Garanta seu horário: https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Reengajamento (MARKETING — exige opt-in)                                */
  /* ---------------------------------------------------------------------- */

  reativacao_cliente: {
    name: "reativacao_cliente",
    category: "MARKETING",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Cliente sem atendimento há 45 dias (configurável).",
    body:
      "E aí {{1}}, sumiu! 💈\n\n" +
      "Faz {{2}} dias desde seu último corte na {{3}}. Que tal dar aquela " +
      "renovada?\n\n" +
      "Seu horário de costume ({{4}}) costuma estar livre. Agende pelo link {{5}} " +
      "e a gente te espera.",
    params: ["primeiroNome", "diasSemVir", "nomeBarbearia", "horarioCostume", "linkApp"],
    example: [
      "João",
      "47",
      "O Siqueira Barbearia",
      "sábado à tarde",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  aniversario: {
    name: "aniversario",
    category: "MARKETING",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Data de aniversário do cliente.",
    body:
      "Parabéns, {{1}}! 🎉\n\n" +
      "A {{2}} te dá {{3}} no seu próximo atendimento deste mês. " +
      "É nosso presente.\n\n" +
      "Agende quando quiser pelo link {{4}} — vai ser um prazer.",
    params: ["primeiroNome", "nomeBarbearia", "mimo", "linkApp"],
    example: [
      "João",
      "O Siqueira Barbearia",
      "sobrancelha grátis",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Reserva: estados de pagamento e falta                                   */
  /* ---------------------------------------------------------------------- */

  reserva_aguardando_pagamento: {
    name: "reserva_aguardando_pagamento",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    /* Estado `pending_payment` do domínio. Nenhum caminho do produto o produz:
     * `createBooking` recusa `paymentOrigin` diferente de `in_person`
     * (booking.ts:68) e grava `confirmed`.
     *
     * O template ficou, e o texto mudou. Tirá-lo exigiria ressubmissão na Meta
     * e enfraqueceria o teste que garante uma mensagem para cada estado do
     * domínio — enquanto o estado existir no tipo, ele precisa de resposta. O
     * que não podia ficar era o corpo: ele mandava o cliente pagar online, com
     * cronômetro, num produto que recusa pagamento online na porta de entrada.
     * Um template dorme de graça; um template mentiroso dorme armado. */
    trigger:
      "Estado `pending_payment`. Hoje nenhum caminho do produto o produz — " +
      "booking.ts:68 recusa pagamento antecipado e a reserva nasce `confirmed`.",
    body:
      "Oi {{1}}, recebemos seu pedido de horário para {{2}} às {{3}} ({{4}}).\n\n" +
      "Ele ainda não está confirmado. Assim que a {{5}} confirmar, você recebe " +
      "o aviso por aqui — e o acerto é feito na barbearia, no dia do atendimento.",
    params: ["primeiroNome", "data", "hora", "servicos", "nomeBarbearia"],
    example: [
      "João",
      "segunda, 03 de agosto",
      "16:30",
      "Corte + barba",
      "O Siqueira Barbearia",
    ],
  },

  reserva_expirada: {
    name: "reserva_expirada",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Hold de pagamento venceu sem confirmação. Status vira `expired`.",
    body:
      "Oi {{1}}, o prazo para confirmar o horário de {{2}} às {{3}} terminou e " +
      "ele voltou para a agenda.\n\n" +
      "Se ainda quiser, dá para escolher outro horário em {{4}} — leva menos de um minuto.",
    params: ["primeiroNome", "data", "hora", "linkApp"],
    example: [
      "João",
      "segunda, 03 de agosto",
      "16:30",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  reagendamento_confirmado: {
    name: "reagendamento_confirmado",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Cliente reagendou pelo app, dentro da janela permitida.",
    body:
      "Pronto, {{1}}! Seu horário mudou de {{2}} para {{3}} às {{4}}.\n\n" +
      "Serviço: {{5}}\n" +
      "Endereço: {{6}}\n\n" +
      "Te esperamos no novo horário.",
    params: ["primeiroNome", "quandoAntes", "data", "hora", "servicos", "endereco"],
    example: [
      "João",
      "domingo, 02 de agosto às 16:30",
      "terça, 04 de agosto",
      "10:00",
      "Corte + barba",
      "Rua das Tesouras, 120 — Centro",
    ],
  },

  reembolso_processado: {
    name: "reembolso_processado",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    /* Este FICA, e é a contraprova da régua de D14.
     *
     * O produto não move dinheiro; uma pessoa move. A barbearia recebeu em mãos
     * e pode devolver em mãos — avisar o cliente disso é verdadeiro e útil. O
     * que era falso estava só no exemplo: "a mesma chave usada no pagamento"
     * descrevia uma reversão automática sobre o instrumento original, que exige
     * o gateway que não existe.
     *
     * Se a correção de D14 tivesse sido "apagar tudo que fala de dinheiro",
     * este template teria caído junto — e a barbearia perderia a única forma de
     * registrar por escrito uma devolução que ela de fato fez. */
    trigger:
      "Devolução feita pela barbearia. O PRD §6 exige comunicar o prazo — e " +
      "quem devolve é uma pessoa, então o prazo é o que ela combinou.",
    body:
      "Oi {{1}}, o valor de {{2}} referente à reserva de {{3}} foi devolvido.\n\n" +
      "Forma: {{4}}\n" +
      "Prazo estimado: {{5}}\n\n" +
      "Qualquer coisa é só responder por aqui.",
    params: ["primeiroNome", "valor", "data", "formaDevolucao", "prazo"],
    example: [
      "João",
      "R$ 67,50",
      "domingo, 02 de agosto",
      "Pix enviado pela barbearia para a chave que você informar",
      "até 1 dia útil",
    ],
  },

  ocorrencia_registrada: {
    name: "ocorrencia_registrada",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger:
      "Atendimento marcado como no-show. Registra a ocorrência no histórico (PRD §6).",
    body:
      "Oi {{1}}, notamos que você não conseguiu vir no horário de {{2}} às {{3}}.\n\n" +
      "Sem problema — acontece. Só avisando que o horário ficou reservado e não " +
      "pôde ser usado por outra pessoa.\n\n" +
      "Quando quiser remarcar, é só abrir {{4}} e escolher o que der certo pra você.",
    params: ["primeiroNome", "data", "hora", "linkApp"],
    example: [
      "João",
      "domingo, 02 de agosto",
      "16:30",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  pagamento_antecipado_exigido: {
    name: "pagamento_antecipado_exigido",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger:
      "Cliente atingiu o limite de faltas na janela configurada. O PRD §4 exige avisar o PORQUÊ ao aplicar a regra.",
    /* Texto deliberadamente sem tom de punição: o cliente continua bem-vindo, o
     * que mudou foi a forma de reservar. Mensagem acusatória gera bloqueio, e
     * bloqueio derruba a nota de qualidade do número. */
    body:
      "Oi {{1}}, tudo bem? Um aviso rápido sobre suas próximas reservas na {{2}}.\n\n" +
      "Como alguns horários recentes acabaram não sendo usados, as próximas " +
      "reservas passam a ser confirmadas com pagamento antecipado — assim o " +
      "horário fica garantido pra você.\n\n" +
      "Nada muda no atendimento, e você continua podendo cancelar dentro do prazo " +
      "com devolução. Detalhes da política em {{3}} — qualquer dúvida, é só responder.",
    params: ["primeiroNome", "nomeBarbearia", "linkPolitica"],
    example: [
      "João",
      "O Siqueira Barbearia",
      "https://osiqueira.jpproject.com.br/perfil",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Fidelidade                                                              */
  /* ---------------------------------------------------------------------- */

  fidelidade_recompensa_liberada: {
    name: "fidelidade_recompensa_liberada",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Saldo de carimbos atingiu a meta. É o principal gatilho de retorno.",
    body:
      "Boa, {{1}}! Você completou {{2}} carimbos na {{3}}.\n\n" +
      "Seu prêmio está liberado: {{4}}\n\n" +
      "É só resgatar pelo app em {{5}} e usar no próximo atendimento.",
    params: ["primeiroNome", "carimbos", "nomeBarbearia", "recompensa", "linkApp"],
    example: [
      "João",
      "10",
      "O Siqueira Barbearia",
      "1 corte grátis",
      "https://osiqueira.jpproject.com.br/reservas",
    ],
  },

  fidelidade_resgatada: {
    name: "fidelidade_resgatada",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Cliente resgatou a recompensa pelo app.",
    body:
      "Resgate confirmado, {{1}}! Seu prêmio {{2}} está válido para usar na {{3}}.\n\n" +
      "Sua contagem recomeça do zero a partir do próximo atendimento. " +
      "Agende quando quiser em {{4}} — vai ser um prazer.",
    params: ["primeiroNome", "recompensa", "nomeBarbearia", "linkApp"],
    example: [
      "João",
      "1 corte grátis",
      "O Siqueira Barbearia",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Mensalista: ciclo de vida do plano                                      */
  /* ---------------------------------------------------------------------- */

  plano_ativado: {
    name: "plano_ativado",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    /* "próxima cobrança" → "próximo vencimento" em todo o ciclo (D14).
     *
     * A diferença não é de estilo. "Cobrança" diz que alguém vai debitar; num
     * produto sem cobrança automática, quem precisa agir é o cliente, e ele fica
     * esperando um débito que nunca vem — até o plano ser suspenso por uma
     * mensalidade que ele achou que estava paga. "Vencimento" diz a data e
     * devolve a ação para quem a tem. */
    trigger: "Plano ativado pela barbearia, com a primeira mensalidade acertada.",
    body:
      "Bem-vindo ao clube, {{1}}! Seu plano {{2}} está ativo na {{3}}.\n\n" +
      "O que inclui: {{4}}\n" +
      "Valor: {{5}}/mês · próximo vencimento em {{6}}\n\n" +
      "Já pode agendar usando o plano em {{7}} — bom corte!",
    params: [
      "primeiroNome", "nomePlano", "nomeBarbearia", "beneficios",
      "valor", "proximoVencimento", "linkApp",
    ],
    example: [
      "João",
      "Corte ilimitado",
      "O Siqueira Barbearia",
      "cortes ilimitados no mês",
      "R$ 149,00",
      "05/09",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  mensalidade_paga: {
    name: "mensalidade_paga",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Mensalidade registrada como paga pela barbearia.",
    body:
      "Recebemos, {{1}}! Sua mensalidade do plano {{2}} ({{3}}) foi paga.\n\n" +
      "Próximo vencimento: {{4}}\n\n" +
      "Seus benefícios seguem ativos. Bom corte!",
    params: ["primeiroNome", "nomePlano", "valor", "proximoVencimento"],
    example: ["João", "Corte ilimitado", "R$ 149,00", "05/09"],
  },

  plano_suspenso: {
    name: "plano_suspenso",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "D+5 sem pagamento. O plano foi efetivamente suspenso (PRD §8).",
    body:
      "Oi {{1}}, seu plano {{2}} ficou suspenso porque a mensalidade de {{3}} " +
      "segue em aberto.\n\n" +
      "Você continua podendo agendar normalmente, pagando por atendimento. " +
      "Assim que acertar com a barbearia, os benefícios voltam na hora — o " +
      "plano está em {{4}}, se quiser conferir.",
    params: ["primeiroNome", "nomePlano", "vencimento", "linkPlanos"],
    example: [
      "João",
      "Corte ilimitado",
      "05/08",
      "https://osiqueira.jpproject.com.br/planos",
    ],
  },

  plano_reativado: {
    name: "plano_reativado",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Mensalista acertou a mensalidade — reativação imediata (PRD §8).",
    body:
      "Tudo certo, {{1}}! Seu plano {{2}} voltou a ficar ativo na {{3}}.\n\n" +
      "Próximo vencimento: {{4}}\n\n" +
      "Pode agendar usando o plano normalmente em {{5}} — bom corte!",
    params: ["primeiroNome", "nomePlano", "nomeBarbearia", "proximoVencimento", "linkApp"],
    example: [
      "João",
      "Corte ilimitado",
      "O Siqueira Barbearia",
      "05/09",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },

  plano_cancelado: {
    name: "plano_cancelado",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger:
      "Cancelamento confirmado. Vale até o fim do ciclo já pago (PRD §8).",
    body:
      "Oi {{1}}, seu plano {{2}} foi cancelado, como você pediu.\n\n" +
      "Ele continua valendo até {{3}} — até lá seus benefícios seguem normais. " +
      "Depois disso, os atendimentos voltam a ser cobrados no avulso.\n\n" +
      "Se mudar de ideia, é só falar com a gente por aqui. Os planos ficam em " +
      "{{4}}, quando quiser olhar.",
    params: ["primeiroNome", "nomePlano", "fimDoCiclo", "linkPlanos"],
    example: [
      "João",
      "Corte ilimitado",
      "05/09",
      "https://osiqueira.jpproject.com.br/planos",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Operacional (barbeiro)                                                  */
  /* ---------------------------------------------------------------------- */

  nova_reserva: {
    name: "nova_reserva",
    category: "UTILITY",
    language: "pt_BR",
    audience: "barbeiro",
    trigger: "Reserva confirmada pelo app, sem passar por encaixe.",
    body:
      "📅 Nova reserva confirmada\n\n" +
      "Cliente: {{1}}\n" +
      "Serviço: {{2}}\n" +
      "Quando: {{3}} às {{4}}\n" +
      "Valor: {{5}} ({{6}})\n\n" +
      "Já está na sua agenda — nada a fazer.",
    params: ["nomeCliente", "servicos", "data", "hora", "valor", "formaPagamento"],
    example: [
      "João Damas",
      "Corte + barba",
      "segunda, 03 de agosto",
      "16:30",
      "R$ 90,00",
      /* Mesmo motivo do `confirmacao_reserva`: `formaPagamento(null)` na
       * criação. O dono não pode ler "pago via Pix" e deixar de cobrar. */
      "pagar no salão",
    ],
  },

  fechamento_mensal: {
    name: "fechamento_mensal",
    category: "UTILITY",
    language: "pt_BR",
    audience: "barbeiro",
    trigger: "Primeiro dia útil do mês, com o resultado do mês anterior fechado.",
    body:
      "📊 Fechamento de {{1}}\n\n" +
      "Faturamento: {{2}}\n" +
      "Custos: {{3}}\n" +
      "Resultado: {{4}} ({{5}} de margem)\n" +
      "Atendimentos: {{6}}\n\n" +
      "O detalhamento e o DRE completo estão em {{7}} — bom mês!",
    params: [
      "mesReferencia", "faturamento", "custos", "resultado",
      "margem", "atendimentos", "linkPainel",
    ],
    example: [
      "julho",
      "R$ 12.469,00",
      "R$ 4.953,00",
      "R$ 7.516,00",
      "60%",
      "168",
      "https://osiqueira.jpproject.com.br/painel/financeiro/dre",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Plataforma → dono da barbearia (sai da SUA WABA, não da dela)           */
  /* ---------------------------------------------------------------------- */

  trial_terminando: {
    name: "trial_terminando",
    category: "UTILITY",
    language: "pt_BR",
    audience: "barbeiro",
    sender: "plataforma",
    /* "escolha um plano em {{5}} — leva dois minutos" descrevia autoatendimento
     * (D14). `definirPlano` exige operador da plataforma: o dono não contrata
     * sozinho, e a página é vitrine. Ele clicaria, não acharia botão nenhum, e
     * perderia o dia em que precisava decidir. */
    trigger: "Faltam 3 dias para o fim do teste de 7 dias.",
    body:
      "Oi {{1}}, faltam {{2}} dias do seu teste na {{3}}.\n\n" +
      "Nesse período você já registrou {{4}} atendimento(s). Para continuar " +
      "com tudo funcionando, é só responder por aqui que a gente acerta o " +
      "plano com você — seus dados continuam onde estão. Os planos estão em " +
      "{{5}}, se quiser dar uma olhada antes.",
    params: ["primeiroNome", "diasRestantes", "nomePlataforma", "atendimentos", "linkPlanos"],
    example: ["Zé", "3", "nossa plataforma", "12", "https://app.exemplo.com.br/planos"],
  },

  trial_encerrado: {
    name: "trial_encerrado",
    category: "UTILITY",
    language: "pt_BR",
    audience: "barbeiro",
    sender: "plataforma",
    trigger: "Fim dos 7 dias sem plano escolhido. App entra em modo leitura.",
    body:
      "Oi {{1}}, seu teste terminou hoje.\n\n" +
      "Nada foi apagado: sua agenda, seus clientes e seu financeiro continuam " +
      "salvos. Responda por aqui e a gente reativa tudo junto com você — os " +
      "planos estão em {{2}}, se quiser conferir antes.\n\n" +
      "Se quiser conversar antes de decidir, é só responder por aqui.",
    params: ["primeiroNome", "linkPlanos"],
    example: ["Zé", "https://app.exemplo.com.br/planos"],
  },

  cobranca_falhou: {
    name: "cobranca_falhou",
    category: "UTILITY",
    language: "pt_BR",
    audience: "barbeiro",
    sender: "plataforma",
    /* O nome fica: uma mensalidade que não foi paga é uma cobrança que falhou,
     * automática ou não. O corpo é que não podia ficar — ele descrevia cartão
     * cadastrado, limite recusado e nova tentativa automática, três coisas que
     * exigem o gateway que `subscription.ts` diz não existir. O dono ficaria
     * esperando a retentativa até o dia em que o app entrasse em modo leitura. */
    trigger: "Mensalidade da plataforma em aberto. A contratação é humana — não há cobrança automática que possa falhar.",
    body:
      "Oi {{1}}, a mensalidade do seu plano {{2}} ({{3}}) está em aberto.\n\n" +
      "É só responder por aqui que a gente acerta junto — nada é interrompido " +
      "enquanto isso. Os planos ficam em {{4}}, se quiser conferir.",
    params: ["primeiroNome", "nomePlano", "valor", "linkPlanos"],
    example: ["Zé", "Crescimento", "R$ 197,00", "https://app.exemplo.com.br/planos"],
  },

} as const satisfies Record<string, TemplateDef>;

export type TemplateName = keyof typeof TEMPLATES;

/**
 * Payload de botão: `ACTION:barbershopId:bookingId`.
 *
 * A BARBEARIA vai junto, e não é redundância.
 *
 * Com um número por barbearia, o webhook descobria a dona da mensagem pelo
 * `phone_number_id`. Num número ÚNICO para toda a plataforma esse caminho
 * aponta sempre para a mesma barbearia — e o toque de "Confirmo que vou" de um
 * cliente cairia na agenda de outro salão.
 *
 * O payload volta pela Meta dentro de uma requisição assinada, então ele é tão
 * confiável quanto o resto do corpo: é a fonte mais segura para saber de quem é
 * o botão, e a única que não depende do número que enviou.
 *
 * Limite da Meta: 128 caracteres. Ação + dois ids do Firestore dão ~62.
 */
export function buttonPayload(
  action: ButtonAction,
  barbershopId: string,
  bookingId: string
) {
  return `${action}:${barbershopId}:${bookingId}`;
}

/** Lê um payload de botão devolvido pelo webhook. */
export function parseButtonPayload(
  payload: string
): { action: ButtonAction; barbershopId: string; bookingId: string } | null {
  const [action, barbershopId, bookingId] = String(payload ?? "").split(":");
  if (!action || !barbershopId || !bookingId) return null;
  return { action: action as ButtonAction, barbershopId, bookingId };
}
