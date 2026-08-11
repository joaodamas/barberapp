import type { BookingStatus, PaymentMethod } from "@/lib/types";

/**
 * Documentos do Firestore, como eles vivem sob `/barbershops/{id}/`.
 *
 * Diferente de `types.ts`, que descreve o que a tela usa: aqui é o formato
 * persistido. A separação importa porque o documento carrega `clientId` e
 * `createdAt`, que a tela não precisa, e usa `serviceIds` em vez do serviço
 * já resolvido.
 */

export type ServiceDoc = {
  name: string;
  durationMin: number;
  price: number;
  priceFrom?: boolean;
  active: boolean;
};

export type PlanDoc = {
  name: string;
  price: number;
  priceAvulso: number;
  description: string;
  highlight?: boolean;
  unlimited?: boolean;
  active: boolean;
};

export type ProductDoc = {
  name: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
};

/**
 * Comissão apurada de um atendimento — escrita só pelo servidor.
 *
 * Guarda a BASE e o PERCENTUAL, não apenas o resultado. Com `commissionAmount`
 * sozinho dá para saber quanto foi pago e não como se chegou lá; com os três,
 * o histórico é auditável e a regra pode mudar sem tornar o passado indecifrável.
 */
export type CommissionDoc = {
  bookingId: string;
  staffId: string;
  uid: string | null;
  staffName?: string | null;
  date: string;
  origin: "servico" | "produto";
  /** Congelados na conclusão. Nunca releem o cadastro. */
  commissionPct: number;
  commissionBase: number;
  commissionAmount: number;
};

/** Pagamento recebido — escrito só pelo servidor. */
export type PaymentDoc = {
  bookingId?: string;
  subscriptionId?: string;
  clientId: string | null;
  date: string;
  paymentMethod: PaymentMethod;
  grossAmount: number;
  /** Congelada na conclusão: mudar a taxa não altera o passado. */
  feePct: number;
  feeAmount: number;
  netAmount: number;
};

/** Entrada e saída de estoque — alimenta o CMV do DRE. */
export type InventoryMovementDoc = {
  productId: string;
  /** `compra` entra no CMV; `venda` entra na receita da loja. */
  kind: "compra" | "venda";
  quantity: number;
  /** Valor total do movimento, não unitário. */
  value: number;
  date: string;
};

