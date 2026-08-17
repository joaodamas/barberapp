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
import { useFinanceiro, mesAtual, rotuloDoMes } from "@/lib/db/use-financeiro";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import type { StatusRecorrencia as ClientRecurrenceStatus } from "@/lib/analytics";

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
    return <span className="text-[11px] text-ivory-muted md:text-xs">— vs período anterior</span>;
  }
  const pctChange = (diff / previous) * 100;
  const isGood = invert ? diff < 0 : diff > 0;
  const Icon = diff > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium md:text-xs ${
        isGood ? "text-success" : "text-danger"
      }`}
    >
      <Icon size={10} />
      {Math.abs(pctChange).toFixed(0)}% vs período anterior
    </span>
  );
}

export default function NumerosPage() {
  const [offset, setOffset] = useState(0);

  const mes = mesAtual(Math.abs(offset));
  const mesAnterior = mesAtual(Math.abs(offset) + 1);
  const atual = useFinanceiro(mes);
  const anterior = useFinanceiro(mesAnterior);

  const kpis = atual.kpis;
  const prevKpis = anterior.kpis;
  const avgTicket = kpis.avgTicket;
  const prevAvgTicket = prevKpis.avgTicket;
  const periodServices = atual.tops;
  const periodNoShow = kpis;
  const hourlyHeatmap = atual.heatmap;
  const sortedRecurrence = [...atual.recorrencia].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || b.lastVisitDaysAgo - a.lastVisitDaysAgo
  );

  const heatCells = hourlyHeatmap.days.flatMap((day, i) =>
    hourlyHeatmap.values[i].map((pct, j) => ({ day, hour: hourlyHeatmap.hours[j], pct }))
  );
  const peak = heatCells.reduce((a, b) => (b.pct > a.pct ? b : a), heatCells[0] ?? { day: "", hour: "", pct: 0 });
  const idle = heatCells.reduce((a, b) => (b.pct < a.pct ? b : a), heatCells[0] ?? { day: "", hour: "", pct: 0 });

  const semDados = atual.status === "pronto" && kpis.totalBookings === 0;

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-ivory-muted md:text-base">Seu mês</p>
          <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Números</h1>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex items-center gap-1 text-sm text-ivory-muted">
            <button
              aria-label="Mês anterior"
              disabled={Math.abs(offset) >= 11}
              onClick={() => setOffset((o) => Math.max(o - 1, -11))}
              className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-lg transition-colors hover:bg-surface-raised hover:text-ivory disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-36 text-center font-medium text-ivory">
              {rotuloDoMes(mes)}
            </span>
            <button
              aria-label="Próximo mês"
              onClick={() => setOffset((o) => Math.min(o + 1, 0))}
              disabled={offset >= 0}
              className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-lg transition-colors hover:bg-surface-raised hover:text-ivory disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {atual.status === "carregando" && <LoadingRows rows={5} />}
      {atual.status === "erro" && <ErroAoCarregar oQue="seus números" />}

      {semDados && (
        <EmptyState
          icon={Scissors}
          title={`Nenhum atendimento em ${rotuloDoMes(mes)}`}
          description="Seus indicadores aparecem depois dos primeiros atendimentos concluídos. Marque um como concluído na tela Hoje."
          actionLabel="Ir para Hoje"
          actionHref="/painel"
        />
      )}

      {!semDados && atual.status !== "carregando" && (
      <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-4">
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[11px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Faturamento</p>
          <p className="font-display text-lg font-semibold text-gold-light md:text-2xl">
            {formatBRL(kpis.revenue)}
          </p>
          <Delta current={kpis.revenue} previous={prevKpis.revenue} />
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[11px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Atendimentos</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {kpis.appointments}
          </p>
          <Delta current={kpis.appointments} previous={prevKpis.appointments} />
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[11px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Ticket médio</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {formatBRL(avgTicket)}
          </p>
          <Delta current={avgTicket} previous={prevAvgTicket} />
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[11px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Ocupação</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {kpis.occupancyPct}%
          </p>
          <Delta current={kpis.occupancyPct} previous={prevKpis.occupancyPct} />
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-6">
          <p className="text-[11px] uppercase text-ivory-muted md:text-xs md:tracking-wide">Taxa de no-show</p>
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
                className="text-center text-[11px] uppercase text-ivory-muted md:text-xs"
              >
                {h}
              </span>
            ))}
            {hourlyHeatmap.days.map((day, i) => (
              <Fragment key={day}>
                <span className="text-xs text-ivory-muted md:text-sm">{day}</span>
                {hourlyHeatmap.values[i].map((pct, j) => {
                  // A ocupação já vem calculada das reservas do período.
                  return (
                    <div
                      key={`${day}-${j}`}
                      className={`flex h-9 items-center justify-center rounded-lg text-xs font-medium text-ivory transition-colors md:h-12 md:text-sm ${heatColor(pct)}`}
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
              {peak.day} às {peak.hour} é o horário mais cheio do período —{" "}
              {peak.pct}% de ocupação.
            </p>
            <p className="text-xs text-ivory-muted md:text-sm">
              {idle.pct < 30
                ? `${idle.day} às ${idle.hour} é a maior brecha (${idle.pct}%) — bom alvo para promoção.`
                : "A agenda está distribuída: não há brecha evidente para promover."}
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
      </>
      )}
    </div>
  );
}
