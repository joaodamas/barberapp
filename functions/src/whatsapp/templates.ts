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
  /** Texto do botão exibido no WhatsApp (máx. 25 caracteres). */
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
  /** Para quem essa mensagem vai: cliente final ou dono/barbeiro. */
  audience: "cliente" | "barbeiro";
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
    trigger: "Reserva criada (pagamento aprovado ou opção 'pagar no salão').",
    body:
      "Olá {{1}}! Sua reserva na {{2}} está confirmada.\n\n" +
      "Serviço: {{3}}\n" +
      "Quando: {{4}} às {{5}}\n" +
      "Valor: {{6}} ({{7}})\n" +
      "Endereço: {{8}}\n\n" +
      "Cancelamento até 24h antes tem 100% de devolução. Entre 24h e 6h, " +
      "aplicamos a taxa de cancelamento. Te esperamos!",
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
      "pago via Pix",
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
      { label: "Confirmo ✅", action: "CONFIRM_BOOKING" },
      { label: "Preciso cancelar ❌", action: "CANCEL_BOOKING" },
    ],
  },

  cancelamento_reserva: {
    name: "cancelamento_reserva",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "Cancelamento confirmado (pelo cliente ou pela loja).",
    body:
      "{{1}}, sua reserva de {{2}} às {{3}} foi cancelada.\n\n" +
      "{{4}}\n\n" +
      "Quando quiser remarcar, é só abrir o app: {{5}}",
    params: [
      "primeiroNome",
      "data",
      "hora",
      "detalheReembolso",
      "linkApp",
    ],
    example: [
      "João",
      "domingo, 02 de agosto",
      "16:30",
      "Devolvemos R$ 90,00 em até 5 dias úteis na mesma forma de pagamento.",
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
      "{{1}}, não consegui encaixar o horário das {{2}}. 😕\n\n" +
      "Mas tenho estes horários livres para {{3}}:\n{{4}}\n\n" +
      "Garanta o seu em um toque: {{5}}",
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
    body:
      "Valeu pela visita, {{1}}! 💈\n\n" +
      "Você agora tem {{2}} de {{3}} carimbos — faltam {{4}} para {{5}}.\n\n" +
      "Se puder avaliar o atendimento, ajuda muito: {{6}}",
    params: [
      "primeiroNome",
      "carimbos",
      "meta",
      "faltam",
      "recompensa",
      "linkAvaliacao",
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
      { label: "Aprovar ✅", action: "APPROVE_FITIN" },
      { label: "Recusar ❌", action: "DECLINE_FITIN" },
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
      "Detalhes no painel: {{7}}",
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
    body: "⚠️ {{1}}\n\n{{2}}\n\nVer no painel: {{3}}",
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

  mensalidade_aviso: {
    name: "mensalidade_aviso",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "D-5, D-3 e D-1 do vencimento da mensalidade.",
    body:
      "Oi {{1}}! Sua mensalidade do plano {{2}} ({{3}}) vence em {{4}}.\n\n" +
      "Pode pagar por aqui, leva menos de um minuto: {{5}}",
    params: ["primeiroNome", "nomePlano", "valor", "vencimento", "linkPagamento"],
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
      "{{1}}, hoje é o vencimento da sua mensalidade do plano {{2}}: {{3}}.\n\n" +
      "{{4}}",
    params: ["primeiroNome", "nomePlano", "valor", "instrucao"],
    example: [
      "João",
      "Ilimitado",
      "R$ 149,00",
      "A cobrança automática no cartão será processada hoje — não precisa fazer nada.",
    ],
  },

  mensalidade_atraso: {
    name: "mensalidade_atraso",
    category: "UTILITY",
    language: "pt_BR",
    audience: "cliente",
    trigger: "D+1 e D+3 após o vencimento.",
    body:
      "{{1}}, sua mensalidade do plano {{2}} ({{3}}) venceu em {{4}} e ainda " +
      "consta em aberto.\n\n" +
      "Regularize por aqui para manter seus benefícios ativos: {{5}}",
    params: ["primeiroNome", "nomePlano", "valor", "vencimento", "linkPagamento"],
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
      "{{1}}, este é o último aviso sobre a mensalidade do plano {{2}} " +
      "({{3}}), vencida em {{4}}.\n\n" +
      "Se não for regularizada, seu plano será suspenso e os benefícios ficam " +
      "pausados até o pagamento. Resolver agora: {{5}}",
    params: ["primeiroNome", "nomePlano", "valor", "vencimento", "linkPagamento"],
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
      "{{1}}, precisamos avisar sobre o seu horário de {{2}} às {{3}}.\n\n" +
      "{{4}}\n\n" +
      "Escolha um novo horário em um toque: {{5}}",
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
    body: "{{1}}\n\n{{2}}\n\n{{3}}",
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
      "Seu horário de costume ({{4}}) costuma estar livre. Agende aqui: {{5}}",
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
      "Agende quando quiser: {{4}}",
    params: ["primeiroNome", "nomeBarbearia", "mimo", "linkApp"],
    example: [
      "João",
      "O Siqueira Barbearia",
      "sobrancelha grátis",
      "https://osiqueira.jpproject.com.br/agendar",
    ],
  },
} as const satisfies Record<string, TemplateDef>;

export type TemplateName = keyof typeof TEMPLATES;

/** Monta o payload de um botão: `ACTION:refId` — lido de volta no webhook. */
export function buttonPayload(action: ButtonAction, refId: string) {
  return `${action}:${refId}`;
}

/** Lê um payload de botão devolvido pelo webhook. */
export function parseButtonPayload(
  payload: string
): { action: ButtonAction; refId: string } | null {
  const [action, refId] = payload.split(":");
  if (!action || !refId) return null;
  return { action: action as ButtonAction, refId };
}
