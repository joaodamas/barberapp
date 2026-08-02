"use client";

import { AlertTriangle, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { KpiTile, signTone } from "@/components/ui/kpi-tile";
import { formatBRL, formatDateShortPtBR, formatWeekdayAndDay } from "@/lib/format";
import { cashProjection } from "@/lib/mock-data";

export default function ProjecaoPage() {
  const openDays = cashProjection.filter((d) => !d.isClosed);

  const confirmedRevenue = openDays
    .filter((d) => !d.isEstimate)
    .reduce((s, d) => s + d.bookingRevenue, 0);
  const subscriptionTotal = cashProjection.reduce((s, d) => s + d.subscriptionCharge, 0);
  const receitaConfirmada = confirmedRevenue + subscriptionTotal;
  const despesasFixas = cashProjection.reduce((s, d) => s + d.fixedExpense, 0);
  const resultadoProjetado = cashProjection.at(-1)?.cumulative ?? 0;

  // `reduce` sem valor inicial lança TypeError em array vazio.
  const tightestDay = cashProjection.reduce(
    (min, d) => (d.cumulative < min.cumulative ? d : min),
    cashProjection[0]
  );

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <div>
        <p className="text-sm text-ivory-muted md:text-base">Próximos 30 dias</p>
        <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">Projeção de Caixa</h1>
        <p className="mt-1 text-xs text-ivory-muted md:text-sm">
          Combina marcações já confirmadas, cobrança de mensalistas (data real)
          e despesas fixas recorrentes (dia real). Dias sem marcação ainda
          usam a média histórica daquele dia da semana — marcados como
          &quot;estimado&quot;.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        <KpiTile
          tone="neutral"
          icon={Wallet}
          label="Receita já confirmada"
          value={formatBRL(receitaConfirmada)}
          caption="marcações + mensalistas"
        />
        <KpiTile
          tone="danger"
          icon={TrendingDown}
          label="Despesas fixas previstas"
          value={formatBRL(despesasFixas)}
        />
        <KpiTile
          tone={signTone(resultadoProjetado)}
          icon={TrendingUp}
          label="Resultado projetado"
          value={formatBRL(resultadoProjetado)}
          caption="acumulado nos 30 dias"
        />
        <KpiTile
          tone={signTone(tightestDay.cumulative)}
          icon={AlertTriangle}
          label="Ponto mais apertado"
          value={formatBRL(tightestDay.cumulative)}
          caption={formatDateShortPtBR(tightestDay.date)}
        />
      </div>

      <Card className="table-scroll overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ivory-muted">
              <th className="px-4 py-3 font-medium md:px-6">Dia</th>
              <th className="px-4 py-3 font-medium">Receita</th>
              <th className="px-4 py-3 text-right font-medium">Mensalista</th>
              <th className="px-4 py-3 text-right font-medium">Despesa fixa</th>
              <th className="px-4 py-3 text-right font-medium">Líquido do dia</th>
              <th className="px-4 py-3 text-right font-medium md:px-6">Saldo acumulado</th>
            </tr>
          </thead>
          <tbody>
            {cashProjection.map((d) => (
              <tr
                key={d.date}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-ivory md:px-6">
                  {formatWeekdayAndDay(d.date)}
                </td>
                <td className="px-4 py-2.5">
                  {d.isClosed ? (
                    <span className="text-ivory-muted">fechado</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="text-ivory-muted">{formatBRL(d.bookingRevenue)}</span>
                      <Pill tone={d.isEstimate ? "gold" : "success"}>
                        {d.isEstimate ? "estimado" : "confirmado"}
                      </Pill>
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">
                  {d.subscriptionCharge > 0 ? formatBRL(d.subscriptionCharge) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-danger">
                  {d.fixedExpense > 0 ? `− ${formatBRL(d.fixedExpense)}` : "—"}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${
                    signTone(d.net) === "success" ? "text-success" : "text-danger"
                  }`}
                >
                  {formatBRL(d.net)}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold md:px-6 ${
                    signTone(d.cumulative) === "success" ? "text-success" : "text-danger"
                  }`}
                >
                  {formatBRL(d.cumulative)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
