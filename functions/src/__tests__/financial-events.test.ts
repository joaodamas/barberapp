import { describe, expect, it } from "vitest";
import {
  calcularEventoFinanceiro,
  centavos,
  SEM_TAXA,
  taxaDoMetodo,
  type PaymentFees,
} from "../financial-events";

/**
 * Critérios de aceite do Bloco 1 — integridade do core financeiro.
 *
 * O que estes testes protegem: o fechamento de um mês não pode mudar porque
 * alguém alterou um cadastro depois. O percentual de comissão e a taxa de
 * pagamento são congelados na conclusão do atendimento, e o documento gravado
 * precisa ser reprodutível a partir dos próprios campos.
 */

const TAXAS: PaymentFees = { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 };

describe("taxa por forma de pagamento", () => {
  it("aplica a taxa cadastrada de cada método", () => {
    expect(taxaDoMetodo("pix", TAXAS)).toBe(0);
    expect(taxaDoMetodo("local", TAXAS)).toBe(0);
    expect(taxaDoMetodo("cartao", TAXAS)).toBe(3.49);
  });

  it("cartão usa a taxa de crédito enquanto a tela não separa débito", () => {
    /* Subestimar custo é pior que superestimar: o dono decide achando que
     * sobra mais do que sobra. */
    expect(taxaDoMetodo("cartao", TAXAS)).toBe(TAXAS.credito);
    expect(taxaDoMetodo("cartao", TAXAS)).toBeGreaterThan(TAXAS.debito);
  });

  it("barbearia que ainda não cadastrou taxa não recebe custo inventado", () => {
    expect(taxaDoMetodo("cartao", SEM_TAXA)).toBe(0);
    expect(taxaDoMetodo("pix", SEM_TAXA)).toBe(0);
  });
});

describe("cálculo do evento financeiro", () => {
  it("o exemplo do balcão: corte de R$ 50 no Pix, barbeiro a 40%", () => {
    const r = calcularEventoFinanceiro({
      valor: 50,
      metodo: "pix",
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });

    expect(r.commission).toEqual({
      commissionPct: 40,
      commissionBase: 50,
      commissionAmount: 20,
    });
    expect(r.payment).toMatchObject({
      grossAmount: 50,
      feePct: 0,
      feeAmount: 0,
      netAmount: 50,
    });
  });

  it("cartão desconta a taxa do líquido", () => {
    const r = calcularEventoFinanceiro({
      valor: 100,
      metodo: "cartao",
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });
    expect(r.payment.feeAmount).toBe(3.49);
    expect(r.payment.netAmount).toBe(96.51);
  });

  it("líquido é sempre bruto menos taxa", () => {
    for (const valor of [37.9, 50, 89.99, 120, 233.33]) {
      for (const metodo of ["pix", "cartao", "local"] as const) {
        const { payment } = calcularEventoFinanceiro({
          valor, metodo, commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
        });
        expect(centavos(payment.grossAmount - payment.feeAmount)).toBe(payment.netAmount);
      }
    }
  });

  it("barbeiro sem percentual próprio cai no padrão da casa", () => {
    // O cadastro inicial grava `commissionPct: null`, não ausente.
    for (const pct of [null, undefined]) {
      const r = calcularEventoFinanceiro({
        valor: 100, metodo: "pix", commissionPctDoBarbeiro: pct,
        padraoPct: 40, fees: TAXAS,
      });
      expect(r.commission.commissionPct).toBe(40);
      expect(r.commission.commissionAmount).toBe(40);
    }
  });

  it("cada barbeiro comissiona pelo percentual dele", () => {
    const rômulo = calcularEventoFinanceiro({
      valor: 100, metodo: "pix", commissionPctDoBarbeiro: 50, padraoPct: 40, fees: TAXAS,
    });
    const joão = calcularEventoFinanceiro({
      valor: 100, metodo: "pix", commissionPctDoBarbeiro: 30, padraoPct: 40, fees: TAXAS,
    });
    expect(rômulo.commission.commissionAmount).toBe(50);
    expect(joão.commission.commissionAmount).toBe(30);
  });

  it("não produz fração de centavo no documento", () => {
    const r = calcularEventoFinanceiro({
      valor: 33.33, metodo: "cartao", commissionPctDoBarbeiro: 33,
      padraoPct: 40, fees: TAXAS,
    });
    for (const v of [
      r.commission.commissionAmount, r.payment.feeAmount, r.payment.netAmount,
    ]) {
      expect(Number.isInteger(Math.round(v * 100))).toBe(true);
      expect(v).toBe(centavos(v));
    }
  });
});

