import { dre } from "@/lib/mock-data";
import { safeDiv } from "@/lib/format";

/**
 * Cálculo do resultado do mês — fonte única.
 *
 * Financeiro e DRE calculavam o resultado cada um do seu jeito, com a mesma
 * conta escrita duas vezes. Agora as duas telas chamam esta função: se
 * divergirem, é bug de exibição, não de cálculo.
 *
 * Estrutura (PRD §11):
 *   Receita Bruta
 *   (−) CMV                          ┐
 *   (−) Taxas de gateway             ├ custo variável: escala com a receita
 *   (−) Comissões                    ┘
 *   (=) Margem de Contribuição
 *   (−) Despesas Fixas               → recorrentes; NÃO escalam
 *   (−) Despesas Operacionais Eventuais
 *   (−) Folha
 *   (=) Resultado antes de impostos
 *   (−) Impostos (Simples sobre o resultado)
 *   (=) Resultado do Mês
 */
export type DreResult = ReturnType<typeof computeDre>;

export function computeDre({
  revenueFactor = 1,
  payroll = 0,
}: { revenueFactor?: number; payroll?: number } = {}) {
  const scale = (value: number) => Math.round(value * revenueFactor);

  const grossRevenue = scale(dre.grossRevenue);

  const cmv = scale(dre.cmv);
  const gatewayFees = scale(dre.gatewayFees);
  const commissions = scale(dre.commissions);
  const variableCost = cmv + gatewayFees + commissions;

  const contributionMargin = grossRevenue - variableCost;
  const contributionMarginPct = safeDiv(contributionMargin, grossRevenue) * 100;

  // Despesa fixa não acompanha a receita — é justamente o que define o ponto
  // de equilíbrio. A eventual também não escala: é evento, não proporção.
  const fixedExpenses = dre.fixedExpenses;
  const variableOperatingExpenses = dre.variableOperatingExpenses;
  const fixedCost = fixedExpenses + variableOperatingExpenses + payroll;

  const resultBeforeTax = contributionMargin - fixedCost;
  // Imposto só incide sobre resultado positivo.
  const tax = resultBeforeTax > 0 ? Math.round((resultBeforeTax * dre.taxRatePct) / 100) : 0;
  const result = resultBeforeTax - tax;

  const totalCost = variableCost + fixedCost + tax;
  const marginPct = safeDiv(result, grossRevenue) * 100;

  /** Em que dia do mês a receita acumulada cobre o custo total. */
  const breakEvenDay = breakEvenDayFor(grossRevenue, totalCost);

  return {
    grossRevenue,
    cmv,
    gatewayFees,
    commissions,
    variableCost,
    contributionMargin,
    contributionMarginPct,
    fixedExpenses,
    variableOperatingExpenses,
    payroll,
    fixedCost,
    resultBeforeTax,
    tax,
    result,
    totalCost,
    marginPct,
    breakEvenDay,
  };
}

const DAYS_IN_MONTH = 31;

/**
 * Ponto de equilíbrio calculado, não literal.
 * `breakEven = { day: 14 }` estava fixo no mock e não reagia a nada — o painel
 * exibia "atingido no dia 14" mesmo com o resultado negativo.
 */
function breakEvenDayFor(grossRevenue: number, totalCost: number) {
  if (grossRevenue <= 0) return null;
  const dailyRevenue = grossRevenue / DAYS_IN_MONTH;
  const day = Math.ceil(safeDiv(totalCost, dailyRevenue));
  return day > 0 && day <= DAYS_IN_MONTH ? day : null;
}

export const DRE_DAYS_IN_MONTH = DAYS_IN_MONTH;
