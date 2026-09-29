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
 * A matriz e o preço de cada plano estão em `docs/COBRANCA-E-ENTRADA.md`, e a
 * tabela de preço e teto de barbeiros está no fim deste arquivo.
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

/* ------------------------------------------------------------------ Preço */

/**
 * Preço e teto de equipe de cada plano — tabela aprovada pelo dono em 29/09.
 *
 * `tetoDeBarbeiros` conta barbeiro **ativo** (o que aparece na agenda), não
 * cadastrado: o desativado não atende, não ocupa cadeira e não entra na conta.
 * Acima do teto a barbearia não é bloqueada — cada barbeiro a mais custa
 * `barbeiroExtra` por mês. Bloquear tiraria a agenda de quem acabou de
 * contratar; o dono decide, e quem cobra o excedente é o Hub.
 *
 * Valores em reais inteiros. A cobrança (boleto Inter/Asaas) mora no Hub; aqui
 * fica só a tabela que as telas e a landing mostram, para ninguém cravar
 * número em componente. Espelha `PRECOS_POR_PLANO` em `web/src/lib/tenant.ts`
 * — o teste de paridade de lá lê este arquivo.
 */
export type PrecoDoPlano = {
  /** Mensalidade do plano, em R$. */
  mensal: number;
  /** Quantos barbeiros ativos a mensalidade cobre. */
  tetoDeBarbeiros: number;
  /** R$ por mês de cada barbeiro ativo acima do teto. */
  barbeiroExtra: number;
};

export const PRECOS_POR_PLANO: Record<PlanId, PrecoDoPlano> = {
  agenda: { mensal: 97, tetoDeBarbeiros: 3, barbeiroExtra: 19 },
  crescimento: { mensal: 197, tetoDeBarbeiros: 6, barbeiroExtra: 19 },
  // Era R$ 297 até 29/09.
  gestao: { mensal: 247, tetoDeBarbeiros: 10, barbeiroExtra: 19 },
};

/**
 * Barbearias fundadoras: 30% de desconto vitalício nas 20 primeiras.
 *
 * Só registro. Quem aplica o desconto é o Hub, na cobrança; nenhuma conta
 * daqui o desconta, para a tela nunca afirmar um valor que o boleto não diz.
 */
export const DESCONTO_FUNDADOR = { percentual: 30, vagas: 20 } as const;

export function precoDoPlano(plan: PlanId): PrecoDoPlano {
  return PRECOS_POR_PLANO[plan];
}

/** Barbeiros ativos acima do teto do plano — nunca negativo. */
export function barbeirosExtras(plan: PlanId, ativos: number): number {
  const n = Number.isFinite(ativos) ? Math.floor(ativos) : 0;
  return Math.max(n - PRECOS_POR_PLANO[plan].tetoDeBarbeiros, 0);
}

/** Mensalidade com os extras, sem desconto de fundador. */
export function valorMensal(plan: PlanId, ativos: number): number {
  const p = PRECOS_POR_PLANO[plan];
  return p.mensal + barbeirosExtras(plan, ativos) * p.barbeiroExtra;
}
