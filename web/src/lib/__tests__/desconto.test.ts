import { describe, expect, it } from "vitest";
import {
  calcularDesconto,
  camposDoDesconto,
  descontosDoPeriodo,
  ehCortesia,
  lerNumeroDigitado,
  valorCobrado,
} from "@/lib/desconto";
import { liquidacaoDoAtendimento } from "@/lib/booking-status";
import { receitaDeServico } from "@/lib/fontes-financeiras";
import { mesPeriodo } from "@/lib/analytics-periodo";
import type { BookingDoc, PaymentDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * Desconto no fechamento — pedido do dono em 28/09, do lado da tela.
 *
 * O servidor limita e decide a cortesia (`functions/src/desconto.ts`); aqui
 * mora a conversão do que o dono digitou em reais, que é o número que ele vê
 * em "Cobrar R$ X" e o que vai para a reserva.
 */

describe("o que o dono digita", () => {
  it("aceita vírgula — é o teclado do celular brasileiro", () => {
    expect(lerNumeroDigitado("10,50")).toBe(10.5);
    expect(lerNumeroDigitado("10.5")).toBe(10.5);
    expect(lerNumeroDigitado(" 15 ")).toBe(15);
    expect(lerNumeroDigitado("R$ 5,00")).toBe(5);
    expect(lerNumeroDigitado("10%")).toBe(10);
    // O meio da digitação não acusa erro.
    expect(lerNumeroDigitado("5,")).toBe(5);
    expect(lerNumeroDigitado(",5")).toBe(0.5);
  });

  it("vazio ou ilegível é `null`, nunca zero disfarçado", () => {
    for (const t of ["", "  ", "abc", "1.000,00", "-5", "5,,", "5x"]) {
      expect(lerNumeroDigitado(t), t).toBeNull();
    }
  });
});

describe("R$ ou % — decisão 1 do dono", () => {
  it("em reais: cobra o valor menos o desconto", () => {
    expect(calcularDesconto({ valor: 50, tipo: "valor", entrada: 10 })).toEqual({
      desconto: 10,
      cobrar: 40,
      cortesia: false,
      excedeu: false,
    });
  });

  it("em percentual: converte em reais", () => {
    const r = calcularDesconto({ valor: 50, tipo: "pct", entrada: 10 });
    expect(r.desconto).toBe(5);
    expect(r.cobrar).toBe(45);
  });

  it("arredonda em centavo", () => {
    // 12,5% de R$ 45,00 = 5,625 → 5,63
    expect(calcularDesconto({ valor: 45, tipo: "pct", entrada: 12.5 }).desconto).toBe(5.63);
    // 10% de R$ 45,90 = 4,59 — sem 4.590000000000001
    const r = calcularDesconto({ valor: 45.9, tipo: "pct", entrada: 10 });
    expect(r.desconto).toBe(4.59);
    expect(r.cobrar).toBe(41.31);
    expect(calcularDesconto({ valor: 50, tipo: "valor", entrada: 3.333 }).desconto).toBe(3.33);
  });

  it("campo vazio é sem desconto", () => {
    expect(calcularDesconto({ valor: 50, tipo: "valor", entrada: null })).toEqual({
      desconto: 0,
      cobrar: 50,
      cortesia: false,
      excedeu: false,
    });
  });
});

describe("nunca acima do valor — decisão 4 do dono", () => {
  it("R$ acima do valor: avisa (excedeu) e o número exibido para no valor", () => {
    const r = calcularDesconto({ valor: 50, tipo: "valor", entrada: 60 });
    expect(r.excedeu).toBe(true);
    expect(r.desconto).toBe(50);
    expect(r.cobrar).toBe(0);
  });

  it("% acima de 100: avisa", () => {
    expect(calcularDesconto({ valor: 50, tipo: "pct", entrada: 150 }).excedeu).toBe(true);
  });

  it("entrada que excedeu NÃO vira campo na reserva — a tela não limita em silêncio", () => {
    const calculo = calcularDesconto({ valor: 50, tipo: "valor", entrada: 60 });
    expect(camposDoDesconto({ calculo, tipo: "valor", entrada: 60, motivo: null, uid: "dono" })).toBeNull();
  });
});

describe("100% é cortesia — decisão 2 do dono", () => {
  it("em % e em R$", () => {
    expect(calcularDesconto({ valor: 50, tipo: "pct", entrada: 100 }).cortesia).toBe(true);
    expect(calcularDesconto({ valor: 50, tipo: "valor", entrada: 50 }).cortesia).toBe(true);
    expect(calcularDesconto({ valor: 50, tipo: "valor", entrada: 49.99 }).cortesia).toBe(false);
  });

  it("serviço de R$ 0,00 sem desconto não é cortesia", () => {
    expect(calcularDesconto({ valor: 0, tipo: "valor", entrada: null }).cortesia).toBe(false);
  });

  it("a agenda diz \"Cortesia\", e não \"Não informado\", antes mesmo do gatilho", () => {
    const l = liquidacaoDoAtendimento({
      status: "completed",
      paymentOrigin: "in_person",
      paymentMethod: null,
      value: 50,
      discountAmount: 50,
    });
    expect(l.label).toBe("Cortesia");
    expect(l.cortesia).toBe(true);
  });

  it("a marca do servidor também basta", () => {
    expect(
      ehCortesia({ value: 50, cobertura: { tipo: "avulso", motivo: "cortesia", valorCoberto: 0 } })
    ).toBe(true);
    expect(
      ehCortesia({
        value: 50,
        discountAmount: 50,
        cobertura: {
          tipo: "plano",
          subscriptionId: "s",
          planId: "p",
          planName: "Ilimitado",
          competencia: "2026-09",
          valorCoberto: 50,
          usoNaCompetencia: 1,
          cota: null,
        },
      })
    ).toBe(false);
  });
});

describe("os campos da reserva", () => {
  it("guardam o número em R$, o que foi digitado, o motivo e quem deu", () => {
    const calculo = calcularDesconto({ valor: 50, tipo: "pct", entrada: 10 });
    expect(
      camposDoDesconto({ calculo, tipo: "pct", entrada: 10, motivo: "fidelidade", uid: "dono-1" })
    ).toEqual({
      discountAmount: 5,
      discountInput: { tipo: "pct", valor: 10 },
      discountReason: "fidelidade",
      discountBy: "dono-1",
    });
  });

  it("sem desconto, nenhum campo — a escrita fica igual à de antes", () => {
    const calculo = calcularDesconto({ valor: 50, tipo: "valor", entrada: 0 });
    expect(camposDoDesconto({ calculo, tipo: "valor", entrada: 0, motivo: "outro", uid: "d" })).toBeNull();
  });
});

describe("as leituras que falam de dinheiro usam o cobrado", () => {
  const reserva = (id: string, extra: Partial<BookingDoc> = {}): Doc<BookingDoc> =>
    ({
      id,
      clientId: "c1",
      staffId: "b1",
      clientName: "Cliente",
      clientWhatsapp: "",
      serviceIds: ["corte"],
      date: "2026-09-28",
      time: "10:00",
      status: "completed",
      value: 50,
      paymentOrigin: "in_person",
      paymentMethod: "pix",
      ...extra,
    }) as Doc<BookingDoc>;

  it("`valorCobrado` tira o desconto e nunca fica negativo", () => {
    expect(valorCobrado({ value: 50, discountAmount: 10 })).toBe(40);
    expect(valorCobrado({ value: 50 })).toBe(50);
    expect(valorCobrado({ value: 50, discountAmount: 80 })).toBe(0);
  });

  it("receita de serviço: fallback no cobrado, e a cortesia fica de fora", () => {
    const r = receitaDeServico({
      bookings: [
        reserva("com-desconto", { discountAmount: 10 }),
        reserva("cortesia", { paymentMethod: null, discountAmount: 50 }),
        reserva("com-pagamento", { discountAmount: 5 }),
      ],
      payments: [
        {
          id: "pagamento_com-pagamento",
          origin: "servico",
          bookingId: "com-pagamento",
          clientId: "c1",
          date: "2026-09-28",
          paymentOrigin: "in_person",
          paymentMethod: "pix",
          grossAmount: 45,
          originalAmount: 50,
          discountAmount: 5,
          feePct: 0,
          feeAmount: 0,
          netAmount: 45,
        } as Doc<PaymentDoc>,
      ],
      refunds: [],
      periodo: mesPeriodo("2026-09"),
    });
    expect(r.bruta).toBe(85); // 40 (fallback) + 45 (pagamento)
    expect(r.quantidade).toBe(2);
    expect(r.semFatoMaterializado).toBe(1);
  });

  it("Descontos do mês: soma parciais e cortesias, ignora coberto e outros meses", () => {
    const d = descontosDoPeriodo(
      [
        reserva("a", { discountAmount: 10 }),
        reserva("b", { paymentMethod: null, discountAmount: 50 }),
        reserva("c"),
        reserva("d", { discountAmount: 7, date: "2026-08-30" }),
        reserva("e", { discountAmount: 5, status: "confirmed" }),
        reserva("f", {
          discountAmount: 5,
          cobertura: {
            tipo: "plano",
            subscriptionId: "s",
            planId: "p",
            planName: "Ilimitado",
            competencia: "2026-09",
            valorCoberto: 50,
            usoNaCompetencia: 1,
            cota: null,
          },
        }),
      ],
      mesPeriodo("2026-09")
    );
    expect(d).toEqual({ total: 60, quantidade: 2, cortesias: 1 });
  });
});
