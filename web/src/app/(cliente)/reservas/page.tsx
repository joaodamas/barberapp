"use client";

import { useEffect, useMemo, useState } from "react";

import { CalendarX2, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { bookingStatusMeta } from "@/lib/booking-status";
import { labelDoPagamento } from "@/lib/payment-method";
import { formatBRL, formatDatePtBR } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { useLoyalty, useMyBookings, useServices } from "@/lib/db/use-shop-data";
import { OCCUPIES_SLOT } from "@/lib/domain";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { bookableDays, firstBookableIndex } from "@/lib/slots";
import {
  cancellationPolicy,
  refundAmountFor,
  reschedulePolicy,
} from "@/lib/business-rules";
import type { Booking } from "@/lib/types";

type Tab = "futuras" | "historico";

/** Horas até o início da reserva. Negativo = já passou. */
function hoursUntil(booking: Booking) {
  const start = new Date(`${booking.date}T${booking.time}:00`);
  return (start.getTime() - Date.now()) / 3_600_000;
}

/**
 * Política de cancelamento — os percentuais e janelas vivem em
 * `lib/business-rules.ts`. Aqui só se monta o texto.
 */
function refundFor(booking: Booking) {
  const hours = hoursUntil(booking);
  const refund = refundAmountFor({
    value: booking.value,
    paymentMethod: booking.paymentMethod,
    hoursUntilStart: hours,
  });

  const label =
    refund.tier === "sem_pagamento"
      ? "Como o pagamento seria no salão, não há valor a devolver."
      : refund.tier === "integral"
        ? `Faltam mais de ${cancellationPolicy.fullRefundHours}h: você recebe ${formatBRL(refund?.amount ?? 0)} de volta (100%).`
        : refund.tier === "parcial"
          ? `Faltam menos de ${cancellationPolicy.fullRefundHours}h: retemos ${refund.retainedPct}% de taxa de cancelamento e devolvemos ${formatBRL(refund?.amount ?? 0)}.`
          : `Faltam menos de ${cancellationPolicy.partialRefundHours}h para o horário: não há devolução prevista na política.`;

  return { hoursUntil: hours, ...refund, label };
}

export default function ReservasPage() {
  const tenant = useTenant();
  const { user } = useAuth();
  const { items: minhas, status } = useMyBookings(user?.uid);
  const { items: services } = useServices();

  const barbershop = { whatsapp: tenant.contact.whatsapp };
  const loyalty = useLoyalty(user?.uid);
  const getServicesByIds = (ids: string[]) =>
    ids.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Array<{
      id: string; name: string; durationMin: number;
    }>;

  const hoje = new Date().toISOString().slice(0, 10);
  const futuras = minhas.filter((b) => b.date >= hoje && OCCUPIES_SLOT.includes(b.status));
  const bookingHistory = minhas.filter((b) => b.status === "completed");

  const [tab, setTab] = useState<Tab>("futuras");
  const booking = (futuras[futuras.length - 1] ?? null) as (typeof minhas)[number] | null;
  const statusMeta = booking ? bookingStatusMeta[booking.status] : null;
  const bookingServices = booking ? getServicesByIds(booking.serviceIds) : [];
  const duracaoDaReserva = bookingServices.reduce((sum, s) => sum + s.durationMin, 0);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dayIndex, setDayIndex] = useState(() => firstBookableIndex(bookableDays(new Date(), tenant.schedule)));
  const [time, setTime] = useState<string | null>(null);
  const [resposta, setResposta] = useState<{ chave: string; slots: string[] } | null>(null);
  const [resgatando, setResgatando] = useState(false);
  const [erroResgate, setErroResgate] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroReserva, setErroReserva] = useState<string | null>(null);

  /* O resgate acontece no servidor: a transação lê o saldo e grava o resgate
   * junto, senão dois toques no botão resgatam duas vezes com um saldo só. */
  async function resgatar() {
    setResgatando(true);
    setErroResgate(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("redeemLoyaltyReward", { barbershopId: tenant.id });
    } catch (err) {
      console.error("[fidelidade]", err);
      setErroResgate(
        (err as { message?: string })?.message ?? "Não foi possível resgatar agora."
      );
    } finally {
      setResgatando(false);
    }
  }

  const days = useMemo(() => bookableDays(new Date(), tenant.schedule), [tenant.schedule]);
  const selectedDay = days[dayIndex];

  /* Os horários de remarcação vêm do SERVIDOR — P1-4.
   *
   * A tela calculava os slots com `slotsForDate`, passando como `ocupados`
   * apenas AS RESERVAS DO PRÓPRIO CLIENTE. Ela não tinha como saber mais que
   * isso: as regras proíbem o cliente de ler reserva alheia, e devem proibir.
   *
   * O resultado é o mesmo defeito que `availableSlots` corrigiu no agendar, e
   * que passou meses aqui sem ser aplicado: a tela oferecia horários já
   * ocupados por outras pessoas, o cliente escolhia, e só ao confirmar o
   * servidor respondia "esse horário acabou de ser reservado". Do lado de quem
   * usa, o produto sorteia um erro depois de você escolher.
   *
   * `staffId` da própria reserva: remarcar mantém o profissional. Perguntar a
   * disponibilidade da loja inteira devolveria horário livre em outro barbeiro
   * e o erro voltaria pela porta de trás. */
  const idDoBarbeiro = booking?.staffId;
  const duracaoParaSlots = booking?.durationMin || duracaoDaReserva;
  const chaveDaConsulta = `${selectedDay?.iso ?? ""}|${idDoBarbeiro ?? ""}|${duracaoParaSlots}`;

  useEffect(() => {
    if (!rescheduleOpen || !selectedDay?.iso || !idDoBarbeiro) return;
    let cancelado = false;
    (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        const r = await callFunction<
          { barbershopId: string; date: string; staffId: string; durationMin: number },
          { slots: string[] }
        >("availableSlots", {
          barbershopId: tenant.id,
          date: selectedDay.iso,
          staffId: idDoBarbeiro,
          durationMin: duracaoParaSlots,
        });
        if (!cancelado) setResposta({ chave: chaveDaConsulta, slots: r.slots ?? [] });
      } catch (err) {
        console.error("[reservas] falha ao buscar horários", err);
        if (!cancelado) setResposta({ chave: chaveDaConsulta, slots: [] });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [rescheduleOpen, selectedDay?.iso, idDoBarbeiro, duracaoParaSlots, tenant.id, chaveDaConsulta]);

  /* Só vale a resposta desta combinação. Trocar o dia volta a lista para
   * "carregando" sem precisar limpá-la — e nunca mostra o dia anterior. */
  const horariosLivres = resposta?.chave === chaveDaConsulta ? resposta.slots : null;
  const slots = (horariosLivres ?? []).map((time) => ({ time, available: true }));

  const active = !!booking;
  const refund = booking ? refundFor(booking) : null;

  const totalSpentHistory = bookingHistory.reduce((s, b) => s + b.value, 0);
  const stampsLeft = loyalty.faltam;

  /* Reagendar era grátis, ilimitado e sem prazo — dava para reagendar 10 min
   * antes e cancelar depois com 100% de volta, anulando a política inteira. */
  const horasAteReserva = booking ? hoursUntil(booking) : 0;
  /* A contagem vem do DOCUMENTO — P1-13.
   *
   * Era um `useState(0)` que zerava com F5, e o servidor nunca soube da regra:
   * `rescheduleBooking` validava só a janela de horas. A tela anunciava um
   * limite de 2 que bastava recarregar a página para contornar.
   *
   * Agora quem barra é o servidor, dentro da transação que move o horário. Esta
   * leitura existe para o botão dizer a verdade ANTES do toque — não é ela que
   * aplica a regra. */
  const remarcacoesFeitas = booking?.rescheduleCount ?? 0;
  const podeReagendar =
    active &&
    horasAteReserva >= reschedulePolicy.minHoursBefore &&
    remarcacoesFeitas < reschedulePolicy.maxPerBooking;
  const motivoBloqueio =
    horasAteReserva < reschedulePolicy.minHoursBefore
      ? `Reagendamento só até ${reschedulePolicy.minHoursBefore}h antes — fale com a barbearia.`
      : `Limite de ${reschedulePolicy.maxPerBooking} reagendamentos por reserva atingido.`;

  function openReschedule() {
    setDayIndex(firstBookableIndex(days));
    setTime(null);
    setRescheduleOpen(true);
  }

  /* Remarcar e cancelar passam pelo SERVIDOR.
   *
   * Antes as duas escreviam direto no Firestore — e as regras negam, porque o
   * cliente não pode gravar `status`. O `catch` só fazia `console.error`: o
   * modal fechava, a tela dava a impressão de que deu certo, e a agenda do
   * barbeiro continuava com o horário lá. O cliente achava que tinha avisado.
   *
   * Agora o erro aparece na tela, e o modal só fecha quando o servidor confirma.
   */
  async function confirmReschedule() {
    if (!time || !selectedDay || !podeReagendar || !booking) return;
    setSalvando(true);
    setErroReserva(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("rescheduleBooking", {
        barbershopId: tenant.id,
        bookingId: booking.id,
        date: selectedDay.iso,
        time,
      });
      /* Sem contador local: `rescheduleCount` é gravado pelo servidor e chega
       * pelo listener do Firestore. Contar aqui foi exatamente o defeito. */
      setRescheduleOpen(false);
    } catch (err) {
      console.error("[reservas] falha ao reagendar", err);
      setErroReserva(
        (err as { message?: string })?.message ?? "Não foi possível remarcar agora."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function confirmCancel() {
    if (!booking) return;
    setSalvando(true);
    setErroReserva(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("cancelBooking", {
        barbershopId: tenant.id,
        bookingId: booking.id,
      });
      setCancelOpen(false);
    } catch (err) {
      console.error("[reservas] falha ao cancelar", err);
      setErroReserva(
        (err as { message?: string })?.message ?? "Não foi possível cancelar agora."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-[1fr_360px] md:items-start md:gap-x-10 md:gap-y-8 md:pt-4">
      <h1 className="text-xl text-ivory md:col-span-2 md:text-3xl md:tracking-tight">Reservas</h1>

      <div className="flex flex-col gap-5 md:col-start-1 md:row-start-2 md:gap-7">
        <div className="grid grid-cols-2 gap-2 md:w-fit md:gap-4">
          <Card className="flex flex-col items-center gap-0.5 p-3 text-center md:min-w-32 md:p-4">
            <p className="font-display text-lg font-semibold text-ivory">
              {bookingHistory.length}
            </p>
            <p className="text-[11px] text-ivory-muted md:text-xs">atendimentos concluídos</p>
          </Card>
          <Card className="flex flex-col items-center gap-0.5 p-3 text-center md:min-w-32 md:p-4">
            <p className="font-display text-lg font-semibold text-gold-light">
              {formatBRL(totalSpentHistory)}
            </p>
            <p className="text-[11px] text-ivory-muted md:text-xs">investido na barbearia</p>
          </Card>
        </div>

        <div className="flex gap-2 rounded-xl border border-border bg-surface p-1 md:w-fit">
          {(["futuras", "historico"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors md:px-6 md:py-2.5 md:text-base " +
                (tab === t ? "bg-gold text-ivory" : "text-ivory-muted hover:text-ivory")
              }
            >
              {t === "futuras" ? "Futuras" : "Histórico"}
            </button>
          ))}
        </div>

        {status === "carregando" ? (
          <LoadingRows rows={2} />
        ) : tab === "futuras" ? (
          active ? (
            <Card className="flex flex-col gap-3 md:max-w-xl md:p-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-ivory md:text-lg">
                    {bookingServices.map((s) => s.name).join(" + ")}
                  </p>
                  <p className="text-sm capitalize text-ivory-muted md:text-base">
                    {booking ? `${formatDatePtBR(booking.date)} às ${booking.time}` : ""}
                  </p>
                </div>
                {statusMeta && <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>}
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm md:pt-3 md:text-base">
                <span className="text-ivory-muted">
                  {booking?.paymentMethod ? "Valor pago" : "A pagar no salão"}
                </span>
                <span className="font-display font-semibold text-ivory md:text-lg">
                  {formatBRL(booking?.value ?? 0)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={openReschedule}
                  disabled={!podeReagendar}
                  title={podeReagendar ? undefined : motivoBloqueio}
                >
                  Reagendar
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1 text-danger"
                  onClick={() => setCancelOpen(true)}
                >
                  Cancelar
                </Button>
              </div>
              <p className="text-xs text-ivory-muted md:text-sm">
                Cancelamento até {cancellationPolicy.fullRefundHours}h antes: 100% de
                volta. Entre {cancellationPolicy.fullRefundHours}h e{" "}
                {cancellationPolicy.partialRefundHours}h: taxa de{" "}
                {cancellationPolicy.cancellationFeePct}%.{" "}
                {!podeReagendar && active && (
                  <span className="text-gold-light">{motivoBloqueio}</span>
                )}
              </p>
            </Card>
          ) : (
            <EmptyState
              icon={CalendarX2}
              title="Você não tem reserva futura"
              description="Escolha o serviço e o horário que der certo pra você — leva menos de um minuto."
              actionLabel="Agendar horário"
              actionHref="/agendar"
            />
          )
        ) : bookingHistory.length > 0 ? (
          <div className="flex flex-col gap-2 md:max-w-xl">
            {bookingHistory.map((b) => {
              const bServices = getServicesByIds(b.serviceIds);
              return (
                <Card key={b.id} className="flex items-center justify-between gap-3 md:p-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ivory md:text-base">
                      {bServices.map((s) => s.name).join(" + ")}
                    </p>
                    <p className="truncate text-xs capitalize text-ivory-muted md:text-sm">
                      {formatDatePtBR(b.date)} às {b.time} · {labelDoPagamento(b.paymentOrigin, b.paymentMethod)}
                    </p>
                  </div>
                  <span className="shrink-0 font-display font-semibold text-ivory">
                    {formatBRL(b.value)}
                  </span>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="flex flex-col items-center gap-2 py-10 text-center md:max-w-xl md:py-16">
            <CalendarX2 size={22} className="text-ivory-muted" />
            <p className="text-sm text-ivory-muted md:text-base">
              Nenhum atendimento concluído ainda.
            </p>
          </Card>
        )}
      </div>

      <div className="hidden md:col-start-2 md:row-start-2 md:flex md:flex-col md:gap-6">
        <section aria-labelledby="fidelidade-reservas">
          <h2
            id="fidelidade-reservas"
            className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm"
          >
            Fidelidade
          </h2>
          <Card className="flex flex-col gap-3 md:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-ivory md:text-base">
                {loyalty.stamps} de {loyalty.goal} carimbos
              </p>
              <p className="text-xs text-gold-light md:text-sm">
                {loyalty.podeResgatar ? "pronto para resgatar" : `faltam ${stampsLeft}`}
              </p>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: loyalty.goal }).map((_, i) => (
                <span
                  key={i}
                  className={
                    i < loyalty.stamps
                      ? "h-2.5 flex-1 rounded-full bg-gold"
                      : "h-2.5 flex-1 rounded-full bg-surface-raised"
                  }
                />
              ))}
            </div>
            {loyalty.podeResgatar && (
              <Button onClick={resgatar} disabled={resgatando}>
                {resgatando ? "Resgatando…" : `Resgatar ${loyalty.reward}`}
              </Button>
            )}
            {erroResgate && (
              <p role="alert" className="text-xs text-danger">
                {erroResgate}
              </p>
            )}
          </Card>
        </section>

        <section aria-labelledby="ajuda-reservas">
          <h2
            id="ajuda-reservas"
            className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm"
          >
            Precisa de ajuda?
          </h2>
          <Card className="flex flex-col gap-3 md:p-6">
            <p className="text-sm text-ivory-muted md:text-base">
              Reagendamentos e cancelamentos fora do prazo são resolvidos direto com a
              barbearia.
            </p>
            <div className="flex gap-2">
              <a
                href={`https://wa.me/${barbershop.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button variant="secondary" className="w-full">
                  WhatsApp
                </Button>
              </a>
              <a href={`tel:+${barbershop.whatsapp}`} className="flex-1">
                <Button variant="secondary" className="w-full">
                  <Phone size={16} />
                  Ligar
                </Button>
              </a>
            </div>
          </Card>
        </section>
      </div>

      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reagendar"
        description={`${bookingServices.map((s) => s.name).join(" + ")} · ${formatBRL(booking?.value ?? 0)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRescheduleOpen(false)}>
              Voltar
            </Button>
            <Button onClick={confirmReschedule} disabled={!time || salvando}>
              {salvando ? "Remarcando…" : "Confirmar novo horário"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erroReserva && (
            <p role="alert" className="text-sm text-danger">
              {erroReserva}
            </p>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted">
              Escolha o dia
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d, i) => (
                <button
                  key={d.iso}
                  disabled={d.disabled}
                  aria-pressed={i === dayIndex}
                  onClick={() => {
                    setDayIndex(i);
                    setTime(null);
                  }}
                  className={
                    "flex min-w-14 shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 " +
                    (i === dayIndex
                      ? "border-gold bg-gold/10 text-gold-light"
                      : "border-border text-ivory-muted hover:border-gold/40 hover:text-ivory")
                  }
                >
                  <span className="capitalize">
                    {d.date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span className="font-display text-base text-ivory">{d.date.getDate()}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted">
              Horários livres
            </p>
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  disabled={!slot.available}
                  aria-pressed={time === slot.time}
                  onClick={() => setTime(slot.time)}
                  className={
                    "rounded-lg border px-2 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 " +
                    (time === slot.time
                      ? "border-gold bg-gold text-ivory"
                      : "border-border text-ivory hover:border-gold/50")
                  }
                >
                  {slot.time}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar reserva"
        description={booking ? `${formatDatePtBR(booking.date)} às ${booking.time}` : ""}
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Manter reserva
            </Button>
            <Button
              className="bg-danger text-white hover:bg-danger/90"
              onClick={confirmCancel}
              disabled={salvando}
            >
              {salvando ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ivory">{refund?.label}</p>
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm">
            <span className="text-ivory-muted">Valor a devolver</span>
            <span className="font-display font-semibold text-ivory">
              {formatBRL(refund?.amount ?? 0)}
            </span>
          </div>
          <p className="text-xs text-ivory-muted">
            Esta ação libera o horário na agenda e não pode ser desfeita.
          </p>
          {erroReserva && (
            <p role="alert" className="text-sm text-danger">
              {erroReserva}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