describe("o histórico não muda quando o cadastro muda", () => {
  /* Este é o critério de aceite que originou o Bloco 1. Antes, a comissão era
   * lida de `staff.commissionPct` a cada leitura do DRE: renegociar em setembro
   * reescrevia agosto. */

  it("alterar a comissão do barbeiro não altera o atendimento já concluído", () => {
    // Dia 1 — Rômulo a 40%, atendimento de R$ 50.
    const dia1 = calcularEventoFinanceiro({
      valor: 50, metodo: "pix", commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
    });
    const gravado = { ...dia1.commission };

    // Dia 2 — Rômulo passa a 50%. O documento do dia 1 não é reescrito.
    const dia2 = calcularEventoFinanceiro({
      valor: 50, metodo: "pix", commissionPctDoBarbeiro: 50, padraoPct: 40, fees: TAXAS,
    });

    expect(gravado.commissionAmount).toBe(20);
    expect(gravado.commissionPct).toBe(40);
    expect(dia2.commission.commissionAmount).toBe(25); // vale só para o novo
  });

  it("alterar a taxa da maquininha não altera o pagamento já registrado", () => {
    const semTaxa: PaymentFees = { ...SEM_TAXA };
    const antigo = calcularEventoFinanceiro({
      valor: 100, metodo: "pix", commissionPctDoBarbeiro: 40, padraoPct: 40, fees: semTaxa,
    });
    const gravado = { ...antigo.payment };

    // A barbearia passa a pagar 1% no Pix.
    const novo = calcularEventoFinanceiro({
      valor: 100, metodo: "pix", commissionPctDoBarbeiro: 40, padraoPct: 40,
      fees: { ...semTaxa, pix: 1 },
    });

    expect(gravado.feePct).toBe(0);
    expect(gravado.netAmount).toBe(100);
    expect(novo.payment.feePct).toBe(1);
    expect(novo.payment.netAmount).toBe(99);
  });

  it("o documento é reprodutível a partir dos próprios campos", () => {
    /* O invariante que sustenta a auditoria: com base e percentual gravados,
     * dá para reconferir o valor sem consultar cadastro nenhum. Guardar só o
     * `commissionAmount` diria QUANTO foi pago, não COMO se chegou lá. */
    const { commission, payment } = calcularEventoFinanceiro({
      valor: 80, metodo: "cartao", commissionPctDoBarbeiro: 45, padraoPct: 40, fees: TAXAS,
    });

    expect(centavos((commission.commissionBase * commission.commissionPct) / 100))
      .toBe(commission.commissionAmount);
    expect(centavos((payment.grossAmount * payment.feePct) / 100))
      .toBe(payment.feeAmount);
  });

  it("mesma entrada sempre produz a mesma saída", () => {
    // Sem leitura de cadastro e sem relógio: reprocessar o gatilho grava o
    // mesmo documento, que é o que torna o `set` idempotente seguro.
    const entrada = {
      valor: 67.5, metodo: "cartao" as const, commissionPctDoBarbeiro: 40,
      padraoPct: 40, fees: TAXAS,
    };
    expect(calcularEventoFinanceiro(entrada)).toEqual(calcularEventoFinanceiro(entrada));
  });
});
