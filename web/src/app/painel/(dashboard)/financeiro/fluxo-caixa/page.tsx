"use client";

import { Calendar, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi-tile";
import { formatBRL, formatWeekdayAndDay, safeDiv, safePct } from "@/lib/format";
import { useFinanceiro, mesAtual, rotuloDoMes } from "@/lib/db/use-financeiro";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { BarChart } from "@/components/ui/chart";
import { Voltar } from "@/components/ui/voltar";
import { BloqueioPlano } from "@/components/ui/bloqueio-plano";
import { useAcesso } from "@/lib/tenant-context";

export default function FluxoCaixaPage() {
  const mes = mesAtual();
  const { caixa: dailyCashHistory, status } = useFinanceiro(mes);
  const total = dailyCashHistory.reduce((s, d) => s + d.total, 0);
  const avgPerDay = safeDiv(total, dailyCashHistory.length);
  const bestDay = dailyCashHistory.reduce(
    (best, d) => (d.total > best.total ? d : best),
    dailyCashHistory[0]
  );
  const totalAppointments = dailyCashHistory.reduce((s, d) => s + d.appointments, 0);
  const maxTotal = Math.max(...dailyCashHistory.map((d) => d.total), 1);
  const totals = dailyCashHistory.reduce(
    (acc, d) => ({
      pix: acc.pix + d.pix,
      cartao: acc.cartao + d.cartao,
      dinheiro: acc.dinheiro + d.dinheiro,
    }),
    { pix: 0, cartao: 0, dinheiro: 0 }
  );

  /* O financeiro avançado é o que separa o plano Gestão dos outros.
   * A saída fica DEPOIS dos hooks: React não aceita hook condicional, e
   * a tela precisa dos mesmos dados para o caso liberado. */
  const acesso = useAcesso();
  if (!acesso.features.advancedFinance) {
    return <BloqueioPlano titulo="Fluxo de caixa" descricao="Quanto entrou por dia e por meio de pagamento, com o formato do mês em um gráfico." />;
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <Voltar />

      <div>
        {/* A tela não dizia de que mês eram os números. */}
        <p className="text-sm text-ivory-muted md:text-base">
          Histórico diário · {rotuloDoMes(mes)}
        </p>
        <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">Fluxo de Caixa</h1>
        <p className="mt-1 text-xs text-ivory-muted md:text-sm">
          Só o que entra pelo balcão. Mensalidades são cobradas por assinatura e
          aparecem no Financeiro.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        <KpiTile icon={Wallet} label="Total no mês" value={formatBRL(total)} />
        <KpiTile icon={TrendingUp} label="Média diária" value={formatBRL(avgPerDay)} />
        <KpiTile
          icon={Calendar}
          label="Melhor dia"
          value={formatBRL(bestDay?.total ?? 0)}
          caption={bestDay ? formatWeekdayAndDay(bestDay.date) : undefined}
        />
        <KpiTile
          icon={Calendar}
          label="Atendimentos"
          value={String(totalAppointments)}
          caption={`${dailyCashHistory.length} dias trabalhados`}
        />
      </div>

      {status === "carregando" && <LoadingRows rows={4} />}
      {status === "pronto" && dailyCashHistory.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="Nenhum movimento neste mês"
          description="Cada atendimento marcado como concluído na tela Hoje entra aqui automaticamente, separado por meio de pagamento."
          actionLabel="Ir para Hoje"
          actionHref="/painel"
        />
      )}
      {dailyCashHistory.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-ivory">Entrada por dia</p>
            <p className="font-display text-lg text-ivory">{formatBRL(total)}</p>
          </div>
          {/* Trinta linhas de tabela não mostram o formato do mês: onde estão os
              picos, quais dias morreram. Uma barra por dia mostra. */}
          <BarChart
            label={`Entrada de caixa por dia em ${rotuloDoMes(mes)}.`}
            data={dailyCashHistory.map((d) => ({
              label: formatWeekdayAndDay(d.date),
              value: d.total,
            }))}
          />
        </Card>
      )}

      {dailyCashHistory.length > 0 && (
      <Card className="table-scroll overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ivory-muted">
              <th className="px-4 py-3 font-medium md:px-6">Dia</th>
              <th className="px-4 py-3 text-right font-medium">Atendimentos</th>
              <th className="px-4 py-3 text-right font-medium">Ticket médio</th>
              <th className="px-4 py-3 text-right font-medium">Pix</th>
              <th className="px-4 py-3 text-right font-medium">Cartão</th>
              <th className="px-4 py-3 text-right font-medium">Dinheiro</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium md:px-6">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {dailyCashHistory.map((d) => (
              <tr
                key={d.date}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-ivory md:px-6">
                  {formatWeekdayAndDay(d.date)}
                </td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{d.appointments}</td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">
                  {formatBRL(safeDiv(d.total, d.appointments))}
                </td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{formatBRL(d.pix)}</td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{formatBRL(d.cartao)}</td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{formatBRL(d.dinheiro)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-ivory">
                  {formatBRL(d.total)}
                </td>
                <td className="px-4 py-2.5 md:px-6">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${safePct(d.total, maxTotal)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-medium">
              <td className="px-4 py-3 text-xs uppercase tracking-wide text-ivory-muted md:px-6">
                Total
              </td>
              <td className="px-4 py-3 text-right text-ivory">{totalAppointments}</td>
              <td className="px-4 py-3 text-right text-ivory">
                {formatBRL(safeDiv(total, totalAppointments))}
              </td>
              <td className="px-4 py-3 text-right text-ivory">{formatBRL(totals.pix)}</td>
              <td className="px-4 py-3 text-right text-ivory">{formatBRL(totals.cartao)}</td>
              <td className="px-4 py-3 text-right text-ivory">{formatBRL(totals.dinheiro)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-display font-semibold text-ivory">
                {formatBRL(total)}
              </td>
              <td className="md:px-6" />
            </tr>
          </tfoot>
        </table>
      </Card>
      )}
    </div>
  );
}
