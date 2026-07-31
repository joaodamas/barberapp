"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Clock,
  CreditCard,
  QrCode,
  Store,
  ChevronLeft,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { services, mockSlotsForDay } from "@/lib/mock-data";
import { formatBRL } from "@/lib/format";
import type { PaymentMethod, TimeSlot } from "@/lib/types";

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: "Serviços",
  2: "Dia e horário",
  3: "Pagamento",
  4: "Confirmação",
};

function nextDays(count: number) {
  const days = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function AgendarPage() {
  const [step, setStep] = useState<Step>(1);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");

  const days = useMemo(() => nextDays(10), []);
  const slots = useMemo(
    () => mockSlotsForDay(selectedDayIndex),
    [selectedDayIndex]
  );

  const selectedServices = services.filter((s) =>
    selectedServiceIds.includes(s.id)
  );
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = selectedServices.reduce(
    (sum, s) => sum + s.durationMin,
    0
  );
  const selectedDay = days[selectedDayIndex];
  const isFitIn = Boolean(selectedSlot?.isFitIn);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-[1fr_340px] md:items-start md:gap-8 md:pt-4">
      <div className="flex items-center gap-2 md:col-span-2 md:gap-3">
        {step > 1 && step < 4 && (
          <button
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ivory-muted transition-colors hover:border-gold/60 hover:text-ivory md:h-10 md:w-10"
            aria-label="Voltar"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div>
          <p className="text-xs uppercase tracking-wider text-ivory-muted md:text-sm">
            Passo {step} de 4
          </p>
          <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">{STEP_LABELS[step]}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-5 md:col-start-1 md:gap-7">
      <div className="flex gap-1.5">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <span
            key={s}
            className={
              s <= step
                ? "h-1 flex-1 rounded-full bg-gold"
                : "h-1 flex-1 rounded-full bg-surface-raised"
            }
          />
        ))}
      </div>

      {step === 1 && (
        <div className="grid gap-3 pb-24 md:grid-cols-2">
          {services.map((service) => {
            const checked = selectedServiceIds.includes(service.id);
            return (
              <button
                key={service.id}
                onClick={() => toggleService(service.id)}
                className={
                  "flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors md:p-5 " +
                  (checked
                    ? "border-gold bg-gold/10"
                    : "border-border bg-surface hover:border-gold/40")
                }
              >
                <div>
                  <p className="text-sm text-ivory">{service.name}</p>
                  <p className="text-xs text-ivory-muted">
                    {service.durationMin} min
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-gold-light">
                    {service.priceFrom && "a partir de "}
                    {formatBRL(service.price)}
                  </p>
                  <span
                    className={
                      "flex h-6 w-6 items-center justify-center rounded-full border " +
                      (checked
                        ? "border-gold bg-gold text-bg"
                        : "border-border text-transparent")
                    }
                  >
                    <Check size={14} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4 pb-24">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d, i) => {
              const active = i === selectedDayIndex;
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => {
                    setSelectedDayIndex(i);
                    setSelectedSlot(null);
                  }}
                  className={
                    "flex min-w-14 flex-col items-center gap-1 rounded-xl border px-3 py-2 " +
                    (active
                      ? "border-gold bg-gold/10 text-gold-light"
                      : "border-border text-ivory-muted")
                  }
                >
                  <span className="text-[10px] uppercase">
                    {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                  </span>
                  <span className="text-base font-semibold">
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3">
            {slots.map((slot) => {
              const active = selectedSlot?.time === slot.time;
              if (!slot.available && !slot.isFitIn) {
                return (
                  <span
                    key={slot.time}
                    className="rounded-xl border border-border/50 bg-surface/40 py-3 text-center text-sm text-ivory-muted/40 line-through"
                  >
                    {slot.time}
                  </span>
                );
              }
              return (
                <button
                  key={slot.time}
                  onClick={() => setSelectedSlot(slot)}
                  className={
                    "flex flex-col items-center rounded-xl border py-2.5 text-sm transition-colors " +
                    (active
                      ? "border-gold bg-gold text-bg"
                      : slot.isFitIn
                        ? "border-danger/40 text-danger"
                        : "border-border text-ivory")
                  }
                >
                  {slot.time}
                  {slot.isFitIn && (
                    <span className="text-[10px] font-medium">encaixe</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4 pb-24">
          <Card className="flex flex-col gap-2 md:p-6">
            <p className="text-sm text-ivory md:text-base">
              {selectedServices.map((s) => s.name).join(" + ")}
            </p>
            <p className="text-xs capitalize text-ivory-muted">
              {selectedDay.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}{" "}
              às {selectedSlot?.time} · {totalDuration} min
            </p>
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="text-ivory-muted">Total</span>
              <span className="font-semibold text-gold-light">
                {formatBRL(totalPrice)}
              </span>
            </div>
          </Card>

          {isFitIn ? (
            <Card className="flex flex-col gap-2 border-gold/30">
              <Pill tone="gold" className="w-fit">
                Solicitação de encaixe
              </Pill>
              <p className="text-sm text-ivory-muted">
                Esse horário está ocupado. Seu pedido vai direto para o
                WhatsApp do barbeiro — se aprovado, você paga e confirma na
                hora. Sem resposta em até 45 min, o sistema libera opções de
                horários livres automaticamente.
              </p>
            </Card>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider text-ivory-muted">
                Pagamento — opcional, você escolhe
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPaymentMethod("pix")}
                  className={
                    "flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 text-sm " +
                    (paymentMethod === "pix"
                      ? "border-gold bg-gold/10 text-gold-light"
                      : "border-border text-ivory-muted")
                  }
                >
                  <QrCode size={16} /> Pix
                </button>
                <button
                  onClick={() => setPaymentMethod("cartao")}
                  className={
                    "flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 text-sm " +
                    (paymentMethod === "cartao"
                      ? "border-gold bg-gold/10 text-gold-light"
                      : "border-border text-ivory-muted")
                  }
                >
                  <CreditCard size={16} /> Cartão
                </button>
                <button
                  onClick={() => setPaymentMethod("local")}
                  className={
                    "flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 text-sm " +
                    (paymentMethod === "local"
                      ? "border-gold bg-gold/10 text-gold-light"
                      : "border-border text-ivory-muted")
                  }
                >
                  <Store size={16} /> No salão
                </button>
              </div>
              {paymentMethod === "local" ? (
                <p className="text-xs text-ivory-muted">
                  Sua reserva é confirmada na hora, sem cobrança agora. Pague{" "}
                  {formatBRL(totalPrice)} no salão (dinheiro ou maquininha) no
                  dia do atendimento.
                </p>
              ) : (
                <p className="text-xs text-ivory-muted">
                  Pagamento simulado nesta fase — a integração real com o
                  gateway entra no próximo épico.
                </p>
              )}
            </>
          )}

          <Card className="flex gap-2 bg-surface-raised text-xs text-ivory-muted">
            <Clock size={14} className="mt-0.5 shrink-0 text-gold-light" />
            <p>
              Cancelamento até 24h antes: 100% de volta. Entre 24h e 6h: taxa
              de cancelamento. Menos de 6h ou não comparecimento: sem
              reembolso.
            </p>
          </Card>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center gap-4 pt-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold-light">
            <Check size={30} />
          </div>
          <h2 className="text-lg text-ivory">
            {isFitIn ? "Pedido de encaixe enviado!" : "Reserva confirmada!"}
          </h2>
          <p className="max-w-xs text-sm text-ivory-muted">
            {isFitIn
              ? "O barbeiro foi avisado no WhatsApp dele e vai aprovar ou recusar seu horário em breve. Você recebe a resposta por lá."
              : paymentMethod === "local"
                ? `Você recebe a confirmação também no WhatsApp. Não esqueça: ${formatBRL(totalPrice)} no salão no dia do atendimento.`
                : "Você recebe a confirmação também no WhatsApp, com todos os detalhes da reserva."}
          </p>
          <Link href="/reservas" className="w-full">
            <Button className="w-full">Ver minhas reservas</Button>
          </Link>
        </div>
      )}

      {step < 4 && (
        <div className="fixed inset-x-0 bottom-16 z-10 mx-auto w-full max-w-md border-t border-border bg-bg/95 px-4 py-3 backdrop-blur safe-bottom md:hidden">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-ivory-muted">
              {selectedServices.length > 0
                ? `${selectedServices.length} serviço(s) · ${totalDuration} min`
                : "Selecione ao menos um serviço"}
            </span>
            {totalPrice > 0 && (
              <span className="font-semibold text-gold-light">
                {formatBRL(totalPrice)}
              </span>
            )}
          </div>
          <Button
            className="w-full"
            disabled={
              (step === 1 && selectedServiceIds.length === 0) ||
              (step === 2 && !selectedSlot)
            }
            onClick={() => setStep((s) => (s + 1) as Step)}
          >
            {step === 3
              ? isFitIn
                ? "Solicitar encaixe"
                : paymentMethod === "local"
                  ? "Confirmar reserva"
                  : "Pagar e confirmar"
              : "Continuar"}
          </Button>
        </div>
      )}
      </div>

      {step < 4 && (
        <Card className="hidden md:sticky md:top-6 md:col-start-2 md:flex md:flex-col md:gap-4 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
            Resumo da reserva
          </p>

          {selectedServices.length > 0 ? (
            <div className="flex flex-col gap-2 border-b border-border pb-4">
              {selectedServices.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-ivory">{s.name}</span>
                  <span className="text-ivory-muted">{formatBRL(s.price)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="border-b border-border pb-4 text-sm text-ivory-muted">
              Selecione ao menos um serviço pra ver o resumo aqui.
            </p>
          )}

          {step >= 2 && selectedSlot && (
            <div className="flex flex-col gap-1 border-b border-border pb-4 text-sm">
              <span className="text-ivory-muted">Dia e horário</span>
              <span className="capitalize text-ivory">
                {selectedDay.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}{" "}
                às {selectedSlot.time}
              </span>
            </div>
          )}

          {step === 3 && !isFitIn && (
            <div className="flex items-center justify-between border-b border-border pb-4 text-sm">
              <span className="text-ivory-muted">Pagamento</span>
              <span className="text-ivory">
                {paymentMethod === "pix" ? "Pix" : paymentMethod === "cartao" ? "Cartão" : "No salão"}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-ivory-muted">
              {totalDuration > 0 ? `${totalDuration} min` : "Duração"}
            </span>
            <span className="font-display text-lg font-semibold text-gold-light">
              {formatBRL(totalPrice)}
            </span>
          </div>

          <Button
            className="w-full"
            disabled={
              (step === 1 && selectedServiceIds.length === 0) ||
              (step === 2 && !selectedSlot)
            }
            onClick={() => setStep((s) => (s + 1) as Step)}
          >
            {step === 3
              ? isFitIn
                ? "Solicitar encaixe"
                : paymentMethod === "local"
                  ? "Confirmar reserva"
                  : "Pagar e confirmar"
              : "Continuar"}
          </Button>
        </Card>
      )}
    </div>
  );
}
