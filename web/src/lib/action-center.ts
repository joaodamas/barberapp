import type { Doc } from "@/lib/db/repository";
import type { BookingDoc, PaymentDoc, ServiceDoc } from "@/lib/domain";
import type { TenantPaymentFees } from "@/lib/tenant";
import { dentroDoPeriodo, type Periodo } from "@/lib/analytics";

/**
 * Motor de decisão do Action Center.
 *
 * A regra de admissão, em uma frase: um item só existe se responder *o que
 * aconteceu*, *por que importa agora* e *o que eu faço*. Faltando qualquer uma,
 * é indicador — e indicador vive no topo da tela, não aqui.
 *
 * A decisão mora neste arquivo, e não na interface. A tela apresenta o que o
 * motor decidiu: sem isso, a regra de negócio se espalha em condicionais de
 * JSX, cada tela interpreta a operação do seu jeito, e o produto volta a ter
 * cinco números que discordam entre si.
 *
 * Contrato completo em `docs/ACTION-CENTER-CONTRATO.md`.
 */

export type ActionSeverity = "critical" | "warning" | "opportunity";

/**
 * Confiança da origem, herdada do Blueprint — com uma regra mais dura aqui:
 * `insufficient` NÃO gera item. Indicador ruim é ignorado; alerta falso destrói
 * a confiança no produto inteiro.
 */
export type ActionConfidence = "real" | "estimated";

/**
 * Urgência dentro da mesma severidade. Existe porque há teto de exibição: sem
 * ordem, o teto vira sorteio de qual problema o dono enxerga.
 */
export type ActionUrgency = 1 | 2 | 3;

/**
 * O que o item faz quando acionado.
 *
 * `navegar` cobre o que se resolve em outra tela. `fecharAtendimento` existe
 * porque a ação acontece na própria tela, num modal, e o motor não pode
 * conhecer React — ele declara a intenção e a tela sabe executá-la.
 */
export type ActionIntent =
  | { kind: "navegar"; href: string }
  | { kind: "fecharAtendimento"; bookingId: string };

export type ActionItem = {
  /**
   * Canônico: tipo + alvo. É o que impede o mesmo problema de aparecer duas
   * vezes com nomes diferentes.
   */
  id: string;
  severity: ActionSeverity;
  urgency: ActionUrgency;
  confidence: ActionConfidence;
  /** O que aconteceu. */
  title: string;
  /** Por que isso importa agora — a frase que justifica interromper o dono. */
  reason: string;
  actionLabel: string;
  intent: ActionIntent;
};

/** Quantos críticos aparecem antes do "ver mais". */
export const LIMITE_CRITICOS = 3;

const ORDEM_SEVERIDADE: Record<ActionSeverity, number> = {
  critical: 0,
  warning: 1,
  opportunity: 2,
};

/* ------------------------------------------------------------------ */
/* Avaliadores                                                         */
/* ------------------------------------------------------------------ */

/**
 * 4.1 — Atendimento concluído sem informar como o cliente pagou.
 *
 * O pagamento é materializado com taxa zero e o lucro do mês aparece maior do
 * que é. É a única situação crítica que já nasce com fonte de dado completa:
 * `paymentMethod` virou campo no mesmo dia em que o fechamento passou a
 * perguntar o método.
 */
export function fechamentosPendentes(bookings: Doc<BookingDoc>[]): ActionItem[] {
  return bookings
    .filter((b) => b.status === "completed" && !b.paymentMethod)
    .map((b) => ({
      id: `fechamento-pendente:${b.id}`,
      severity: "critical" as const,
      urgency: 1 as const,
      confidence: "real" as const,
      title: `${b.clientName} foi atendido e o pagamento não foi registrado`,
      reason:
        "Sem a forma de pagamento, a taxa da maquininha entra como zero e o lucro do mês fica maior do que é.",
      actionLabel: "Registrar pagamento",
      intent: { kind: "fecharAtendimento" as const, bookingId: b.id },
    }));
}

/**
 * 4.10 — Taxas de maquininha não informadas.
 *
 * Exige pagamento em cartão no período de propósito: barbearia que só recebe
 * Pix e dinheiro tem taxa zero de verdade, e seria absurdo cobrá-la por isso.
 */
