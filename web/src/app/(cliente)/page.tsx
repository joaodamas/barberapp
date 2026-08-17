"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Phone, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { WelcomeHeading } from "@/components/welcome-heading";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { BarberPoleDivider } from "@/components/ui/barber-pole-divider";
import { bookingStatusMeta } from "@/lib/booking-status";
import { formatBRL, formatDatePtBR } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { useLoyalty, useMyBookings, useServices } from "@/lib/db/use-shop-data";
import { OCCUPIES_SLOT } from "@/lib/domain";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { CalendarPlus } from "lucide-react";

export default function InicioPage() {
  const tenant = useTenant();
  const { user } = useAuth();
  const { items: minhas, status } = useMyBookings(user?.uid);
  const { items: services } = useServices();

  const hoje = new Date().toISOString().slice(0, 10);
  const futuras = minhas
    .filter((b) => b.date >= hoje && OCCUPIES_SLOT.includes(b.status))
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextBooking = futuras[0] ?? null;

  const bookingServices = nextBooking
    ? (nextBooking.serviceIds
        .map((id) => services.find((s) => s.id === id))
        .filter(Boolean) as Array<{ name: string }>)
    : [];
  const statusMeta = nextBooking ? bookingStatusMeta[nextBooking.status] : null;

  const loyalty = useLoyalty(user?.uid);
  const stampsLeft = loyalty.faltam;
  const barbershop = {
    name: tenant.brand.name,
    address: tenant.contact.address,
    whatsapp: tenant.contact.whatsapp,
  };

  return (
    <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-[1fr_360px] md:items-start md:gap-x-10 md:gap-y-10 md:pt-2">
      <div className="md:col-span-2 md:flex md:items-center md:justify-between md:gap-6">
        <WelcomeHeading />
        <Link href="/agendar" className="hidden md:block">
          <Button className="md:h-12 md:px-7 md:text-base">
            Agendar horário
            <ArrowRight size={16} />
          </Button>
        </Link>
      </div>

      <Link href="/agendar" className="md:hidden">
        <Button className="w-full">
          Agendar horário
          <ArrowRight size={16} />
        </Button>
      </Link>

      <section aria-labelledby="proximo-agendamento" className="md:col-start-1 md:row-start-2">
        <h2
          id="proximo-agendamento"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm"
        >
          Próximo agendamento
        </h2>
        {status === "carregando" && <LoadingRows rows={1} />}
        {status === "erro" && <ErroAoCarregar oQue="suas reservas" />}

        {status === "pronto" && !nextBooking && (
          <EmptyState
            icon={CalendarPlus}
            title="Você não tem horário marcado"
            description="Escolha o serviço e o melhor horário para você — leva menos de um minuto."
            actionLabel="Agendar agora"
            actionHref="/agendar"
          />
        )}

        {nextBooking && (
        <Card className="flex flex-col gap-3 md:p-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-ivory md:text-lg">
                {bookingServices.map((s) => s.name).join(" + ")}
              </p>
              <p className="text-sm capitalize text-ivory-muted md:text-base">
                {formatDatePtBR(nextBooking.date)} às {nextBooking.time}
              </p>
            </div>
            {statusMeta && <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>}
          </div>
          <BarberPoleDivider />
          <div className="flex items-center justify-between text-sm md:text-base">
            <span className="text-ivory-muted">
              {nextBooking.paymentMethod ? "Valor pago" : "A pagar no salão"}
            </span>
            <span className="font-display font-semibold text-ivory md:text-lg">
              {formatBRL(nextBooking.value)}
            </span>
          </div>
          <Link
            href="/reservas"
            className="text-sm font-medium text-gold-light transition-opacity hover:opacity-80 md:text-base"
          >
            Ver detalhes / reagendar →
          </Link>
        </Card>
        )}
      </section>

      <Link href="/planos" className="md:col-start-2 md:row-start-2">
        <Card
          interactive
          className="flex items-center gap-3 border-gold/30 bg-gradient-to-br from-surface to-surface-raised md:p-5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-light">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-ivory md:text-base">
              Vire mensalista e economize
            </p>
            <p className="text-xs text-ivory-muted md:text-sm">
              Corte ilimitado a partir de R$ 149/mês
            </p>
          </div>
          <ArrowRight size={16} className="shrink-0 text-ivory-muted" />
        </Card>
      </Link>

      <section aria-labelledby="fidelidade" className="md:col-start-2 md:row-start-3">
        <h2
          id="fidelidade"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm"
        >
          Fidelidade
        </h2>
        <Card className="flex flex-col gap-3 md:p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ivory md:text-base">
              {loyalty.stamps} de {loyalty.goal} carimbos
            </p>
            <p className="text-xs text-gold-light md:text-sm">
              {loyalty.podeResgatar
                ? `${loyalty.reward} liberado!`
                : `faltam ${stampsLeft} para ${loyalty.reward}`}
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
        </Card>
      </section>

      <section aria-labelledby="localizacao" className="md:col-start-1 md:row-start-3">
        <h2
          id="localizacao"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm"
        >
          {barbershop.name}
        </h2>
        <Card className="flex flex-col gap-3 md:p-6">
          <div className="flex items-center gap-2 text-sm text-ivory-muted md:text-base">
            <MapPin size={16} className="shrink-0 text-gold-light" />
            {barbershop.address}
          </div>
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
  );
}
