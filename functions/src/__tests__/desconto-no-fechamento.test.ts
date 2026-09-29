import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { descontoAplicavel, ehCortesia } from "../desconto";
import {
  brutoDoFatoCongelado,
  calcularEventoFinanceiro,
  descontoDaReconclusao,
  descontoDaReservaCongelado,
  SEM_TAXA,
  type PaymentFees,
} from "../financial-events";
import { decidirCobertura } from "../mensalistas";

/**
 * Desconto no fechamento — pedido do dono em 28/09.
 *
 * As quatro decisões que estes testes fixam do lado do servidor:
 *
 * 1. comissão e taxa da maquininha sobre o valor COBRADO;
 * 2. 100% é cortesia — sem pagamento, comissão sobre R$ 0,00, e NÃO é o
 *    caminho do mensalista;
 * 3. o desconto nunca passa do valor (limite no servidor, além da regra);
 * 4. numa reversão, o bruto e o desconto do fato são congelados juntos — sem
 *    isso a reconclusão descontaria duas vezes (P1-7).
 */

const TAXAS: PaymentFees = { ...SEM_TAXA, debito: 1.99, credito: 3.49 };

describe("o desconto que vale", () => {
  it("é o pedido, arredondado em centavo", () => {
    expect(descontoAplicavel({ valor: 50, discountAmount: 10 })).toBe(10);
    expect(descontoAplicavel({ valor: 45.9, discountAmount: 4.591 })).toBe(4.59);
  });

  it("nunca passa do valor — decisão 4 do dono", () => {
    expect(descontoAplicavel({ valor: 50, discountAmount: 80 })).toBe(50);
  });

  it("ausente, negativo ou ilegível vale zero", () => {
    for (const d of [undefined, null, "", "abc", -5, Number.NaN, Infinity]) {
      expect(descontoAplicavel({ valor: 50, discountAmount: d }), String(d)).toBe(0);
    }
  });

  it("100% é cortesia; valor zero SEM desconto não é", () => {
    expect(ehCortesia({ valor: 50, desconto: 50 })).toBe(true);
    expect(ehCortesia({ valor: 50, desconto: 49.99 })).toBe(false);
    expect(ehCortesia({ valor: 0, desconto: 0 })).toBe(false);
  });
});

describe("o evento financeiro com desconto", () => {
  it("R$ 50,00 com R$ 10,00 de desconto no crédito: taxa e comissão sobre R$ 40,00", () => {
    const r = calcularEventoFinanceiro({
      valor: 50,
      desconto: 10,
      metodo: "credit",
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });

    expect(r.commission).toEqual({
      commissionPct: 40,
      commissionBase: 40,
      commissionAmount: 16,
      originalAmount: 50,
      discountAmount: 10,
    });
    expect(r.payment.grossAmount).toBe(40);
    expect(r.payment.feeAmount).toBe(1.4); // 3,49% de 40,00
    expect(r.payment.netAmount).toBe(38.6);
    expect(r.payment.originalAmount).toBe(50);
    expect(r.payment.discountAmount).toBe(10);
    expect(r.cortesia).toBe(false);
  });

  it("sem desconto, os documentos saem exatamente como antes — sem campos novos", () => {
    const r = calcularEventoFinanceiro({
      valor: 50,
      metodo: "pix",
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });
    expect(r.commission).toEqual({ commissionPct: 40, commissionBase: 50, commissionAmount: 20 });
    expect(r.payment).not.toHaveProperty("discountAmount");
    expect(r.payment).not.toHaveProperty("originalAmount");
  });

  it("o servidor limita o desconto mesmo que a escrita peça mais", () => {
    const r = calcularEventoFinanceiro({
      valor: 50,
      desconto: 500,
      metodo: null,
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });
    expect(r.commission.commissionBase).toBe(0);
    expect(r.commission.discountAmount).toBe(50);
    expect(r.cortesia).toBe(true);
  });

  it("cortesia: comissão sobre R$ 0,00, com o bruto guardado na comissão", () => {
    const r = calcularEventoFinanceiro({
      valor: 50,
      desconto: 50,
      metodo: null,
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });
    expect(r.cortesia).toBe(true);
    expect(r.commission).toEqual({
      commissionPct: 40,
      commissionBase: 0,
      commissionAmount: 0,
      originalAmount: 50,
      discountAmount: 50,
    });
  });
});