export type BookingDoc = {
  clientId: string;
  /**
   * Qual barbeiro atende. Obrigatório desde a introdução do multi-barbeiro.
   *
   * Reserva sem dono não é ambígua só na agenda — ela some do cálculo de
   * comissão e não bate com capacidade nenhuma. Barbearia sempre tem ao menos
   * um barbeiro (criado no cadastro), então nunca existe motivo legítimo para
   * este campo faltar.
   */
  staffId: string;
  clientName: string;
  clientWhatsapp: string;
  serviceIds: string[];
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm`. */
  time: string;
  status: BookingStatus;
  value: number;
  paymentMethod: PaymentMethod;
  isFitIn?: boolean;
  /** Quando o encaixe foi pedido — base para o prazo de expiração. */
  requestedAt?: string;
};

export type SubscriberDoc = {
  clientId: string;
  name: string;
  planId: string;
  planName: string;
  price: number;
  status: "ativo" | "suspenso" | "cancelado";
  /** ISO `YYYY-MM-DD`, ou vazio quando cancelado. */
  nextCharge: string;
  dueStage?: "D-5" | "D-3" | "D-1" | "D0" | "D+1" | "D+3" | "D+5";
};

export type ExpenseDoc = {
  category: string;
  description: string;
  supplier: string;
  value: number;
  date: string;
  payment: "Pix" | "Boleto" | "Cartão" | "Transferência";
  recurring: boolean;
  observations?: string;
};

/**
 * Um barbeiro.
 *
 * RECURSO, não usuário. `members` é quem tem login; existe barbeiro que não
 * quer aplicativo, não tem e-mail, e mesmo assim ocupa uma cadeira e precisa
 * aparecer na agenda. Se o barbeiro só existisse com conta, o dono não
 * conseguiria cadastrar metade da equipe.
 */
export type StaffDoc = {
  name: string;
  active: boolean;
  /** Vínculo com uma conta, quando existe. */
  uid?: string | null;
  /** O que ele faz. Vazio = todos os serviços da barbearia. */
  serviceIds?: string[];
  /** Percentual dele na comissão. Ausente cai no padrão da plataforma. */
  commissionPct?: number;
  /**
   * Salário mensal fixo, em reais.
   *
   * Alimenta a linha de folha do DRE, que era zero estrutural: `payroll`
   * existia como parâmetro e nenhum chamador o preenchia, porque não havia
   * onde cadastrar. Ausente = only comissão, que é o arranjo mais comum.
   */
  salary?: number;
  /** Jornada própria. Ausente = herda a da barbearia. */
  schedule?: TenantScheduleLike | null;
  /** Para distinguir na agenda em colunas. */
  color?: string;
  order?: number;
};

/** A parte da jornada que o barbeiro pode sobrescrever. */
export type TenantScheduleLike = {
  weekdays: number[];
  opensAt: string;
  closesAt: string;
  breaks: Array<{ from: string; to: string }>;
  slotMinutes: number;
};

/** Serviços que este barbeiro atende — vazio significa TODOS, não nenhum. */
export function staffFazServico(staff: Pick<StaffDoc, "serviceIds">, serviceId: string) {
  const lista = staff.serviceIds ?? [];
  return lista.length === 0 || lista.includes(serviceId);
}

/**
 * Uma movimentação de fidelidade. O saldo é a SOMA das transações do cliente —
 * nunca uma contagem de atendimentos, que não sobrevive ao primeiro resgate.
 */
export type LoyaltyTransactionDoc = {
  clientId: string;
  kind: "credito" | "resgate" | "estorno";
  /** Positivo credita, negativo resgata. */
  stamps: number;
  bookingId?: string;
  rewardLabel?: string;
};

/** Saldo de carimbos e progresso até a recompensa. */
export function saldoDeFidelidade(
  transacoes: Array<{ stamps: number }>,
  meta: number
) {
  const saldo = transacoes.reduce((total, t) => total + (t.stamps ?? 0), 0);
  const stamps = Math.max(saldo, 0);
  return {
    stamps,
    goal: meta,
    faltam: Math.max(meta - stamps, 0),
    podeResgatar: stamps >= meta && meta > 0,
  };
}

/** Taxa do gateway, versionada por vigência (PRD §5). */
export type GatewayFeeDoc = {
  gateway: string;
  method: string;
  pct: number;
  validFrom: string;
};

/* ------------------------------------------------------------------ */

/** Reserva que ocupa horário na agenda. */
export const OCCUPIES_SLOT: BookingStatus[] = [
  "pending_payment",
  "confirmed",
  "confirmed_by_client",
  "completed",
  "no_show",
];

/** Reserva que virou dinheiro: só o que foi efetivamente atendido. */
export function isRevenue(booking: Pick<BookingDoc, "status">) {
  return booking.status === "completed";
}

/**
 * Reserva já recebida — caixa realizado.
 *
 * Contava Pix e cartão assim que confirmados, e dinheiro só na conclusão. Isso
 * misturava regime de caixa com competência dentro do mesmo número: o "Recebido"
 * do dia somava dinheiro que ainda não tinha virado atendimento.
 *
 * O produto adota UM marco financeiro — o atendimento concluído —, que é onde
 * `payments` e `commissions` são materializados. Numa barbearia o intervalo
 * entre atender e receber é de minutos, e um marco só evita dois números com o
 * mesmo nome divergindo entre telas.
 *
 * O que era previsão de recebimento não se perde: o painel Hoje já mostra
 * "Previsão do dia" separado, que é o lugar certo dela.
 */
export function isReceived(booking: Pick<BookingDoc, "status" | "paymentMethod">) {
  return booking.status === "completed";
}

/** `YYYY-MM` de uma data ISO. */
export function monthOf(isoDate: string) {
  return isoDate.slice(0, 7);
}
