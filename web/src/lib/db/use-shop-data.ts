"use client";

import { useShopCollection } from "@/lib/db/use-collection";
import { saldoDeFidelidade } from "@/lib/domain";
import { useTenant } from "@/lib/tenant-context";
import type {
  BookingDoc, ClientDoc, CommissionDoc, ExpenseDoc, InventoryMovementDoc,
  LoyaltyTransactionDoc, PaymentDoc, PlanDoc, ProductDoc, RefundDoc, ServiceDoc,
  SubscriptionInvoiceDoc,
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

/**
 * Estornos — D22 / D23. Escritos só pelo servidor.
 *
 * Coleção separada de propósito: o estorno **não** é um pagamento negativo em
 * `payments`. Se fosse, toda leitura que soma pagamentos teria de aprender a
 * filtrar, e a que esquecesse contaria devolução como receita.
 */
export const useRefunds = () =>
  useShopCollection<RefundDoc>("refunds", {
    orderByField: "date",
    direction: "desc",
  });

export const usePlans = () => useShopCollection<PlanDoc>("plans", { orderByField: "price" });

export const useProducts = () =>
  useShopCollection<ProductDoc>("products", { orderByField: "name" });

export const useBookings = () =>
  useShopCollection<BookingDoc>("bookings", { orderByField: "date", direction: "desc" });

/**
 * A carteira de clientes da barbearia — G3.
 *
 * Só quem toca a loja lê a coleção inteira; o cliente lê apenas o próprio
 * cadastro. As regras garantem isso, e a suíte de isolamento tenta violar as
 * duas portas (ler o de outro, listar a coleção).
 *
 * Escrita é sempre do servidor: o cadastro nasce dentro da transação que grava
 * a reserva, para não existir cliente sem atendimento nem reserva apontando
 * para cadastro inexistente.
 */
export const useClients = () =>
  useShopCollection<ClientDoc>("clients", { orderByField: "name" });

export const useExpenses = () =>
  useShopCollection<ExpenseDoc>("expenses", { orderByField: "date", direction: "desc" });

export const useSubscribers = () =>
  useShopCollection<SubscriberDoc>("subscriptions", { orderByField: "name" });

/**
 * As faturas de mensalidade — G2.
 *
 * É o lastro que faltava: antes, "receita de mensalista" saía de um status
 * marcado como `ativo`. Escritas só pelo servidor.
 */
export const useSubscriptionInvoices = () =>
  useShopCollection<SubscriptionInvoiceDoc>("subscriptionInvoices", {
    orderByField: "dueDate",
    direction: "desc",
  });

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
