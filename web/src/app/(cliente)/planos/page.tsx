"use client";

import { useState } from "react";
import { Check, CreditCard, QrCode, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { formatBRL, formatDateShortPtBR, safeDiv } from "@/lib/format";
import { plans } from "@/lib/mock-data";
import {
  addOneMonthISO,
  useSubscription,
  type Billing,
  type Plan,
} from "@/lib/subscription-context";

const BILLING_LABEL: Record<Billing, string> = {
  cartao: "Cartão de crédito recorrente",
  pix: "Pix mensal",
};

export default function PlanosPage() {
  const {
    plan: activePlan,
    billing: activeBilling,
    nextChargeISO,
    subscribe,
    cancel,
  } = useSubscription();

  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [billing, setBilling] = useState<Billing>("cartao");
  const [confirmedPlan, setConfirmedPlan] = useState<Plan | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const activePlanId = activePlan?.id ?? null;

  function openCheckout(plan: Plan) {
    setBilling("cartao");
    setCheckoutPlan(plan);
  }

  function confirmSubscription() {
    if (!checkoutPlan) return;
    subscribe(checkoutPlan, billing);
    setConfirmedPlan(checkoutPlan);
    setCheckoutPlan(null);
  }

  function confirmCancellation() {
    cancel();
    setCancelOpen(false);
  }

  return (
    <div className="flex flex-col gap-5 pt-1 md:gap-8 md:pt-2">
      <div>
        <p className="text-sm text-ivory-muted md:text-base">Mensalistas</p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Planos</h1>
      </div>

      {activePlan && (
        <Card className="flex flex-col gap-3 border-gold/40 bg-gradient-to-br from-surface to-surface-raised md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-light">
              <Check size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ivory md:text-base">
                Plano {activePlan.name} ativo
              </p>
              <p className="text-xs text-ivory-muted md:text-sm">
                {BILLING_LABEL[activeBilling]} · próxima cobrança em {nextChargeISO ? formatDateShortPtBR(nextChargeISO) : "—"}
              </p>
            </div>
          </div>
          <Button variant="secondary" className="text-danger" onClick={() => setCancelOpen(true)}>
            Cancelar plano
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-3 pb-4 md:grid md:grid-cols-3 md:gap-5 md:pb-0">
        {plans.map((plan) => {
          const breakEvenVisits = Math.max(1, Math.ceil(safeDiv(plan.price, plan.priceAvulso, 1)));
          const savingsPct = Math.round((1 - safeDiv(plan.price, plan.priceAvulso, 1)) * 100);
          const isActive = plan.id === activePlanId;
          return (
            /* O card inteiro era um <div onClick> com um <button> dentro:
             * inalcançável por teclado e com interativo aninhado. A ação vive
             * só no botão; o card mantém o realce no hover via `group`. */
            <Card
              key={plan.id}
              interactive
              className={
                "group flex flex-col gap-3 md:gap-4 md:p-6 " +
                (isActive
                  ? "border-success/50"
                  : plan.highlight
                    ? "border-gold/50 bg-gradient-to-br from-surface to-surface-raised md:shadow-[var(--shadow-gold)]"
                    : "")
              }
            >
              {isActive ? (
                <Pill tone="success" className="w-fit">
                  <Check size={12} /> Seu plano
                </Pill>
              ) : (
                plan.highlight && (
                  <Pill tone="gold" className="w-fit">
                    <Sparkles size={12} /> Mais popular
                  </Pill>
                )
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
                    A partir da {breakEvenVisits}ª visita no mês, o plano já compensa
                    (avulso: {formatBRL(plan.priceAvulso)}/corte)
                  </>
                ) : (
                  <>
                    <span className="line-through">{formatBRL(plan.priceAvulso)}</span> no
                    avulso · economize {savingsPct}%
                  </>
                )}
              </p>
              <Button
                variant={isActive ? "secondary" : plan.highlight ? "primary" : "secondary"}
                className="w-full md:mt-2"
                disabled={isActive}
                onClick={() => openCheckout(plan)}
              >
                {isActive ? "Plano ativo" : "Assinar"}
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
          Cartão de crédito recorrente — cobrança automática todo mês, sem ação sua.
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

      <Modal
        open={!!checkoutPlan}
        onClose={() => setCheckoutPlan(null)}
        title={`Assinar ${checkoutPlan?.name ?? ""}`}
        description={`${formatBRL(checkoutPlan?.price ?? 0)}/mês · cancele quando quiser`}
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCheckoutPlan(null)}>
              Voltar
            </Button>
            <Button onClick={confirmSubscription}>Confirmar assinatura</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
            Forma de cobrança
          </p>
          {(["cartao", "pix"] as Billing[]).map((option) => {
            const Icon = option === "cartao" ? CreditCard : QrCode;
            return (
              <button
                key={option}
                onClick={() => setBilling(option)}
                className={
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors " +
                  (billing === option
                    ? "border-gold bg-gold/10"
                    : "border-border hover:border-gold/40")
                }
              >
                <Icon
                  size={18}
                  className={billing === option ? "text-gold-light" : "text-ivory-muted"}
                />
                <div className="flex-1">
                  <p className="text-sm text-ivory">{BILLING_LABEL[option]}</p>
                  <p className="text-xs text-ivory-muted">
                    {option === "cartao"
                      ? "Cobrado automaticamente todo mês"
                      : "Lembrete no WhatsApp antes do vencimento"}
                  </p>
                </div>
              </button>
            );
          })}
          <p className="text-xs text-ivory-muted">
            Primeira cobrança hoje. A próxima cai em {formatDateShortPtBR(addOneMonthISO(new Date()))}.
          </p>
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar plano"
        description={activePlan ? `Plano ${activePlan.name}` : undefined}
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Manter plano
            </Button>
            <Button
              className="bg-danger text-white hover:bg-danger/90"
              onClick={confirmCancellation}
            >
              Confirmar cancelamento
            </Button>
          </>
        }
      >
        <p className="text-sm text-ivory-muted">
          Seu plano continua valendo até o fim do ciclo já pago
          {nextChargeISO ? ` (${formatDateShortPtBR(nextChargeISO)})` : ""}. Depois
          disso, os atendimentos voltam a ser cobrados no avulso.
        </p>
      </Modal>

      <Modal
        open={!!confirmedPlan}
        onClose={() => setConfirmedPlan(null)}
        title="Plano ativado!"
        className="max-w-sm"
        footer={<Button onClick={() => setConfirmedPlan(null)}>Entendi</Button>}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <Check size={24} />
          </div>
          <p className="text-sm text-ivory">
            Seu plano <strong>{confirmedPlan?.name}</strong> já está valendo. Enviamos a
            confirmação no seu WhatsApp.
          </p>
        </div>
      </Modal>
    </div>
  );
}
