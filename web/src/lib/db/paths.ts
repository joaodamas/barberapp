/**
 * Caminhos do Firestore — a única forma de endereçar dados.
 *
 * TODO acesso passa por aqui, e toda função exige `barbershopId`. É o que
 * torna impossível escrever, por descuido, um caminho sem barbearia: não
 * existe um `"expenses"` solto no código para alguém copiar.
 *
 * A defesa real é a Security Rule (provada em `functions/src/__tests__`),
 * mas uma query sem tenant falharia em tempo de execução para o usuário. Aqui
 * ela nem chega a ser escrita.
 */

export const COLLECTIONS = {
  barbershops: "barbershops",
  slugs: "slugs",
  users: "users",
} as const;

/** Subcoleções de uma barbearia. */
export const SHOP_COLLECTIONS = {
  members: "members",
  staff: "staff",
  services: "services",
  plans: "plans",
  products: "products",
  /** G3 — o cliente da barbearia. Escrito só pelo servidor. */
  clients: "clients",
  bookings: "bookings",
  schedules: "schedules",
  expenses: "expenses",
  cashEntries: "cash_entries",
  commissions: "commissions",
  inventoryMovements: "inventory_movements",
  payments: "payments",
  refunds: "refunds",
  subscriptions: "subscriptions",
  subscriptionInvoices: "subscription_invoices",
  loyaltyTransactions: "loyalty_transactions",
  clientOccurrences: "client_occurrences",
  whatsappMessages: "whatsapp_messages",
  auditLog: "audit_log",
} as const;

export type ShopCollection = keyof typeof SHOP_COLLECTIONS;

/** `barbershops/{id}` */
export function shopPath(barbershopId: string) {
  assertId(barbershopId, "barbershopId");
  return `${COLLECTIONS.barbershops}/${barbershopId}`;
}

/** `barbershops/{id}/{colecao}` */
export function shopCollectionPath(barbershopId: string, collection: ShopCollection) {
  return `${shopPath(barbershopId)}/${SHOP_COLLECTIONS[collection]}`;
}

/** `barbershops/{id}/{colecao}/{docId}` */
export function shopDocPath(
  barbershopId: string,
  collection: ShopCollection,
  docId: string
) {
  assertId(docId, "docId");
  return `${shopCollectionPath(barbershopId, collection)}/${docId}`;
}

/** `slugs/{slug}` — índice público que resolve o subdomínio. */
export function slugPath(slug: string) {
  assertId(slug, "slug");
  return `${COLLECTIONS.slugs}/${slug}`;
}

/** `users/{uid}` — conta global do cliente. */
export function userPath(userId: string) {
  assertId(userId, "userId");
  return `${COLLECTIONS.users}/${userId}`;
}

/**
 * Um id vazio produz caminho com número ímpar de segmentos, e o Firestore
 * aceita silenciosamente como referência de coleção — o erro aparece longe
 * daqui, como "documento não encontrado".
 */
function assertId(value: string, name: string) {
  if (!value || value.includes("/")) {
    throw new Error(`Firestore: ${name} inválido (${JSON.stringify(value)}).`);
  }
}
