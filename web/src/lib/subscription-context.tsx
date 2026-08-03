"use client";

import { createContext, useContext, useState } from "react";
import type { PlanDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * Assinatura do cliente logado.
 *
 * Existia só dentro da tela de Planos, num `useState` local: assinar um plano
 * e ir ao Perfil mostrava "Você ainda não é mensalista" — duas telas
 * discordando sobre o mesmo fato. Quando o Firestore entrar, este provider
 * troca o `useState` por uma assinatura do documento e mais nada muda.
 */
export type Billing = "cartao" | "pix";

export type Plan = Doc<PlanDoc>;

type SubscriptionState = {
  plan: Plan | null;
  billing: Billing;
  /** Data ISO da próxima cobrança, ou `null` se não há plano ativo. */
  nextChargeISO: string | null;
  subscribe: (plan: Plan, billing: Billing) => void;
  cancel: () => void;
};

const SubscriptionContext = createContext<SubscriptionState>({
  plan: null,
  billing: "cartao",
  nextChargeISO: null,
  subscribe: () => {},
  cancel: () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [billing, setBilling] = useState<Billing>("cartao");
  const [nextChargeISO, setNextChargeISO] = useState<string | null>(null);

  function subscribe(nextPlan: Plan, nextBilling: Billing) {
    setPlan(nextPlan);
    setBilling(nextBilling);
    setNextChargeISO(addOneMonthISO(new Date()));
  }

  function cancel() {
    setPlan(null);
    setNextChargeISO(null);
  }

  return (
    <SubscriptionContext.Provider
      value={{ plan, billing, nextChargeISO, subscribe, cancel }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

/**
 * Mesmo dia do mês seguinte — e, se esse dia não existir, o último dia do mês.
 *
 * `d.setMonth(d.getMonth() + 1)` transborda: assinando em 31/01 a "próxima
 * cobrança" caía em 03 de março, pulando fevereiro inteiro.
 */
export function addOneMonthISO(from: Date) {
  const year = from.getFullYear();
  const month = from.getMonth();
  const day = from.getDate();
  const lastDayOfNextMonth = new Date(year, month + 2, 0).getDate();
  const target = new Date(year, month + 1, Math.min(day, lastDayOfNextMonth));
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${mm}-${dd}`;
}
