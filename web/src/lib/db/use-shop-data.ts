"use client";

import { useShopCollection } from "@/lib/db/use-collection";
import type {
  BookingDoc, ExpenseDoc, InventoryMovementDoc, PlanDoc,
  ProductDoc, ServiceDoc, SubscriberDoc,
} from "@/lib/domain";

/**
 * Atalhos tipados por coleção.
 *
 * Cada tela declara o que precisa e recebe `{ items, status }` — o
 * `barbershopId` vem do tenant, nunca da tela.
 */
export const useServices = () =>
  useShopCollection<ServiceDoc>("services", { orderByField: "price" });

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

/** Combina os estados de várias coleções numa só resposta. */
export function combineStatus(
  ...estados: Array<{ status: "carregando" | "pronto" | "erro" }>
) {
  if (estados.some((e) => e.status === "erro")) return "erro" as const;
  if (estados.some((e) => e.status === "carregando")) return "carregando" as const;
  return "pronto" as const;
}