export function taxasNaoConfiguradas(params: {
  fees: TenantPaymentFees;
  payments: Doc<PaymentDoc>[];
  periodo: Periodo;
}): ActionItem[] {
  const todasZeradas = Object.values(params.fees).every((v) => !v);
  if (!todasZeradas) return [];

  const usouCartao = params.payments.some(
    (p) =>
      dentroDoPeriodo(p.date, params.periodo) &&
      (p.paymentMethod === "debit" || p.paymentMethod === "credit")
  );
  if (!usouCartao) return [];

  return [
    {
      id: "taxas-nao-configuradas",
      severity: "critical",
      urgency: 3,
      confidence: "real",
      title: "Suas taxas de maquininha ainda não foram informadas",
      reason:
        "Você recebeu no cartão este mês, e o DRE está descontando 0% de taxa — o resultado aparece maior do que o real.",
      actionLabel: "Configurar taxas",
      intent: { kind: "navegar", href: "/painel/configuracoes" },
    },
  ];
}

/**
 * 4.4 — Nenhum serviço cadastrado.
 *
 * Já existia no painel como condicional solta; entra no motor para ter a mesma
 * forma dos demais. A guarda de `pronto` é o padrão de toda regra: lista vazia
 * porque a consulta não voltou é diferente de vazia porque não existe.
 */
export function semServicoCadastrado(params: {
  services: Doc<ServiceDoc>[];
  statusConsulta: "carregando" | "pronto" | "erro";
}): ActionItem[] {
  if (params.statusConsulta !== "pronto") return [];
  if (params.services.some((s) => s.active !== false)) return [];

  return [
    {
      id: "sem-servico",
      severity: "critical",
      urgency: 1,
      confidence: "real",
      title: "Nenhum serviço disponível para agendar",
      reason: "Seu cliente abre o app e não tem o que escolher.",
      actionLabel: "Cadastrar serviços",
      intent: { kind: "navegar", href: "/painel/servicos" },
    },
  ];
}

/**
 * 4.3 — Encaixe aguardando resposta.
 *
 * O cliente pediu horário fora da grade e está esperando. Urgência 2: acontece
 * agora, mas não corrompe dado.
 */
export function encaixesAguardando(bookings: Doc<BookingDoc>[]): ActionItem[] {
  const pendentes = bookings.filter((b) => b.status === "fit_in_requested");
  if (pendentes.length === 0) return [];

  return [
    {
      id: "encaixe-aguardando",
      severity: "critical",
      urgency: 2,
      confidence: "real",
      title:
        pendentes.length === 1
          ? `${pendentes[0].clientName} pediu um encaixe`
          : `${pendentes.length} pedidos de encaixe aguardando`,
      reason: "Quem pede encaixe está decidindo agora se procura outro lugar.",
      actionLabel: "Responder",
      intent: { kind: "navegar", href: "/painel" },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

export type EstadoOperacional = {
  /** Reservas do dia. */
  bookings: Doc<BookingDoc>[];
  services: Doc<ServiceDoc>[];
  statusServicos: "carregando" | "pronto" | "erro";
  payments: Doc<PaymentDoc>[];
  fees: TenantPaymentFees;
  periodo: Periodo;
};

/**
 * Avalia a operação e devolve o que exige decisão, já ordenado.
 *
 * Ordem: severidade, depois urgência. Itens de mesma urgência mantêm a ordem
 * em que os avaliadores rodaram, o que torna a saída determinística — a tela
 * não pode reordenar sozinha de um render para o outro.
 */
export function avaliarOperacao(estado: EstadoOperacional): ActionItem[] {
  const itens = [
    ...semServicoCadastrado({
      services: estado.services,
      statusConsulta: estado.statusServicos,
    }),
    ...fechamentosPendentes(estado.bookings),
    ...encaixesAguardando(estado.bookings),
    ...taxasNaoConfiguradas({
      fees: estado.fees,
      payments: estado.payments,
      periodo: estado.periodo,
    }),
  ];

  /* Unicidade por id: se dois avaliadores descreverem o mesmo problema, vence o
   * primeiro. É a rede de segurança do invariante de representação canônica —
   * a alternativa é o dono ver a mesma pendência três vezes com nomes
   * diferentes e parar de confiar na seção. */
  const porId = new Map<string, ActionItem>();
  for (const item of itens) if (!porId.has(item.id)) porId.set(item.id, item);

  return [...porId.values()].sort(
    (a, b) =>
      ORDEM_SEVERIDADE[a.severity] - ORDEM_SEVERIDADE[b.severity] ||
      a.urgency - b.urgency
  );
}

/**
 * Separa o que a tela mostra do que fica atrás do "ver mais".
 *
 * O corte é só dos críticos: uma lista de dez urgências não é urgência, é
 * ruído. O excedente **não some** — esconder problema é pior que listar demais.
 */
export function repartirParaExibicao(itens: ActionItem[]) {
  const criticos = itens.filter((i) => i.severity === "critical");
  const demais = itens.filter((i) => i.severity !== "critical");

  return {
    visiveis: [...criticos.slice(0, LIMITE_CRITICOS), ...demais],
    ocultos: criticos.slice(LIMITE_CRITICOS),
  };
}
