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

export type PaymentMethod = "pix" | "cartao" | "local";

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
  paymentMethod: PaymentMethod;
};

export type TimeSlot = {
  time: string;
  available: boolean;
  isFitIn?: boolean;
};
