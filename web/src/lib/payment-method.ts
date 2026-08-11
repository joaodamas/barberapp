import type { PaymentMethod, PaymentOrigin } from "./types";

/**
 * Vocabulário de pagamento na interface.
 *
 * As chaves são em inglês porque são contrato de dados, compartilhado com as
 * Cloud Functions; os rótulos são o que o dono e o cliente leem.
 */
export const paymentMethodLabel: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
};

export const paymentOriginLabel: Record<PaymentOrigin, string> = {
  in_person: "No salão",
  online: "Pago pelo app",
};

/**
 * Ordem das opções no fechamento.
 *
 * Pix primeiro porque é o meio mais usado em barbearia hoje, e o fechamento
 * precisa ser um clique — a primeira opção é a que a mão alcança sem ler.
 */
export const PAYMENT_METHODS: PaymentMethod[] = ["pix", "cash", "debit", "credit"];

/** Como a reserva aparece antes de ser concluída. */
export function labelDoPagamento(
  origin: PaymentOrigin,
  method: PaymentMethod | null
) {
  if (method) return paymentMethodLabel[method];
  return origin === "in_person" ? "A pagar no salão" : "Aguardando pagamento";
}
