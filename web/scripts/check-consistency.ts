/**
 * Confere que os números do dataset fecham entre si.
 * Uso: npx tsx scripts/check-consistency.ts
 */
import {
  dailyCashHistory, mrr, cashRevenueThisMonth, grossRevenueThisMonth,
  monthKpis, cashProjection, subscribers, fixedExpensesTotal,
  variableOperatingExpensesTotal,
} from "../src/lib/mock-data";
import { computeDre } from "../src/lib/dre";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const r = computeDre();
const caixa = dailyCashHistory.reduce((s, d) => s + d.total, 0);
const atend = dailyCashHistory.reduce((s, d) => s + d.appointments, 0);

const checks: Array<[string, boolean, string]> = [
  ["caixa + mensalistas = receita bruta", caixa + mrr.billed === grossRevenueThisMonth,
   `${brl(caixa)} + ${brl(mrr.billed)} = ${brl(caixa + mrr.billed)} vs ${brl(grossRevenueThisMonth)}`],
  ["caixa diário = cashRevenueThisMonth", caixa === cashRevenueThisMonth,
   `${brl(caixa)} vs ${brl(cashRevenueThisMonth)}`],
  ["atendimentos do caixa = monthKpis", atend === monthKpis.appointments,
   `${atend} vs ${monthKpis.appointments}`],
  ["MRR cobrável ≤ contratado", mrr.billed <= mrr.contracted,
   `${brl(mrr.billed)} ≤ ${brl(mrr.contracted)}`],
];

console.log("Receita bruta           :", brl(grossRevenueThisMonth));
console.log("  caixa dia a dia       :", brl(caixa), `(${dailyCashHistory.length} dias)`);
console.log("  mensalistas (MRR)     :", brl(mrr.billed),
            `(${subscribers.filter((s) => s.status === "ativo").length} ativos)`);
console.log("Custo variável          :", brl(r.variableCost),
            `(CMV ${brl(r.cmv)} + gateway ${brl(r.gatewayFees)} + comissão ${brl(r.commissions)})`);
console.log("Margem de contribuição  :", brl(r.contributionMargin), `(${r.contributionMarginPct.toFixed(1)}%)`);
console.log("Despesa fixa            :", brl(fixedExpensesTotal));
console.log("Despesa eventual        :", brl(variableOperatingExpensesTotal));
console.log("Resultado antes imposto :", brl(r.resultBeforeTax));
console.log("Imposto                 :", brl(r.tax));
console.log("RESULTADO DO MÊS        :", brl(r.result), `(margem ${r.marginPct.toFixed(1)}%)`);
console.log("Ponto de equilíbrio     : dia", r.breakEvenDay);
console.log("Projeção 30d (agosto)   :", brl(cashProjection.at(-1)!.cumulative));
console.log("Ponto mais apertado     :", brl(Math.min(...cashProjection.map((d) => d.cumulative))));
console.log("");

let failed = 0;
for (const [label, ok, detail] of checks) {
  console.log(ok ? "✓" : "✗", label, "—", detail);
  if (!ok) failed++;
}
process.exit(failed > 0 ? 1 : 0);
