"use client";

import { useShopCollection } from "@/lib/db/use-collection";
import { saldoDeFidelidade } from "@/lib/domain";
import { useTenant } from "@/lib/tenant-context";
import type {
  BookingDoc, CommissionDoc, ExpenseDoc, InventoryMovementDoc,
  LoyaltyTransactionDoc, PaymentDoc, PlanDoc, ProductDoc, ServiceDoc,
  StaffDoc, SubscriberDoc,
} from "@/lib/domain";

/**
 * Atalhos tipados por coleção.
 *
 * Cada tela declara o que precisa e recebe `{ items, status }` — o
 * `barbershopId` vem do tenant, nunca da tela.
 */
export const useServices = () =>
  useShopCollection<ServiceDoc>("services", { orderByField: "price" });

/** A equipe. `order` primeiro para o dono controlar a sequência na tela. */
export const useStaff = () => useShopCollection<StaffDoc>("staff", { orderByField: "order" });

/** Comissões apuradas — escritas pelo servidor na conclusão do atendimento. */
export const useCommissions = () =>
  useShopCollection<CommissionDoc>("commissions", {
    orderByField: "date",
    direction: "desc",
  });

/** Pagamentos recebidos — escritos pelo servidor na conclusão do atendimento. */
export const usePayments = () =>
  useShopCollection<PaymentDoc>("payments", {
    orderByField: "date",
    direction: "desc",
  });

export const usePlans = () => useShopCollection<PlanDoc>("plans", { orderByField: "price" });

export const useProducts = () =>
  useShopCollection<ProductDoc>("products", { orderByField: "name" });

export const useBookings = () =>
  useShopCollection<BookingDoc>("bookings", { orderByField: "date", direction: "desc" });

export const useExpenses = () =>
  useShopCollection<ExpenseDoc>("expenses", { orderByField: "date", direction: "desc" });

export const useSubscribers = () =>
  useShopCollection<SubscriberDoc>("subscriptions", { orderByField: "name" });

export const useInventoryMovements = () =>
  useShopCollection<InventoryMovementDoc>("inventoryMovements", {
    orderByField: "date",
    direction: "desc",
  });

/** Reservas de um cliente específico — o app do cliente. */
export const useMyBookings = (clientId: string | undefined) =>
  useShopCollection<BookingDoc>("bookings", {
    equals: { clientId },
    orderByField: "date",
    direction: "desc",
    enabled: !!clientId,
  });

/**
 * Fidelidade do cliente: saldo somado das transações, não contagem de
 * atendimentos — a contagem volta a subir sozinha depois de um resgate.
 */
export function useLoyalty(clientId: string | undefined) {
  const tenant = useTenant();
  const { items, status } = useShopCollection<LoyaltyTransactionDoc>("loyaltyTransactions", {
    equals: { clientId },
    enabled: !!clientId,
  });

  return {
    ...saldoDeFidelidade(items, tenant.policies.loyalty.stampsForReward),
    reward: tenant.policies.loyalty.reward,
    transacoes: items,
    status,
  };
}

/** Combina os estados de várias coleções numa só resposta. */
export function combineStatus(
  ...estados: Array<{ status: "carregando" | "pronto" | "erro" }>
) {
  if (estados.some((e) => e.status === "erro")) return "erro" as const;
  if (estados.some((e) => e.status === "carregando")) return "carregando" as const;
  return "pronto" as const;
}
