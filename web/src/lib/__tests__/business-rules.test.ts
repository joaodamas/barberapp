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

  /* A tela do painel mostra a devolução ANTES de gravar, e quem grava é o
   * `cancelBooking` com `shop.policies.cancellation`. Enquanto esta função só
   * sabia da constante do módulo, a barbearia com política própria via na tela
   * um número e o cliente recebia outro — sem erro em log nenhum. */
  it("respeita a política da barbearia, não a da plataforma", () => {
    const daBarbearia = {
      fullRefundHours: 48,
      partialRefundHours: 12,
      cancellationFeePct: 50,
    };

    /* 25h: integral pela política da plataforma (24h), parcial pela desta
     * barbearia (48h). É exatamente a faixa em que as duas contas divergiam. */
    expect(refundAmountFor({ ...base, hoursUntilStart: 25 }).tier).toBe("integral");
    const r = refundAmountFor({ ...base, hoursUntilStart: 25, policy: daBarbearia });
    expect(r.tier).toBe("parcial");
    expect(r.retainedPct).toBe(50);
    expect(r.amount).toBe(50);
  });

  it("sem política própria, continua valendo a da plataforma", () => {
    expect(refundAmountFor({ ...base, hoursUntilStart: 25, policy: undefined })).toMatchObject({
      amount: 100,
      tier: "integral",
    });
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

  /* P1-7 · o simulador da Loja anunciava o padrão da PLATAFORMA (40%) a uma
   * barbearia que combinou outro. A tela de Equipe já lia do tenant; a Loja
   * ficou para trás, e a Rodada 3.1 tornou a divergência visível: agora a
   * comissão nasce congelada com o percentual do barbeiro, então o número
   * anunciado no simulador não descrevia venda nenhuma. */
  it("respeita o percentual da barbearia, não o padrão da plataforma", () => {
    const r = splitSale({ price: 45, cost: 18, barberPct: 50 });
    expect(r.commission).toBeCloseTo(13.5);
    expect(r.commission).not.toBeCloseTo(27 * (commissionSplit.barberPct / 100));
  });

  it("percentual zero é uma escolha legítima, não ausência de valor", () => {
    /* Um `|| 40` no lugar do `??` transformaria "esta barbearia não paga
     * comissão de produto" no padrão da casa — foi o mesmo cuidado tomado em
     * `comissoes.ts`. */
    const r = splitSale({ price: 45, cost: 18, barberPct: 0 });
    expect(r.commission).toBe(0);
    expect(r.shopProfit).toBeCloseTo(27 - 27 * (taxRatePct / 100));
  });

  it("sem percentual explícito, mantém o padrão da plataforma", () => {
    /* O default preserva quem já chamava com dois argumentos. */
    expect(splitSale({ price: 45, cost: 18 }).commission).toBeCloseTo(
      splitSale({ price: 45, cost: 18, barberPct: commissionSplit.barberPct }).commission
    );
  });

  it("o imposto também vem da barbearia quando informado", () => {
    const r = splitSale({ price: 45, cost: 18, barberPct: 50, taxPct: 0 });
    expect(r.tax).toBe(0);
    expect(r.shopProfit).toBeCloseTo(13.5);
  });
});
