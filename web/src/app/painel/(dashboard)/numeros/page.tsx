"use client";

import { Fragment, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Flame,
  Scissors,
  UserX,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { formatBRL } from "@/lib/format";
import {
  clientRecurrence,
  type ClientRecurrenceStatus,
  hourlyHeatmap,
  monthKpis,
  noShowStats,
  PERIOD_MONTHS,
  periodFactor,
  topServices,
} from "@/lib/mock-data";

type Period = "mes" | "trimestre" | "semestre" | "ano";

const PERIOD_LABELS: Record<Period, string> = {
  mes: "Mês",
  trimestre: "Trimestre",
  semestre: "Semestre",
  ano: "Ano",
};

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// "Hoje" no mock é 31 de julho de 2026 — mês 6 (0-indexado).
const BASE_YEAR = 2026;
const BASE_MONTH = 6;

function periodLabel(period: Period, offset: number): string {
  if (period === "mes") {
    const total = BASE_YEAR * 12 + BASE_MONTH + offset;
    const year = Math.floor(total / 12);
    const month = ((total % 12) + 12) % 12;
    return `${MONTH_NAMES[month]} de ${year}`;
  }
  if (period === "trimestre") {
    const baseQuarter = Math.floor(BASE_MONTH / 3);
    const total = BASE_YEAR * 4 + baseQuarter + offset;
    const year = Math.floor(total / 4);
    const quarter = ((total % 4) + 4) % 4;
    return `${quarter + 1}º trimestre de ${year}`;
  }
  if (period === "semestre") {
    const baseSemester = Math.floor(BASE_MONTH / 6);
    const total = BASE_YEAR * 2 + baseSemester + offset;
    const year = Math.floor(total / 2);
    const semester = ((total % 2) + 2) % 2;
    return `${semester + 1}º semestre de ${year}`;
  }
  return `${BASE_YEAR + offset}`;
}

function heatColor(pct: number) {
  if (pct >= 80) return "bg-gold";
  if (pct >= 60) return "bg-gold/70";
  if (pct >= 40) return "bg-gold/40";
  return "bg-gold/15";
}

const RECURRENCE_META: Record<
  ClientRecurrenceStatus,
  { label: string; tone: "success" | "gold" | "danger" }
> = {
  em_dia: { label: "Em dia", tone: "success" },
  esfriando: { label: "Esfriando", tone: "gold" },
  sumiu: { label: "Sumiu", tone: "danger" },
};

const STATUS_PRIORITY: Record<ClientRecurrenceStatus, number> = {
  sumiu: 0,
  esfriando: 1,
  em_dia: 2,
};

function Delta({
  current,
  previous,
  invert,
}: {
  current: number;
  previous: number;
  invert?: boolean;
}) {
  const diff = current - previous;
  if (previous === 0 || Math.abs(diff) < 0.05) {
    return <span className="text-[10px] text-ivory-muted md:text-xs">— vs período anterior</span>;
  }
  const pctChange = (diff / previous) * 100;
  const isGood = invert ? diff < 0 : diff > 0;
  const Icon = diff > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium md:text-xs ${
        isGood ? "text-success" : "text-danger"
      }`}
    >
      <Icon size={10} />
      {Math.abs(pctChange).toFixed(0)}% vs período anterior
    </span>
  );
}

export default function NumerosPage() {
  const [period, setPeriod] = useState<Period>("mes");
  const [offset, setOffset] = useState(0);

  function changePeriod(p: Period) {
    setPeriod(p);
    setOffset(0);
  }

  const sortedRecurrence = [...clientRecurrence].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || b.lastVisitDaysAgo - a.lastVisitDaysAgo
  );

  /* Agrega o mock para o período escolhido. Valores acumuláveis (faturamento,
   * atendimentos) somam os meses do período; taxas (ocupação, no-show) usam a
   * média mensal, senão um trimestre teria 180% de ocupação. */
  const months = PERIOD_MONTHS[period];
  const back = Math.abs(offset);
  const factor = periodFactor(period, back);
  const prevFactor = periodFactor(period, back + 1);
  const monthlyAvg = factor / months;
  const prevMonthlyAvg = prevFactor / months;

  const clamp = (v: number, max = 100) => Math.min(Math.round(v * 10) / 10, max);

  const kpis = {
    revenue: Math.round(monthKpis.revenue * factor),
    appointments: Math.round(monthKpis.appointments * factor),
    occupancyPct: clamp(monthKpis.occupancyPct * monthlyAvg),
    noShowPct: clamp(monthKpis.noShowPct / monthlyAvg),
  };
  const prevKpis = {
    revenue: Math.round(monthKpis.revenue * prevFactor),
    appointments: Math.round(monthKpis.appointments * prevFactor),
    occupancyPct: clamp(monthKpis.occupancyPct * prevMonthlyAvg),
    noShowPct: clamp(monthKpis.noShowPct / prevMonthlyAvg),
  };
  // Ticket médio é derivado — assim nunca fica inconsistente com receita/atendimentos.
  const avgTicket = Math.round(kpis.revenue / kpis.appointments);
  const prevAvgTicket = Math.round(prevKpis.revenue / prevKpis.appointments);

  const periodServices = topServices.map((s) => ({
    ...s,
    count: Math.round(s.count * factor),
    revenue: Math.round(s.revenue * factor),
  }));

  const periodNoShow = {
    noShowCount: Math.round(noShowStats.noShowCount * factor),
    lateCancelCount: Math.round(noShowStats.lateCancelCount * factor),
    totalBookings: Math.round(noShowStats.totalBookings * factor),
  };

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-ivory-muted md:text-base">Filtros livres</p>
          <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Números</h1>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex gap-2 rounded-xl border border-border bg-surface p-1 md:w-fit">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => changePeriod(p)}
                className={
                  "flex-1 rounded-lg py-2 text-sm font-medium transition-colors md:px-5 md:py-2 " +
                  (period === p
                    ? "bg-gold text-bg"
                    : "text-ivory-muted hover:text-ivory")
                }
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-sm text-ivory-muted">
            <button
              aria-label="Período anterior"
              onClick={() => setOffset((o) => o - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-surface-raised hover:text-ivory"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-36 text-center font-medium text-ivory">
              {periodLabel(period, offset)}
            </span>
            <button
              aria-label="Próximo período"
              onClick={() => setOffset((o) => Math.min(o + 1, 0))}
              disabled={offset >= 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-surface-raised hover:text-ivory disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-4">
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[10px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Faturamento</p>
          <p className="font-display text-lg font-semibold text-gold-light md:text-2xl">
            {formatBRL(kpis.revenue)}
          </p>
          <Delta current={kpis.revenue} previous={prevKpis.revenue} />
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[10px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Atendimentos</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {kpis.appointments}
          </p>
          <Delta current={kpis.appointments} previous={prevKpis.appointments} />
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[10px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Ticket médio</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {formatBRL(avgTicket)}
          </p>
          <Delta current={avgTicket} previous={prevAvgTicket} />
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[10px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Ocupação</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {kpis.occupancyPct}%
          </p>
          <Delta current={kpis.occupancyPct} previous={prevKpis.occupancyPct} />
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[10px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Taxa de no-show</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {kpis.noShowPct}%
          </p>
          <Delta current={kpis.noShowPct} previous={prevKpis.noShowPct} invert />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-8">
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
            <Scissors size={12} /> Top serviços
          </h2>
          <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
            {periodServices.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm md:text-base">
                <div>
                  <p className="text-ivory">{s.name}</p>
                  <p className="text-xs text-ivory-muted md:text-sm">{s.count} atendimentos</p>
                </div>
                <span className="font-display font-medium text-gold-light">
                  {formatBRL(s.revenue)}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
            <UserX size={12} /> Recorrência de clientes
          </h2>
          <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
            {sortedRecurrence.map((c) => {
              const meta = RECURRENCE_META[c.status];
              return (
                <div key={c.name} className="flex items-center justify-between gap-2 text-sm md:text-base">
                  <div className="min-w-0">
                    <p className="truncate text-ivory">{c.name}</p>
                    <p className="truncate text-xs text-ivory-muted md:text-sm">
                      {c.visits} visitas · última há {c.lastVisitDaysAgo}d (costuma voltar a cada{" "}
                      {c.avgIntervalDays}d)
                    </p>
                  </div>
                  <Pill tone={meta.tone} className="shrink-0">
                    {meta.label}
                  </Pill>
                </div>
              );
            })}
          </Card>
        </section>
      </div>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
          <Flame size={12} /> Mapa de calor · dia × horário
        </h2>
        <Card className="overflow-x-auto md:p-6">
          <div
            className="grid items-center gap-1.5 md:gap-2"
            style={{
              gridTemplateColumns: `auto repeat(${hourlyHeatmap.hours.length}, minmax(2.75rem, 1fr))`,
            }}
          >
            <span />
            {hourlyHeatmap.hours.map((h) => (
              <span
                key={h}
                className="text-center text-[10px] uppercase text-ivory-muted md:text-xs"
              >
                {h}
              </span>
            ))}
            {hourlyHeatmap.days.map((day, i) => (
              <Fragment key={day}>
                <span className="text-xs text-ivory-muted md:text-sm">{day}</span>
                {hourlyHeatmap.values[i].map((basePct, j) => {
                  const pct = Math.min(Math.round(basePct * monthlyAvg), 100);
                  return (
                    <div
                      key={`${day}-${j}`}
                      className={`flex h-9 items-center justify-center rounded-lg text-xs font-medium text-bg transition-colors md:h-12 md:text-sm ${heatColor(pct)}`}
                    >
                      {pct}%
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-ivory-muted">
            Mais dourado = horário mais cheio. Os claros são as brechas pra
            promover.
          </p>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
          Insights automáticos
        </h2>
        <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-4">
          <Card className="flex flex-col gap-1 md:gap-2 md:p-6">
            <p className="text-sm text-ivory md:text-base">
              Sexta e sábado à tarde são o horário nobre — 90%+ de ocupação.
            </p>
            <p className="text-xs text-ivory-muted md:text-sm">
              Considere abrir mais horários nesses blocos.
            </p>
          </Card>
          <Card className="flex flex-col gap-1 md:gap-2 md:p-6">
            <p className="text-sm text-ivory md:text-base">
              No-show {kpis.noShowPct <= prevKpis.noShowPct ? "caiu" : "subiu"} de{" "}
              {prevKpis.noShowPct}% para {kpis.noShowPct}% — {periodNoShow.noShowCount} faltas
              e {periodNoShow.lateCancelCount} cancelamentos tardios em{" "}
              {periodNoShow.totalBookings} agendamentos.
            </p>
            <p className="text-xs text-ivory-muted md:text-sm">
              A confirmação por WhatsApp no dia continua sendo o maior fator de
              redução.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
