/**
 * Plano contratado → recursos liberados.
 *
 * Vivia privado dentro de `provisioning.ts`, e por isso `signUpBarbershop`
 * criava barbearia sem o campo `features`. O leitor do servidor
 * (`web/src/lib/tenant-server.ts`) preenchia a ausência com o catálogo
 * completo — então todo tenant self-service nascia com o plano mais caro
 * liberado. Uma fonte só, usada pelos dois caminhos de criação.
 */

export type PlanId = "entrada" | "completo";

export type Features = {
  whatsapp: boolean;
  loyalty: boolean;
  subscriptions: boolean;
  store: boolean;
  advancedFinance: boolean;
};

export function featuresFor(plan: PlanId): Features {
  const completo = plan === "completo";
  return {
    // WhatsApp entra no plano de entrada de propósito: é o que o Trinks cobra
    // como add-on e o argumento de venda mais direto contra ele.
    whatsapp: true,
    loyalty: true,
    subscriptions: completo,
    store: completo,
    advancedFinance: completo,
  };
}
