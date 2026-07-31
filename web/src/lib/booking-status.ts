import type { BookingStatus } from "./types";

export const bookingStatusMeta: Record<
  BookingStatus,
  { label: string; tone: "gold" | "success" | "danger" | "neutral" }
> = {
  pending_payment: { label: "Aguardando pagamento", tone: "gold" },
  confirmed: { label: "Confirmado", tone: "success" },
  confirmed_by_client: { label: "Confirmou presença", tone: "success" },
  completed: { label: "Concluído", tone: "neutral" },
  no_show: { label: "Não compareceu", tone: "danger" },
  cancelled_by_client: { label: "Cancelado pelo cliente", tone: "danger" },
  cancelled_by_shop: { label: "Cancelado pela loja", tone: "danger" },
  expired: { label: "Expirado", tone: "danger" },
  fit_in_requested: { label: "Encaixe pendente", tone: "gold" },
};
