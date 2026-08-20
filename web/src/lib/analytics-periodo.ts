/**
 * O recorte de período — extraído de `analytics.ts` na Rodada 3.2.
 *
 * Mora aqui, e não lá, para `fontes-financeiras.ts` poder usá-lo sem ciclo de
 * import: `analytics.ts` consome as fontes, e as fontes precisam do período.
 * É a única razão da extração — nada mais mudou.
 */

export type Periodo = { inicio: string; fim: string };

/** Primeiro e último dia de um mês `YYYY-MM`. */
export function mesPeriodo(mes: string): Periodo {
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(ano, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export function dentroDoPeriodo(data: string, periodo: Periodo) {
  return data >= periodo.inicio && data <= periodo.fim;
}
