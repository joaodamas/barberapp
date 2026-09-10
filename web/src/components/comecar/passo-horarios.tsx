"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { horariosDaJornada, type PausaDaJornada } from "@/lib/jornada";
import type { Tenant } from "@/lib/tenant";

const DIAS = [
  { n: 1, label: "Seg" }, { n: 2, label: "Ter" }, { n: 3, label: "Qua" },
  { n: 4, label: "Qui" }, { n: 5, label: "Sex" }, { n: 6, label: "Sáb" },
  { n: 0, label: "Dom" },
];

/** Horário próprio de um dia, enquanto o dono edita. */
type HorarioDoDia = { opensAt: string; closesAt: string };

function overridesIniciais(perDay: Tenant["schedule"]["perDay"], padrao: HorarioDoDia) {
  const saida: Record<string, HorarioDoDia> = {};
  for (const [dia, valor] of Object.entries(perDay ?? {})) {
    if (!valor) continue;
    saida[dia] = {
      opensAt: valor.opensAt ?? padrao.opensAt,
      closesAt: valor.closesAt ?? padrao.closesAt,
    };
  }
  return saida;
}

export function PassoHorarios({
  tenant,
  onSubmit,
  saving,
  /* O onboarding avança para o próximo passo; o painel salva e fica.
   * Mesma tela, duas frases — o rótulo é a única coisa que muda. */
  rotuloAcao = "Continuar",
  rotuloSalvando = "Salvando…",
}: {
  tenant: Tenant;
  onSubmit: (data: Record<string, unknown>) => void;
  saving: boolean;
  rotuloAcao?: string;
  rotuloSalvando?: string;
}) {
  const [weekdays, setWeekdays] = useState<number[]>(tenant.schedule.weekdays);
  const [opensAt, setOpensAt] = useState(tenant.schedule.opensAt);
  const [closesAt, setClosesAt] = useState(tenant.schedule.closesAt);
  const [slotMinutes, setSlotMinutes] = useState(tenant.schedule.slotMinutes);
  const [temIntervalo, setTemIntervalo] = useState(tenant.schedule.breaks.length > 0);
  const [breakFrom, setBreakFrom] = useState(tenant.schedule.breaks[0]?.from ?? "12:00");
  const [breakTo, setBreakTo] = useState(tenant.schedule.breaks[0]?.to ?? "14:00");

  /**
   * Dias com horário próprio — o pedido que fez esta tela crescer.
   *
   * > *"na terça feira desse ano eu tenho compromisso aí eu fecho as 17:30"*
   *
   * Só `opensAt`/`closesAt`, de propósito: o intervalo continua vindo do
   * padrão. O modelo (`schedule.perDay`) já aceita pausa por dia, mas oferecer
   * sete almoços editáveis numa tela de cadastro cobra atenção de todo dono
   * para resolver o caso de poucos. Quando aparecer quem precise, o campo já
   * existe no dado — não é uma migração, é uma linha de formulário.
   */
  const [porDia, setPorDia] = useState<Record<string, HorarioDoDia>>(() =>
    overridesIniciais(tenant.schedule.perDay, {
      opensAt: tenant.schedule.opensAt,
      closesAt: tenant.schedule.closesAt,
    })
  );

  const breaks: PausaDaJornada[] = temIntervalo ? [{ from: breakFrom, to: breakTo }] : [];
  const grade = horariosDaJornada({ jornada: { opensAt, closesAt, breaks }, slotMinutes });
  const valido = weekdays.length > 0 && grade.length > 0;

  const diasAbertos = DIAS.filter((d) => weekdays.includes(d.n));

  function horarioDe(dia: number): HorarioDoDia {
    return porDia[String(dia)] ?? { opensAt, closesAt };
  }

  function alternarDiaProprio(dia: number, proprio: boolean) {
    setPorDia((prev) => {
      const copia = { ...prev };
      if (proprio) copia[String(dia)] = { opensAt, closesAt };
      else delete copia[String(dia)];
      return copia;
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_220px]">
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">Dias de funcionamento</legend>
          <p className="text-xs text-ink-muted">Toque para desmarcar os dias em que você não abre.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {DIAS.map((d) => {
              const ativo = weekdays.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() =>
                    setWeekdays((prev) =>
                      prev.includes(d.n) ? prev.filter((x) => x !== d.n) : [...prev, d.n]
                    )
                  }
                  className={
                    "min-h-11 min-w-11 rounded-xl border px-3 text-sm font-medium transition-colors " +
                    (ativo
                      ? "border-gold bg-gold text-ink"
                      : "border-border text-ink-muted hover:text-ink")
                  }
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Hora id="abre" label="Abre" value={opensAt} onChange={setOpensAt} />
          <Hora id="fecha" label="Fecha" value={closesAt} onChange={setClosesAt} />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={temIntervalo}
            onChange={(e) => setTemIntervalo(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-gold"
          />
          Tenho intervalo (almoço ou pausa)
        </label>

        {temIntervalo && (
          <div className="grid grid-cols-2 gap-3">
            <Hora id="int-de" label="Intervalo de" value={breakFrom} onChange={setBreakFrom} />
            <Hora id="int-ate" label="até" value={breakTo} onChange={setBreakTo} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="slot" className="text-sm font-medium text-ink">
            Intervalo entre atendimentos
          </label>
          <p className="text-xs text-ink-muted">
            De quanto em quanto tempo os horários aparecem para o cliente.
          </p>
          <select
            id="slot"
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ink"
          >
            {[15, 20, 30, 45, 60].map((v) => (
              <option key={v} value={v}>{v} minutos</option>
            ))}
          </select>
        </div>

        {/* Fechado por padrão: quem abre e fecha na mesma hora todo dia — a
            maioria — não precisa nem saber que isto existe. Quem precisa,
            chega aqui procurando exatamente esta frase. */}
        <details className="rounded-xl border border-border bg-surface-raised/40 p-4 [&[open]>summary]:mb-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            Algum dia fecha em horário diferente?
          </summary>
          <p className="text-xs text-ink-muted">
            Use quando o horário diferente <strong>se repete toda semana</strong> — a terça
            do compromisso, o sábado que fecha mais cedo. Para um dia só (feriado,
            viagem), use os dias fechados logo abaixo.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {diasAbertos.length === 0 && (
              <p className="text-xs text-ink-muted">Marque ao menos um dia de funcionamento.</p>
            )}
            {diasAbertos.map((d) => {
              const proprio = !!porDia[String(d.n)];
              const valor = horarioDe(d.n);
              return (
                <div
                  key={d.n}
                  className="flex flex-col gap-2 rounded-lg border border-border/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={proprio}
                      onChange={(e) => alternarDiaProprio(d.n, e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-gold"
                    />
                    <span className="w-10 font-medium">{d.label}</span>
                    {!proprio && (
                      <span className="text-xs text-ink-muted">
                        {opensAt}–{closesAt} (padrão)
                      </span>
                    )}
                  </label>

                  {proprio && (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        aria-label={`${d.label} — abre`}
                        value={valor.opensAt}
                        onChange={(e) =>
                          setPorDia((prev) => ({
                            ...prev,
                            [String(d.n)]: { ...valor, opensAt: e.target.value },
                          }))
                        }
                        className="min-h-11 rounded-lg border border-border bg-surface-raised px-3 text-sm text-ink"
                      />
                      <span className="text-xs text-ink-muted">até</span>
                      <input
                        type="time"
                        aria-label={`${d.label} — fecha`}
                        value={valor.closesAt}
                        onChange={(e) =>
                          setPorDia((prev) => ({
                            ...prev,
                            [String(d.n)]: { ...valor, closesAt: e.target.value },
                          }))
                        }
                        className="min-h-11 rounded-lg border border-border bg-surface-raised px-3 text-sm text-ink"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>

        <Button
          onClick={() =>
            onSubmit({
              "schedule.weekdays": [...weekdays].sort(),
              "schedule.opensAt": opensAt,
              "schedule.closesAt": closesAt,
              "schedule.slotMinutes": slotMinutes,
              "schedule.breaks": breaks,
              /* Objeto inteiro, e não `schedule.perDay.2`: a tela mostra os
               * sete dias de uma vez, então ela é a autoridade sobre o
               * conjunto. Enviar campo a campo deixaria para trás o dia que o
               * dono acabou de desmarcar. */
              "schedule.perDay": porDia,
            })
          }
          disabled={!valido || saving}
        >
          {saving ? rotuloSalvando : rotuloAcao}
        </Button>
      </div>

      {/* Prévia por dia: é o que transforma configuração em compreensão. Um
          número só ("16 horários por dia") voltou a mentir no instante em que
          a terça passou a fechar mais cedo. */}
      <aside className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          O cliente vai ver
        </p>
        {grade.length === 0 ? (
          <p className="text-xs text-danger">
            Nenhum horário cabe. Confira a abertura, o fechamento e o intervalo.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {diasAbertos.map((d) => {
                const valor = horarioDe(d.n);
                const quantos = horariosDaJornada({
                  jornada: { ...valor, breaks },
                  slotMinutes,
                }).length;
                const proprio = !!porDia[String(d.n)];
                return (
                  <li key={d.n} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className={proprio ? "font-medium text-ink" : "text-ink-muted"}>
                      {d.label}
                    </span>
                    <span className="text-ink-muted">
                      {valor.opensAt}–{valor.closesAt}
                    </span>
                    <span className={proprio ? "font-medium text-gold-strong" : "text-ink"}>
                      {quantos}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-ink-muted">
              horários por barbeiro, em cada dia.
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {grade.slice(0, 8).map((h) => (
                <span
                  key={h}
                  className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-ink"
                >
                  {h}
                </span>
              ))}
              {grade.length > 8 && (
                <span className="px-1 py-0.5 text-[11px] text-ink-muted">
                  +{grade.length - 8}
                </span>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Hora({
  id, label, value, onChange,
}: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ink"
      />
    </div>
  );
}
