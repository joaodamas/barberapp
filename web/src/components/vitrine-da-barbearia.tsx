"use client";

import Link from "next/link";
import { ArrowRight, Clock, MapPin, Phone, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingRows } from "@/components/ui/empty-state";
import { useTenant } from "@/lib/tenant-context";
import { usePlans, useServices } from "@/lib/db/use-shop-data";
import { formatBRL } from "@/lib/format";

/**
 * O que o link da barbearia mostra a quem ainda não tem conta.
 *
 * Antes era só uma tela de login — sem serviço, preço, endereço, e sem dizer
 * de que barbearia se tratava. Criar conta com e-mail e senha antes de saber
 * quanto custa um corte é o ponto exato em que o cliente desiste (rodada E2E
 * de 23/09). Agora ele vê a barbearia, escolhe serviço e horário, e a conta é
 * pedida só para confirmar.
 */
export function VitrineDaBarbearia() {
  const tenant = useTenant();
  const { items: servicos, status } = useServices();
  const { items: planos } = usePlans();

  const ativos = servicos.filter((s) => s.active !== false && Number(s.price) > 0);
  const planosAtivos = planos.filter((p) => p.active !== false && Number(p.price) > 0);
  const maisBarato = planosAtivos.length
    ? planosAtivos.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a))
    : null;
  const { address, whatsapp } = tenant.contact;

  return (
    <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-[1fr_360px] md:items-start md:gap-x-10 md:pt-2">
      <div className="md:col-span-2">
        <p className="text-sm text-ink-muted md:text-base">Agende na</p>
        <h1 className="text-2xl text-ink md:text-4xl md:tracking-tight">{tenant.brand.name}</h1>
      </div>

      <section aria-labelledby="servicos" className="flex flex-col gap-3">
        <h2
          id="servicos"
          className="text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm"
        >
          Serviços
        </h2>
        {status === "carregando" && <LoadingRows rows={3} />}
        {status === "pronto" && ativos.length === 0 && (
          <Card className="text-sm text-ink-muted">
            A barbearia ainda está montando o cardápio. Fale com ela pelo WhatsApp.
          </Card>
        )}
        {ativos.length > 0 && (
          <Card className="flex flex-col divide-y divide-border p-0">
            {ativos.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink md:text-base">{s.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-muted">
                    <Clock size={12} /> {s.durationMin} min
                  </p>
                </div>
                <span className="shrink-0 font-display font-semibold text-ink">
                  {s.priceFrom ? "a partir de " : ""}
                  {formatBRL(Number(s.price))}
                </span>
              </div>
            ))}
          </Card>
        )}
        <Link href="/agendar">
          <Button className="w-full md:h-12 md:text-base">
            Ver horários e agendar
            <ArrowRight size={16} />
          </Button>
        </Link>
        <p className="text-center text-xs text-ink-muted">
          Você escolhe o horário antes de criar conta.
        </p>
      </section>

      <div className="flex flex-col gap-5">
        {tenant.features.subscriptions === true && maisBarato && (
          <Link href="/planos">
            <Card interactive className="flex items-center gap-3 border-gold/30">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-strong">
                <Sparkles size={18} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">Planos de mensalista</p>
                <p className="text-xs text-ink-muted">
                  {planosAtivos.length > 1 ? "A partir de " : `${maisBarato.name} · `}
                  {formatBRL(Number(maisBarato.price))}/mês
                </p>
              </div>
              <ArrowRight size={16} className="shrink-0 text-ink-muted" />
            </Card>
          </Link>
        )}

        {(address || whatsapp) && (
          <Card className="flex flex-col gap-3">
            {address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink"
              >
                <MapPin size={16} className="shrink-0 text-gold-strong" />
                {address}
              </a>
            )}
            {whatsapp && (
              <div className="flex gap-2">
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button variant="secondary" className="w-full">
                    WhatsApp
                  </Button>
                </a>
                <a href={`tel:+${whatsapp}`} className="flex-1">
                  <Button variant="secondary" className="w-full">
                    <Phone size={16} />
                    Ligar
                  </Button>
                </a>
              </div>
            )}
          </Card>
        )}

        <p className="text-center text-xs text-ink-muted">
          Já é cliente?{" "}
          <Link href="/login?next=/" className="font-medium text-gold-strong">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
