/**
 * Plano contratado → recursos liberados.
 *
 * Vivia privado dentro de `provisioning.ts`, e por isso `signUpBarbershop`
 * criava barbearia sem o campo `features`. O leitor do servidor
 * (`web/src/lib/tenant-server.ts`) preenchia a ausência com o catálogo
 * completo — então todo tenant self-service nascia com o plano mais caro
 * liberado. Uma fonte só, usada pelos dois caminhos de criação.
 *
 * Espelha `web/src/lib/tenant.ts`. Os dois lados precisam concordar: o backend
 * grava `features` na criação, o frontend resolve na leitura, e uma divergência
 * aqui vira barbearia pagando por um recurso que a tela não mostra.
 *
 * A matriz e o preço de cada plano estão em `docs/COBRANCA-E-ENTRADA.md`.
 */

export type PlanId = "agenda" | "crescimento" | "gestao";

/** O que uma barbearia sem plano conhecido recebe: o mínimo, nunca o máximo. */
export const PLANO_DE_ENTRADA: PlanId = "agenda";

export type Features = {
  whatsapp: boolean;
  loyalty: boolean;
  subscriptions: boolean;
  store: boolean;
  advancedFinance: boolean;
};

const POR_PLANO: Record<PlanId, Features> = {
  agenda: {
    // WhatsApp entra já no plano de entrada de propósito: é o que o Trinks
    // cobra como add-on e o argumento de venda mais direto contra ele.
    whatsapp: true,
    loyalty: false,
    subscriptions: false,
    store: false,
    advancedFinance: false,
  },
  crescimento: {
    whatsapp: true,
    loyalty: true,
    subscriptions: true,
    store: true,
    advancedFinance: false,
  },
  gestao: {
    whatsapp: true,
    loyalty: true,
    subscriptions: true,
    store: true,
    advancedFinance: true,
  },
};

export function featuresFor(plan: PlanId): Features {
  return POR_PLANO[plan];
}

/**
 * Aceita o que veio de fora e devolve um plano que existe.
 *
 * `entrada` e `completo` são a linha de dois níveis que valeu entre 11/08 e a
 * volta para três. Traduzidos em vez de rebaixados: rebaixar tiraria da
 * barbearia algo que ela contratou.
 */
export function toPlanId(raw: unknown): PlanId {
  if (typeof raw !== "string") return PLANO_DE_ENTRADA;
  if (raw in POR_PLANO) return raw as PlanId;
  if (raw === "entrada") return "agenda";
  if (raw === "completo") return "gestao";
  return PLANO_DE_ENTRADA;
}
