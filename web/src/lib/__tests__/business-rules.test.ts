import { describe, expect, it } from "vitest";
import {
  cancellationPolicy,
  commissionSplit,
  refundAmountFor,
  splitSale,
  taxRatePct,
} from "@/lib/business-rules";

describe("política de cancelamento", () => {
  const base = { value: 100, paymentMethod: "pix" as const };

  it("devolve 100% acima da janela integral", () => {
    expect(refundAmountFor({ ...base, hoursUntilStart: 25 })).toMatchObject({
      amount: 100,
      tier: "integral",
    });
  });

  it("retém exatamente a taxa configurada na faixa intermediária", () => {
    const r = refundAmountFor({ ...base, hoursUntilStart: 10 });
    expect(r.tier).toBe("parcial");
    expect(r.retainedPct).toBe(cancellationPolicy.cancellationFeePct);
    expect(r.amount).toBe(100 * (1 - cancellationPolicy.cancellationFeePct / 100));
  });

  it("não devolve nada abaixo da janela mínima", () => {
    expect(refundAmountFor({ ...base, hoursUntilStart: 1 })).toMatchObject({
      amount: 0,
      tier: "sem_devolucao",
    });
  });

  it("não devolve nada quando o pagamento seria no salão", () => {
    expect(
      refundAmountFor({ value: 100, paymentMethod: null, hoursUntilStart: 48 })
    ).toMatchObject({ amount: 0, tier: "sem_pagamento" });
  });

  it("trata horário já passado como sem devolução", () => {
    expect(refundAmountFor({ ...base, hoursUntilStart: -3 }).amount).toBe(0);
  });

  it("mantém a taxa dentro da faixa do PRD (20–30%)", () => {
    expect(cancellationPolicy.cancellationFeePct).toBeGreaterThanOrEqual(20);
    expect(cancellationPolicy.cancellationFeePct).toBeLessThanOrEqual(30);
  });
});

describe("rateio de venda", () => {
  it("divide o lucro bruto conforme o split, nunca o preço cheio", () => {
    const r = splitSale({ price: 45, cost: 18 });
    expect(r.grossProfit).toBe(27);
    expect(r.commission).toBeCloseTo(27 * (commissionSplit.barberPct / 100));
    expect(r.tax).toBeCloseTo(27 * (taxRatePct / 100));
  });

  it("soma das partes é o lucro bruto", () => {
    const r = splitSale({ price: 45, cost: 18 });
    expect(r.commission + r.tax + r.shopProfit).toBeCloseTo(r.grossProfit);
  });

  it("não gera lucro negativo quando o preço é menor que o custo", () => {
    expect(splitSale({ price: 10, cost: 30 }).grossProfit).toBe(0);
  });

  it("barbeiro + barbearia somam 100%", () => {
    expect(commissionSplit.barberPct + commissionSplit.shopPct).toBe(100);
  });
});
