import type { PaymentMethod } from "./types";

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao: "Cartão",
  local: "No salão",
};
