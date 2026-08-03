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
 * Reserva já recebida.
 *
 * Pix e cartão contam assim que confirmados; dinheiro só quando o cliente é
 * atendido e marcado como concluído.
 */
export function isReceived(booking: Pick<BookingDoc, "status" | "paymentMethod">) {
  if (!OCCUPIES_SLOT.includes(booking.status)) return false;
  return booking.status === "completed" || booking.paymentMethod !== "local";
}

/** `YYYY-MM` de uma data ISO. */
export function monthOf(isoDate: string) {
  return isoDate.slice(0, 7);
}
