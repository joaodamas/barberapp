"use client";

import { Check, CreditCard, QrCode, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { formatBRL } from "@/lib/format";
import { plans } from "@/lib/mock-data";

export default function PlanosPage() {
  return (
    <div className="flex flex-col gap-5 pt-1 md:gap-8 md:pt-2">
      <div>
        <p className="text-sm text-ivory-muted md:text-base">Mensalistas</p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Planos</h1>
      </div>

      <div className="flex flex-col gap-3 pb-4 md:grid md:grid-cols-3 md:gap-5 md:pb-0">
        {plans.map((plan) => {
          const breakEvenVisits = Math.ceil(plan.price / plan.priceAvulso);
          const savingsPct = Math.round(
            (1 - plan.price / plan.priceAvulso) * 100
          );
          return (
            <Card
              key={plan.id}
              interactive
              className={
                "flex flex-col gap-3 md:gap-4 md:p-6 " +
                (plan.highlight
                  ? "border-gold/50 bg-gradient-to-br from-surface to-surface-raised md:shadow-[var(--shadow-gold)]"
                  : "")
              }
            >
              {plan.highlight && (
                <Pill tone="gold" className="w-fit">
                  <Sparkles size={12} /> Mais popular
                </Pill>
              )}
              <div>
                <p className="text-ivory md:text-lg">{plan.name}</p>
                <p className="text-xs text-ivory-muted md:text-sm">{plan.description}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold text-gold-light md:text-4xl">
                  {formatBRL(plan.price)}
                </span>
                <span className="text-xs text-ivory-muted md:text-sm">/mês</span>
              </div>
              <p className="text-xs text-ivory-muted md:text-sm">
                {plan.unlimited ? (
                  <>
                    A partir da {breakEvenVisits}ª visita no mês, o plano já
                    compensa (avulso: {formatBRL(plan.priceAvulso)}/corte)
                  </>
                ) : (
                  <>
                    <span className="line-through">
                      {formatBRL(plan.priceAvulso)}
                    </span>{" "}
                    no avulso · economize {savingsPct}%
                  </>
                )}
              </p>
              <Button variant={plan.highlight ? "primary" : "secondary"} className="w-full md:mt-2">
                Assinar
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="flex flex-col gap-3 md:max-w-2xl md:gap-4 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
          Como funciona a cobrança
        </p>
        <div className="flex items-start gap-2 text-sm text-ivory-muted md:text-base">
          <CreditCard size={16} className="mt-0.5 shrink-0 text-gold-light" />
          Cartão de crédito recorrente — cobrança automática todo mês, sem
          ação sua.
        </div>
        <div className="flex items-start gap-2 text-sm text-ivory-muted md:text-base">
          <QrCode size={16} className="mt-0.5 shrink-0 text-gold-light" />
          Ou Pix mensal, com lembrete enviado no WhatsApp antes do vencimento.
        </div>
        <div className="flex items-start gap-2 text-sm text-ivory-muted md:text-base">
          <Check size={16} className="mt-0.5 shrink-0 text-success" />
          Cancele quando quiser — vale até o fim do ciclo já pago.
        </div>
      </Card>
    </div>
  );
}
