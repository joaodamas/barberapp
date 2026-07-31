"use client";

import { useState } from "react";
import { CalendarX2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { bookingStatusMeta } from "@/lib/booking-status";
import { paymentMethodLabel } from "@/lib/payment-method";
import { formatBRL, formatDatePtBR } from "@/lib/format";
import { bookingHistory, getServicesByIds, nextBooking } from "@/lib/mock-data";

type Tab = "futuras" | "historico";

export default function ReservasPage() {
  const [tab, setTab] = useState<Tab>("futuras");
  const statusMeta = bookingStatusMeta[nextBooking.status];
  const bookingServices = getServicesByIds(nextBooking.serviceIds);

  const totalSpentHistory = bookingHistory.reduce((s, b) => s + b.value, 0);

  return (
    <div className="flex flex-col gap-5 pt-1 md:gap-7 md:pt-4">
      <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">Reservas</h1>

      <div className="grid grid-cols-2 gap-2 md:w-fit md:gap-4">
        <Card className="flex flex-col items-center gap-0.5 p-3 text-center md:min-w-32 md:p-4">
          <p className="font-display text-lg font-semibold text-ivory">
            {bookingHistory.length + 1}
          </p>
          <p className="text-[10px] text-ivory-muted md:text-xs">atendimentos no total</p>
        </Card>
        <Card className="flex flex-col items-center gap-0.5 p-3 text-center md:min-w-32 md:p-4">
          <p className="font-display text-lg font-semibold text-gold-light">
            {formatBRL(totalSpentHistory + nextBooking.value)}
          </p>
          <p className="text-[10px] text-ivory-muted md:text-xs">investido na barbearia</p>
        </Card>
      </div>

      <div className="flex gap-2 rounded-xl border border-border bg-surface p-1 md:w-fit">
        {(["futuras", "historico"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors md:px-6 md:py-2.5 md:text-base " +
              (tab === t
                ? "bg-gold text-bg"
                : "text-ivory-muted hover:text-ivory")
            }
          >
            {t === "futuras" ? "Futuras" : "Histórico"}
          </button>
        ))}
      </div>

      {tab === "futuras" ? (
        <Card className="flex flex-col gap-3 md:max-w-xl md:p-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-ivory md:text-lg">
                {bookingServices.map((s) => s.name).join(" + ")}
              </p>
              <p className="text-sm capitalize text-ivory-muted md:text-base">
                {formatDatePtBR(nextBooking.date)} às {nextBooking.time}
              </p>
            </div>
            <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 text-sm md:pt-3 md:text-base">
            <span className="text-ivory-muted">
              {nextBooking.paymentMethod === "local"
                ? "A pagar no salão"
                : "Valor pago"}
            </span>
            <span className="font-display font-semibold text-ivory md:text-lg">
              {formatBRL(nextBooking.value)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1">
              Reagendar
            </Button>
            <Button variant="secondary" className="flex-1 text-danger">
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-ivory-muted md:text-sm">
            Cancelamento até 24h antes: 100% de volta. Entre 24h e 6h: taxa
            de cancelamento aplicada.
          </p>
        </Card>
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
                    {formatDatePtBR(b.date)} às {b.time} · {paymentMethodLabel[b.paymentMethod]}
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
  );
}
