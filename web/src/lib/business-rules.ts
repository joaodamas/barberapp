/**
 * Parâmetros de negócio da barbearia — fonte única.
 *
 * Tudo aqui é "configurável por barbearia" no PRD (§6, §8, §10) e vai virar um
 * documento de configuração no Firestore quando o multi-tenant entrar. Até lá,
 * estes valores são o default do tenant `axon-barber`.
 *
 * Regra: NENHUM percentual, janela ou prazo pode ser escrito direto numa tela.
 * Se um número de política aparece em JSX, ele veio daqui.
 */

import type { PaymentMethod } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Cancelamento e reagendamento (PRD §4 e §6)                          */
/* ------------------------------------------------------------------ */

export const cancellationPolicy = {
  /** Acima desta antecedência, devolução integral. */
  fullRefundHours: 24,
  /** Entre `partialRefundHours` e `fullRefundHours`, devolve com taxa. */
  partialRefundHours: 6,
  /**
   * Taxa retida no cancelamento da faixa intermediária.
   * PRD §6 sugere 20–30%; adotamos o meio da faixa. O código já devolveu 50%,
   * o dobro do especificado — não voltar a isso sem mudar o PRD junto.
   */
  cancellationFeePct: 25,
} as const;

export const reschedulePolicy = {
  /** Antecedência mínima para reagendar sem falar com a barbearia (PRD §4). */
  minHoursBefore: 6,
  /** Quantos reagendamentos a mesma reserva aceita (PRD §4). */
  maxPerBooking: 2,
} as const;

/** Devolução de um cancelamento, segundo a política acima. */
export function refundAmountFor(params: {
  value: number;
  paymentMethod: "pix" | "cartao" | "local";
  hoursUntilStart: number;
}) {
  const { value, paymentMethod, hoursUntilStart } = params;

  if (paymentMethod === "local") {
    return { amount: 0, retainedPct: 0, tier: "sem_pagamento" as const };
  }
  if (hoursUntilStart >= cancellationPolicy.fullRefundHours) {
    return { amount: value, retainedPct: 0, tier: "integral" as const };
  }
  if (hoursUntilStart >= cancellationPolicy.partialRefundHours) {
    const retainedPct = cancellationPolicy.cancellationFeePct;
    return {
      amount: Math.round(value * (1 - retainedPct / 100) * 100) / 100,
      retainedPct,
      tier: "parcial" as const,
    };
  }
  return { amount: 0, retainedPct: 100, tier: "sem_devolucao" as const };
}

/* ------------------------------------------------------------------ */
/* Agendamento (PRD §4)                                                */
/* ------------------------------------------------------------------ */

export const bookingPolicy = {
  /** Antecedência mínima para marcar — impede reservar um horário que já passou. */
  minAdvanceMinutes: 60,
  /** Antecedência máxima — quantos dias à frente a agenda fica aberta. */
  maxAdvanceDays: 60,
  /** Quantos dias o seletor de dias exibe de uma vez. */
  visibleDays: 10,
  /** Minutos por slot da grade — usado para checar se a duração total cabe. */
  slotMinutes: 30,
  /** Prazo para o barbeiro responder a um pedido de encaixe (PRD §4, épico 6). */
  fitInExpirationMinutes: 45,
} as const;

/** Dias da semana em que a barbearia abre (0 = domingo). Fechada aos domingos. */
export const openWeekdays = [1, 2, 3, 4, 5, 6];

export function isOpenOn(date: Date) {
  return openWeekdays.includes(date.getDay());
}

/* ------------------------------------------------------------------ */
/* Rateio financeiro (PRD §10)                                         */
/* ------------------------------------------------------------------ */

