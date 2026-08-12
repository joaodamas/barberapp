export type Service = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  priceFrom?: boolean;
  description?: string;
};

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "confirmed_by_client"
  | "completed"
  | "no_show"
  | "cancelled_by_client"
  | "cancelled_by_shop"
  | "expired"
  | "fit_in_requested";

/**
 * ONDE o pagamento acontece.
 *
 * `in_person` é o balcão: o cliente marca sem pagar e acerta na hora do corte.
 * `online` entra quando houver gateway — e desemboca na mesma coleção
 * `payments`, o que mantém a cobrança como acréscimo e não como reescrita.
 */
export type PaymentOrigin = "in_person" | "online";

/**
 * O INSTRUMENTO com que o dinheiro entrou.
 *
 * Antes isto era `"pix" | "cartao" | "local"`, misturando as duas coisas:
 * "no salão" é lugar, não forma de pagar. A confusão tinha custo real —
 * `cartao` não separava débito de crédito, e o cálculo da taxa precisava supor
 * crédito por precaução, superestimando o custo do débito em 1,5 ponto.
 *
 * Só é conhecido no fechamento: quem sabe como o cliente pagou é quem está no
 * balcão, não o cliente no momento de agendar.
 */
export type PaymentMethod = "pix" | "cash" | "debit" | "credit";

export type Booking = {
  id: string;
  clientName: string;
  clientWhatsapp: string;
  serviceIds: string[];
  date: string;
  time: string;
  status: BookingStatus;
  value: number;
  isFitIn?: boolean;
  paymentOrigin: PaymentOrigin;
  /** Nulo até o atendimento ser concluído. */
  paymentMethod: PaymentMethod | null;
};

export type TimeSlot = {
  time: string;
  available: boolean;
  isFitIn?: boolean;
};
