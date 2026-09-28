"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { bookableDays } from "@/lib/slots";
import { capacidadeDaData } from "@/lib/jornada";
import { formatBRL, toISODate } from "@/lib/format";
import type { BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * O dono muda o dia ou a hora de um atendimento.
 *
 * `rescheduleBooking` já aceitava o dono sem os limites do cliente (prazo de
 * 6h, teto de 2 remarcações) — faltava a tela. Os horários vêm do mesmo
 * `availableSlots` do resto do produto, com duas diferenças do balcão:
 * `paraOBalcao` (sem antecedência mínima) e `ignorarReservaId` — sem ele a
 * reserva bloqueava a si mesma, e empurrar o cliente 30 minutos não aparecia.
 *
 * O barbeiro continua o mesmo: é o que o servidor faz. Trocar de profissional
 * é outra operação.
 */
export function RemarcarAtendimento({
  booking,
  aoFechar,
  aoRemarcar,
}: {
  booking: Doc<BookingDoc>;
  aoFechar: () => void;
  aoRemarcar: (date: string, time: string) => void;
}) {
  const tenant = useTenant();
  const dias = useMemo(() => bookableDays(new Date(), tenant.schedule), [tenant.schedule]);
  /* O dia é uma DATA, não um índice nos 10 botões: o dono remarca retorno
   * para o mês que vem, e o servidor aceita até um ano à frente. Os botões são
   * atalho; "Outra data" alcança o resto (revisão do PR #62). */
  const [diaIso, setDiaIso] = useState(() => {
    const noAtalho = dias.find((d) => d.iso === booking.date && !d.disabled);
    return noAtalho?.iso ?? dias.find((d) => !d.disabled)?.iso ?? booking.date;
  });
  const abreNoDia = (iso: string) =>
    capacidadeDaData({
      schedule: tenant.schedule,
      weekday: new Date(`${iso}T12:00:00`).getDay(),
      date: iso,
    }) > 0;
  const dia = { iso: diaIso, disabled: !abreNoDia(diaIso) };
  /* Reserva antiga sem barbeiro gravado: `availableSlots` escolheria o
   * primeiro da equipe, e a lista não bateria com a conta do servidor. Melhor
   * dizer do que oferecer um horário que pode ser recusado. */
  const semBarbeiro = !booking.staffId;
  const duracao = booking.durationMin || tenant.schedule?.slotMinutes || 30;
  const [hora, setHora] = useState<string | null>(null);
  const [resposta, setResposta] = useState<{ chave: string; slots: string[] } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const chave = `${dia?.iso ?? ""}`;
  useEffect(() => {
    if (!dia?.iso || dia.disabled || semBarbeiro) return;
    let cancelado = false;
    (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        const r = await callFunction<Record<string, unknown>, { slots: string[] }>("availableSlots", {
          barbershopId: tenant.id,
          date: dia.iso,
          staffId: booking.staffId,
          durationMin: duracao,
          paraOBalcao: true,
          ignorarReservaId: booking.id,
        });
        if (!cancelado) setResposta({ chave, slots: r.slots ?? [] });
      } catch {
        if (!cancelado) setResposta({ chave, slots: [] });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [chave, dia?.iso, dia?.disabled, semBarbeiro, tenant.id, booking.staffId, duracao, booking.id]);

  /* O próprio horário atual não é destino: remarcar para onde já está seria
   * um toque sem efeito que ainda gasta uma chamada ao servidor. */
  const livres =
    resposta?.chave === chave
      ? resposta.slots.filter((h) => !(dia?.iso === booking.date && h === booking.time))
      : null;

  async function confirmar() {
    if (!dia || !hora) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("rescheduleBooking", {
        barbershopId: tenant.id,
        bookingId: booking.id,
        date: dia.iso,
        time: hora,
      });
      aoRemarcar(dia.iso, hora);
    } catch (e) {
      setErro((e as { message?: string })?.message ?? "Não foi possível remarcar. Nada foi alterado.");
    } finally {
      setSalvando(false);
    }
  }

  const hoje = toISODate(new Date());
  const rotuloDoDia = (iso: string) =>
    iso === hoje
      ? "Hoje"
      : new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        });

  return (
    <Modal
      open
      onClose={() => !salvando && aoFechar()}
      title="Remarcar atendimento"
      description={`${booking.clientName} · marcado para ${rotuloDoDia(booking.date).toLowerCase()} às ${booking.time} · ${duracao} min · ${formatBRL(booking.value)}`}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-muted">Novo dia</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {dias.map((d) => (
            <button
              key={d.iso}
              type="button"
              disabled={d.disabled}
              aria-pressed={d.iso === diaIso}
              onClick={() => {
                setDiaIso(d.iso);
                setHora(null);
              }}
              className={
                "min-h-10 shrink-0 rounded-lg border px-3 py-2 text-xs transition-colors disabled:opacity-30 " +
                (d.iso === diaIso ? "border-gold bg-gold/10 text-ink" : "border-border text-ink-muted")
              }
            >
              {rotuloDoDia(d.iso)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Outra data
          <input
            type="date"
            min={toISODate(new Date())}
            value={diaIso}
            onChange={(e) => {
              if (!e.target.value) return;
              setDiaIso(e.target.value);
              setHora(null);
            }}
            className="rounded-lg border px-2 py-1.5 text-sm text-ink"
          />
        </label>

        <p className="text-[11px] uppercase tracking-wide text-ink-muted">Novo horário</p>
        {semBarbeiro ? (
          <p className="text-xs text-ink-muted">
            Este atendimento é antigo e não tem barbeiro definido. Para mudar o
            horário, cancele e marque de novo pelo “Marcar atendimento”.
          </p>
        ) : !dia || dia.disabled ? (
          <p className="text-xs text-ink-muted">A barbearia não abre nesse dia.</p>
        ) : livres === null ? (
          <p className="text-xs text-ink-muted">Carregando horários…</p>
        ) : livres.length === 0 ? (
          <p className="text-xs text-ink-muted">
            Nenhum horário livre de {duracao} min nesse dia.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {livres.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={hora === h}
                onClick={() => setHora(h)}
                className={
                  "rounded-lg border py-2 text-xs transition-colors " +
                  (hora === h
                    ? "border-gold bg-gold/10 text-ink"
                    : "border-border text-ink-muted hover:border-gold/60")
                }
              >
                {h}
              </button>
            ))}
          </div>
        )}

        {erro && (
          <p role="alert" className="text-sm text-danger">
            {erro}
          </p>
        )}

        <Button disabled={!hora || salvando} onClick={() => void confirmar()}>
          {salvando
            ? "Remarcando…"
            : hora && dia
              ? `Remarcar para ${rotuloDoDia(dia.iso).toLowerCase()} às ${hora}`
              : "Escolha o novo horário"}
        </Button>
      </div>
    </Modal>
  );
}