/**
 * Rateio entre profissional e barbearia.
 *
 * ⚠️ A BASE MUDA CONFORME O QUE FOI VENDIDO, e confundir as duas foi o erro
 * que fez o DRE informar 60% de margem:
 *
 * - **Serviço** (corte, barba): incide sobre o VALOR DO ATENDIMENTO. É assim
 *   que o mercado brasileiro paga barbeiro — 35% a 60% do faturamento — e é a
 *   maior linha de custo de uma barbearia com equipe.
 * - **Produto** (loja): incide sobre o LUCRO BRUTO da venda, porque o custo de
 *   compra não é receita de ninguém.
 *
 * Cada barbeiro pode ter percentual próprio (`StaffDoc.commissionPct`); este é
 * o padrão de quem não tem.
 */
export const commissionSplit = {
  barberPct: 40,
  shopPct: 60,
} as const;

/**
 * Taxa efetiva por meio de recebimento, em percentual.
 *
 * Referência da Stone, usada até a barbearia configurar a dela. O padrão é
 * proposital: zero seria uma afirmação FALSA — quem recebe por cartão paga a
 * maquininha —, e errado para baixo num custo é errado para cima no lucro.
 *
 * `local` é o que se paga no balcão (dinheiro ou maquininha da casa) e não
 * passa por gateway nenhum. O tipo é `Record<PaymentMethod, number>` de
 * propósito: um meio de pagamento novo passa a NÃO COMPILAR até alguém decidir
 * qual é a taxa dele, em vez de entrar valendo zero em silêncio.
 */
export const gatewayFeePct: Record<PaymentMethod, number> = {
  pix: 0.99,
  cartao: 3.15,
  local: 0,
};

/** Alíquota efetiva estimada do Simples Nacional sobre o lucro bruto. */
export const taxRatePct = 6;

if (commissionSplit.barberPct + commissionSplit.shopPct !== 100) {
  throw new Error(
    `commissionSplit inválido: ${commissionSplit.barberPct}% + ${commissionSplit.shopPct}% ≠ 100%`
  );
}

/** Decomposição de uma venda: quanto é comissão, imposto e sobra da barbearia. */
export function splitSale(params: { price: number; cost: number }) {
  const grossProfit = Math.max(params.price - params.cost, 0);
  const commission = (grossProfit * commissionSplit.barberPct) / 100;
  const tax = (grossProfit * taxRatePct) / 100;
  return {
    grossProfit,
    commission,
    tax,
    shopProfit: grossProfit - commission - tax,
  };
}

/* ------------------------------------------------------------------ */
/* Fidelidade (PRD §9)                                                 */
/* ------------------------------------------------------------------ */

export const loyaltyPolicy = {
  stampsForReward: 10,
  reward: "1 corte grátis",
} as const;

/* ------------------------------------------------------------------ */
/* Catálogos de configuração                                           */
/* ------------------------------------------------------------------ */

/** Categorias de despesa oferecidas no lançamento (PRD §11). */
export const expenseCategories = [
  "Aluguel",
  "Energia/Água",
  "Insumos e produtos",
  "Marketing",
  "Manutenção de equipamentos",
  "Internet e telefonia",
  "Software e assinaturas",
  "Outras despesas",
];

export type ExpensePaymentMethod = "Pix" | "Boleto" | "Cartão" | "Transferência";

export const expensePaymentMethods: ExpensePaymentMethod[] = [
  "Pix", "Boleto", "Cartão", "Transferência",
];

/**
 * Taxas de mercado por gateway, para comparação na tela de Financeiro.
 * Não é o que a barbearia paga — é referência. As taxas efetivas dela vão
 * viver em `/barbershops/{id}` quando o gateway entrar, versionadas por
 * vigência (PRD §5).
 */
export const paymentGateways = [
  {
    id: "stone",
    name: "Stone",
    fees: [
      { method: "Pix", pct: 0.99 },
      { method: "Débito", pct: 1.99 },
      { method: "Crédito à vista", pct: 3.15 },
      { method: "Crédito parcelado (6x)", pct: 8.5 },
    ],
  },
  {
    id: "infinitepay",
    name: "InfinitePay",
    fees: [
      { method: "Pix", pct: 0.75 },
      { method: "Débito", pct: 1.55 },
      { method: "Crédito à vista", pct: 2.69 },
      { method: "Crédito parcelado (6x)", pct: 7.99 },
    ],
  },
];
