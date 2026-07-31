"use client";

import { Calendar, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { dailyCashHistory } from "@/lib/mock-data";

const DOW_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function weekday(date: string) {
  return DOW_NAMES[new Date(`${date}T00:00:00`).getDay()];
}

function dayNumber(date: string) {
  return date.split("-")[2];
}

export default function FluxoCaixaPage() {
  const total = dailyCashHistory.reduce((s, d) => s + d.total, 0);
  const avgPerDay = total / dailyCashHistory.length;
  const bestDay = dailyCashHistory.reduce((best, d) => (d.total > best.total ? d : best));
  const totalAppointments = dailyCashHistory.reduce((s, d) => s + d.appointments, 0);
  const maxTotal = Math.max(...dailyCashHistory.map((d) => d.total), 1);

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <div>
        <p className="text-sm text-ivory-muted md:text-base">Histórico diário</p>
        <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">Fluxo de Caixa</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Wallet size={12} className="text-gold-light" />
            <p className="text-[10px] uppercase tracking-wide text-ivory-muted md:text-xs">Total no mês</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{formatBRL(total)}</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={12} className="text-gold-light" />
            <p className="text-[10px] uppercase tracking-wide text-ivory-muted md:text-xs">Média diária</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{formatBRL(avgPerDay)}</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Calendar size={12} className="text-gold-light" />
            <p className="text-[10px] uppercase tracking-wide text-ivory-muted md:text-xs">Melhor dia</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{formatBRL(bestDay.total)}</p>
          <p className="text-[10px] text-ivory-muted md:text-xs">
            {weekday(bestDay.date)} dia {dayNumber(bestDay.date)}
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Calendar size={12} className="text-gold-light" />
            <p className="text-[10px] uppercase tracking-wide text-ivory-muted md:text-xs">Atendimentos</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{totalAppointments}</p>
          <p className="text-[10px] text-ivory-muted md:text-xs">{dailyCashHistory.length} dias trabalhados</p>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
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
                  {weekday(d.date)} {dayNumber(d.date)}
                </td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{d.appointments}</td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">
                  {formatBRL(d.total / d.appointments)}
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
                      style={{ width: `${(d.total / maxTotal) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
