import { describe, expect, it } from "vitest";
import { computeDre } from "@/lib/dre";
import {
  cashRevenueThisMonth,
  dailyCashHistory,
  fixedExpensesTotal,
  grossRevenueThisMonth,
  monthExpenses,
  monthKpis,
  mrr,
  variableOperatingExpensesTotal,
} from "@/lib/mock-data";

describe("coerência da base financeira", () => {
  it("caixa do balcão + mensalistas = receita bruta", () => {
    const caixa = dailyCashHistory.reduce((s, d) => s + d.total, 0);
    expect(caixa + mrr.billed).toBe(grossRevenueThisMonth);
  });

  it("o histórico diário fecha com a receita de balcão", () => {
    const caixa = dailyCashHistory.reduce((s, d) => s + d.total, 0);
    expect(caixa).toBe(cashRevenueThisMonth);
  });

  it("atendimentos do caixa batem com o KPI do mês", () => {
    const atendimentos = dailyCashHistory.reduce((s, d) => s + d.appointments, 0);
    expect(atendimentos).toBe(monthKpis.appointments);
  });

  it("MRR cobrável nunca passa do contratado", () => {
    expect(mrr.billed).toBeLessThanOrEqual(mrr.contracted);
  });

  it("despesa fixa + eventual = total lançado", () => {
    const total = monthExpenses.reduce((s, e) => s + e.value, 0);
    expect(fixedExpensesTotal + variableOperatingExpensesTotal).toBe(total);
  });

  it("só despesa recorrente entra como custo fixo", () => {
    const recorrentes = monthExpenses
      .filter((e) => e.recurring)
      .reduce((s, e) => s + e.value, 0);
    expect(fixedExpensesTotal).toBe(recorrentes);
    expect(fixedExpensesTotal).toBeLessThan(
      monthExpenses.reduce((s, e) => s + e.value, 0)
    );
  });
});

describe("cálculo do resultado", () => {
  const r = computeDre();

  it("margem de contribuição = receita − custo variável", () => {
    expect(r.contributionMargin).toBe(r.grossRevenue - r.variableCost);
  });

  it("resultado = margem − custo fixo − imposto", () => {
    expect(r.result).toBe(r.contributionMargin - r.fixedCost - r.tax);
  });

  it("o DRE tem linha de imposto quando há lucro", () => {
    expect(r.resultBeforeTax).toBeGreaterThan(0);
    expect(r.tax).toBeGreaterThan(0);
  });

  it("não cobra imposto sobre prejuízo", () => {
    const prejuizo = computeDre({ revenueFactor: 0.1 });
    expect(prejuizo.resultBeforeTax).toBeLessThan(0);
    expect(prejuizo.tax).toBe(0);
  });

  it("o ponto de equilíbrio é calculado, não fixo", () => {
    const bom = computeDre({ revenueFactor: 1 }).breakEvenDay;
    const ruim = computeDre({ revenueFactor: 0.5 }).breakEvenDay;
    expect(bom).not.toBe(ruim);
  });

  it("custo fixo não escala com a receita", () => {
    expect(computeDre({ revenueFactor: 2 }).fixedCost).toBe(computeDre().fixedCost);
  });

  it("receita zero não gera NaN", () => {
    const zero = computeDre({ revenueFactor: 0 });
    expect(Number.isFinite(zero.marginPct)).toBe(true);
    expect(Number.isFinite(zero.contributionMarginPct)).toBe(true);
  });
});
