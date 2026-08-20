"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Tenant } from "@/lib/tenant";

const DIAS = [
  { n: 1, label: "Seg" }, { n: 2, label: "Ter" }, { n: 3, label: "Qua" },
  { n: 4, label: "Qui" }, { n: 5, label: "Sex" }, { n: 6, label: "Sáb" },
  { n: 0, label: "Dom" },
];

/**
 * Prévia ao vivo da grade.
 *
 * É o que transforma configuração em compreensão: o dono VÊ que fechar às 19h
 * com intervalo de 30 min gera 16 horários, em vez de descobrir depois que a
 * agenda ficou com buraco.
 */
function gradeDe(opensAt: string, closesAt: string, slotMinutes: number, breaks: Array<{from: string; to: string}>) {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (v: number) =>
    `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;

  const inicio = min(opensAt);
  const fim = min(closesAt);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio || slotMinutes < 5) return [];

  const horarios: string[] = [];
  for (let t = inicio; t + slotMinutes <= fim; t += slotMinutes) {
    const dentroDoIntervalo = breaks.some((b) => t >= min(b.from) && t < min(b.to));
    if (!dentroDoIntervalo) horarios.push(fmt(t));
    if (horarios.length > 60) break;
  }
  return horarios;
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

  const breaks = temIntervalo ? [{ from: breakFrom, to: breakTo }] : [];
  const grade = gradeDe(opensAt, closesAt, slotMinutes, breaks);
  const valido = weekdays.length > 0 && grade.length > 0;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_200px]">
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ivory">Dias de funcionamento</legend>
          <p className="text-xs text-ivory-muted">Toque para desmarcar os dias em que você não abre.</p>
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
                      ? "border-gold bg-gold text-ivory"
                      : "border-border text-ivory-muted hover:text-ivory")
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

        <label className="flex items-center gap-2 text-sm text-ivory">
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
          <label htmlFor="slot" className="text-sm font-medium text-ivory">
            Intervalo entre atendimentos
          </label>
          <p className="text-xs text-ivory-muted">
            De quanto em quanto tempo os horários aparecem para o cliente.
          </p>
          <select
            id="slot"
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ivory"
          >
            {[15, 20, 30, 45, 60].map((v) => (
              <option key={v} value={v}>{v} minutos</option>
            ))}
          </select>
        </div>

        <Button
          onClick={() =>
            onSubmit({
              "schedule.weekdays": [...weekdays].sort(),
              "schedule.opensAt": opensAt,
              "schedule.closesAt": closesAt,
              "schedule.slotMinutes": slotMinutes,
              "schedule.breaks": breaks,
            })
          }
          disabled={!valido || saving}
        >
          {saving ? rotuloSalvando : rotuloAcao}
        </Button>
      </div>

      <aside className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ivory-muted">
          O cliente vai ver
        </p>
        {grade.length === 0 ? (
          <p className="text-xs text-danger">
            Nenhum horário cabe. Confira a abertura, o fechamento e o intervalo.
          </p>
        ) : (
          <>
            <p className="font-display text-2xl text-gold-light">{grade.length}</p>
            <p className="text-xs text-ivory-muted">horários por dia</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {grade.slice(0, 12).map((h) => (
                <span
                  key={h}
                  className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-ivory"
                >
                  {h}
                </span>
              ))}
              {grade.length > 12 && (
                <span className="px-1 py-0.5 text-[11px] text-ivory-muted">
                  +{grade.length - 12}
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
      <label htmlFor={id} className="text-sm font-medium text-ivory">{label}</label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ivory"
      />
    </div>
  );
}