describe("cortesia não é o caminho do mensalista", () => {
  /* O plano, se fosse consultado com `metodo: null`, COBRIRIA este corte — e a
   * cortesia gastaria uma vaga da cota que o cliente pagou. O gatilho desvia
   * antes; este teste fixa que o desvio é necessário, e o de fonte abaixo
   * fixa que ele existe. */
  it("com `metodo: null`, a decisão do plano cobriria — por isso a cortesia não pergunta a ele", () => {
    const cobertura = decidirCobertura({
      valor: 50,
      data: "2026-09-28",
      assinatura: {
        id: "sub-1",
        status: "ativo",
        startedAt: "2026-09-01",
        canceledAt: null,
        planId: "ilimitado",
        planName: "Ilimitado",
        unlimited: true,
        servicesIncluded: 0,
      },
      jaCobertosNaCompetencia: 0,
      metodoInformado: null,
    });
    expect(cobertura.tipo).toBe("plano");
  });

  it("o gatilho grava a cortesia como fato próprio e não cria pagamento", () => {
    const fonte = readFileSync(resolve(__dirname, "..", "financial-events.ts"), "utf8");
    expect(fonte).toMatch(/cortesia\s*\?\s*\{\s*tipo:\s*"avulso",\s*motivo:\s*"cortesia"/);
    expect(fonte).toMatch(/if \(cortesia\) \{\s*tx\.delete\(pagamentoRef\);\s*return;/);
  });
});

describe("reversão congela o bruto E o desconto — P1-7", () => {
  it("pagamento com desconto: congela o bruto de TABELA, não o cobrado", () => {
    /* Congelar `grossAmount` (40) e reaplicar o desconto (10) na reconclusão
     * daria R$ 30,00 — o desconto em dobro. */
    expect(
      brutoDoFatoCongelado({ grossAmount: 40, originalAmount: 50, discountAmount: 10 }, null)
    ).toEqual({ grossAmount: 50, discountAmount: 10 });
  });

  it("pagamento sem desconto: exatamente o que sempre foi congelado", () => {
    expect(brutoDoFatoCongelado({ grossAmount: 50 }, { commissionBase: 50 })).toEqual({
      grossAmount: 50,
    });
  });

  it("cortesia: sem pagamento, o par sai da comissão", () => {
    expect(
      brutoDoFatoCongelado(null, { commissionBase: 0, originalAmount: 50, discountAmount: 50 })
    ).toEqual({ grossAmount: 50, discountAmount: 50 });
  });

  it("coberto pelo plano: nada a congelar, como antes", () => {
    expect(brutoDoFatoCongelado(null, { commissionBase: 50 })).toBeNull();
    expect(brutoDoFatoCongelado(null, null)).toBeNull();
  });

  it("reconcluir com o congelado reproduz o mesmo fato", () => {
    const original = calcularEventoFinanceiro({
      valor: 50,
      desconto: 10,
      metodo: "pix",
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });
    const congelado = brutoDoFatoCongelado(original.payment, original.commission);
    const reconcluido = calcularEventoFinanceiro({
      valor: congelado!.grossAmount,
      desconto: congelado!.discountAmount,
      metodo: "pix",
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });
    expect(reconcluido.payment).toEqual(original.payment);
    expect(reconcluido.commission).toEqual(original.commission);
  });

  it("a reversão apaga o desconto da reserva junto com o método", () => {
    const fonte = readFileSync(resolve(__dirname, "..", "financial-events.ts"), "utf8");
    for (const campo of ["discountAmount", "discountInput", "discountReason", "discountBy", "discountAt"]) {
      expect(fonte, campo).toMatch(new RegExp(`${campo}: FieldValue\\.delete\\(\\)`));
    }
  });
});

describe("a reconclusão devolve o desconto congelado à RESERVA — revisão do PR #82", () => {
  /* A reversão apaga os campos de desconto da reserva, e a reconclusão usava
   * o congelado só no pagamento: as leituras da tela (`valorCobrado`,
   * "Descontos do mês", gasto do cliente) voltavam ao preço cheio. */
  const reserva = {
    status: "completed",
    value: 50,
    discountAmount: 10,
    discountInput: { tipo: "pct", valor: 20 },
    discountReason: "fidelidade",
    discountBy: "dono-1",
    discountAt: "carimbo-do-servidor",
  };

  it("a reversão congela o que o dono digitou, o motivo e a autoria", () => {
    expect(descontoDaReservaCongelado(reserva)).toEqual({
      discountInput: { tipo: "pct", valor: 20 },
      discountReason: "fidelidade",
      discountBy: "dono-1",
      discountAt: "carimbo-do-servidor",
    });
    expect(descontoDaReservaCongelado({ value: 50 })).toBeNull();
    expect(descontoDaReservaCongelado(undefined)).toBeNull();
  });

  it("a reconclusão regrava o valor congelado com a autoria congelada", () => {
    const congelado = descontoDaReservaCongelado(reserva);
    expect(descontoDaReconclusao({ desconto: 10, congelado })).toEqual({
      discountAmount: 10,
      ...congelado,
    });
  });

  it("ciclo sem autoria congelada ainda regrava o valor", () => {
    expect(descontoDaReconclusao({ desconto: 10, congelado: null })).toEqual({
      discountAmount: 10,
      discountInput: { tipo: "valor", valor: 10 },
      discountReason: null,
      discountBy: null,
      discountAt: null,
    });
  });

  it("congelado sem desconto: `null` — o gatilho apaga um desconto que não valeu", () => {
    expect(descontoDaReconclusao({ desconto: 0, congelado: null })).toBeNull();
  });

  it("o gatilho congela na reversão e regrava na materialização da reconclusão", () => {
    const fonte = readFileSync(resolve(__dirname, "..", "financial-events.ts"), "utf8");
    expect(fonte).toMatch(/descontoDaReserva:\s*descontoDaReservaCongelado\(atual\.data\(\)\)/);
    expect(fonte).toMatch(/reconclusao && ciclo\?\.pagamento \? camposDeDescontoNaReserva/);
  });
});
