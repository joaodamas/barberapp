import { describe, expect, it } from "vitest";
import {
  calcularCaixinha,
  documentoDePagamento,
  estornoDaCaixinha,
  idDaComissaoDaCaixinha,
  idDoEstornoDaCaixinha,
  idDoPagamento,
  somarLinhasDaCaixinha,
  valoresDoPagamento,
} from "../payments";
import type { PaymentFees } from "../financial-events";

/**
 * G1.6 — o pagamento como fato financeiro.
 *
 * `payments` era escrita só pela conclusão de atendimento. Venda de produto e
 * mensalidade paga registravam o `paymentMethod` no próprio fato e **não
 * geravam pagamento nenhum** — e como `gatewayFeesTotal` soma `payments`, as
 * duas não debitavam taxa alguma no DRE. Era D7, com a causa localizada em D21.
 */

const TAXAS: PaymentFees = { dinheiro: 0, pix: 0.99, debito: 1.99, credito: 3.49 };

describe("G1.6 · o id deriva do fato", () => {
  it("serviço mantém a convenção que já existia", () => {
    /* `materializeFinancialsOnCompletion` grava assim desde o Gate A. Mudar
     * agora reescreveria a idempotência de todo o histórico. */
    expect(idDoPagamento({ origem: "servico", bookingId: "bk1" })).toBe("pagamento_bk1");
  });

  it("produto e mensalidade estendem a mesma convenção", () => {
    expect(idDoPagamento({ origem: "produto", movementId: "mv1" })).toBe("pagamento_venda_mv1");
    expect(idDoPagamento({ origem: "mensalidade", invoiceId: "fat1" })).toBe(
      "pagamento_fatura_fat1"
    );
  });

  it("as três origens produzem ids distintos para o mesmo sufixo", () => {
    /* Um id colidindo entre origens faria um pagamento de venda sobrescrever o
     * de um atendimento — receita apagada em silêncio. */
    const ids = new Set([
      idDoPagamento({ origem: "servico", bookingId: "x" }),
      idDoPagamento({ origem: "produto", movementId: "x" }),
      idDoPagamento({ origem: "mensalidade", invoiceId: "x" }),
    ]);
    expect(ids.size).toBe(3);
  });
});

describe("G1.6 · a taxa é congelada, e por método", () => {
  it("crédito cobra a taxa de crédito", () => {
    const p = valoresDoPagamento({ bruto: 145, metodo: "credit", fees: TAXAS });
    expect(p.feePct).toBe(3.49);
    expect(p.feeAmount).toBe(5.06);
    expect(p.netAmount).toBe(139.94);
  });

  it("débito NÃO paga taxa de crédito", () => {
    /* O motivo de `PaymentMethod` ter deixado de ser "pix|cartao|local":
     * supor crédito por precaução superestimava o custo do débito em 1,5 ponto. */
    const p = valoresDoPagamento({ bruto: 100, metodo: "debit", fees: TAXAS });
    expect(p.feePct).toBe(1.99);
    expect(p.feePct).not.toBe(3.49);
  });

  it("dinheiro não tem taxa", () => {
    const p = valoresDoPagamento({ bruto: 100, metodo: "cash", fees: TAXAS });
    expect(p.feeAmount).toBe(0);
    expect(p.netAmount).toBe(100);
  });

  it("sem método a taxa é ZERO, mas o método fica NULO — são coisas diferentes", () => {
    /* O nulo é o que permite separar depois "não teve taxa" de "não sabemos a
     * taxa". Gravar 0 sem marca apagaria a diferença. */
    const p = valoresDoPagamento({ bruto: 100, metodo: null, fees: TAXAS });
    expect(p.feePct).toBe(0);
    expect(p.paymentMethod).toBeNull();
  });

  it("o líquido é o bruto menos a taxa, ao centavo", () => {
    const p = valoresDoPagamento({ bruto: 149, metodo: "credit", fees: TAXAS });
    expect(p.feeAmount).toBe(5.2);
    expect(p.netAmount).toBe(143.8);
    expect(p.grossAmount - p.feeAmount).toBeCloseTo(p.netAmount, 2);
  });

  it("barbearia sem taxa cadastrada não inventa custo", () => {
    /* `DEFAULT_PAYMENT_FEES` é zerado de propósito: chutar uma média de mercado
     * faria o DRE debitar dinheiro que talvez não seja cobrado. */
    const p = valoresDoPagamento({
      bruto: 100,
      metodo: "credit",
      fees: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
    });
    expect(p.feeAmount).toBe(0);
  });
});

describe("G1.6 · o documento guarda a origem explícita", () => {
  it("venda referencia o movimento, e não um `refId` genérico", () => {
    /* Uma abstração que esconde a origem economiza um campo e cobra em toda
     * consulta futura: "de onde veio este dinheiro" viraria um join. */
    const d = documentoDePagamento({
      ref: { origem: "produto", movementId: "mv1" },
      clientId: null,
      date: "2026-08-17",
      bruto: 145,
      metodo: "credit",
      fees: TAXAS,
    });
    expect(d.origin).toBe("produto");
    expect(d).toHaveProperty("movementId", "mv1");
    expect(d).not.toHaveProperty("bookingId");
    expect(d).not.toHaveProperty("invoiceId");
  });

  it("mensalidade referencia a fatura", () => {
    const d = documentoDePagamento({
      ref: { origem: "mensalidade", invoiceId: "fat1" },
      clientId: "cli1",
      date: "2026-08-17",
      bruto: 149,
      metodo: "pix",
      fees: TAXAS,
    });
    expect(d.origin).toBe("mensalidade");
    expect(d).toHaveProperty("invoiceId", "fat1");
    expect(d.clientId).toBe("cli1");
  });

  it("`paymentOrigin` continua sendo ONDE, e é diferente de `origin`", () => {
    /* `origin` = de que fato veio. `paymentOrigin` = onde aconteceu. Venda e
     * mensalidade são sempre presenciais enquanto não houver caminho online. */
    const d = documentoDePagamento({
      ref: { origem: "produto", movementId: "mv1" },
      clientId: null,
      date: "2026-08-17",
      bruto: 45,
      metodo: "cash",
      fees: TAXAS,
    });
    expect(d.paymentOrigin).toBe("in_person");
    expect(d.origin).toBe("produto");
  });
});

describe("caixinha (gorjeta) · a conta do barbeiro", () => {
  const SEM = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };

  it("R$ 10 no Pix sem taxa: 100% do barbeiro, caixinha e líquido iguais", () => {
    const c = calcularCaixinha({ caixinha: 10, metodo: "pix", fees: SEM })!;
    expect(c.payment).toMatchObject({ grossAmount: 10, feeAmount: 0, netAmount: 10, paymentMethod: "pix" });
    expect(c.commission).toEqual({ commissionPct: 100, commissionBase: 10, feeAmount: 0, commissionAmount: 10 });
  });

  it("R$ 10 no crédito a 3%: a taxa é do barbeiro, que recebe R$ 9,70", () => {
    const c = calcularCaixinha({ caixinha: 10, metodo: "credit", fees: { ...SEM, credito: 3 } })!;
    expect(c.payment.feeAmount).toBe(0.3);
    expect(c.payment.netAmount).toBe(9.7);
    expect(c.commission.commissionBase).toBe(10);
    expect(c.commission.feeAmount).toBe(0.3);
    expect(c.commission.commissionAmount).toBe(9.7);
  });

  it("a casa não fica com nada: líquido da caixinha = comissão do barbeiro", () => {
    const c = calcularCaixinha({ caixinha: 7.77, metodo: "debit", fees: { ...SEM, debito: 1.99 } })!;
    expect(c.commission.commissionAmount).toBe(c.payment.netAmount);
  });

  it("sem forma de pagamento, valor zero, negativo ou lixo: não há caixinha", () => {
    expect(calcularCaixinha({ caixinha: 10, metodo: null, fees: SEM })).toBeNull();
    for (const v of [0, -3, undefined, null, "abc", NaN]) {
      expect(calcularCaixinha({ caixinha: v, metodo: "cash", fees: SEM })).toBeNull();
    }
  });

  it("os ids derivam da reserva e do ciclo, e o documento diz 'caixinha'", () => {
    expect(idDoPagamento({ origem: "caixinha", bookingId: "bk1" })).toBe("pagamento_caixinha_bk1");
    expect(idDaComissaoDaCaixinha("comissao_bk1")).toBe("comissao_bk1_caixinha");
    expect(idDaComissaoDaCaixinha("comissao_bk1_ev2")).toBe("comissao_bk1_ev2_caixinha");
    const doc = documentoDePagamento({
      ref: { origem: "caixinha", bookingId: "bk1" },
      clientId: "c1",
      date: "2026-10-02",
      bruto: 10,
      metodo: "cash",
      fees: SEM,
    });
    expect(doc.origin).toBe("caixinha");
    expect(doc).toMatchObject({ bookingId: "bk1" });
  });

  it("o estorno nega o saldo líquido, inclusive o ajuste da correção do meio", () => {
    const original = { staffId: "s1", uid: "u1", staffName: "Otávio", commissionBase: 10, commissionAmount: 10, feeAmount: 0 };
    const ajuste = { staffId: "s1", uid: "u1", staffName: "Otávio", commissionBase: 0, commissionAmount: -0.3, feeAmount: 0.3 };
    const saldo = somarLinhasDaCaixinha([original, ajuste])!;
    expect(saldo).toMatchObject({ commissionBase: 10, commissionAmount: 9.7, feeAmount: 0.3, staffId: "s1" });
    const e = estornoDaCaixinha({ bookingId: "bk1", date: "2026-10-02", ...saldo });
    expect(e).toMatchObject({ origin: "caixinha", commissionBase: -10, commissionAmount: -9.7, feeAmount: -0.3 });
    expect(idDoEstornoDaCaixinha("bk1", "ev1")).toBe("comissao_estorno_caixinha_bk1_ev1");
  });

  it("ciclo já revertido (linha + estorno) soma zero: nada a negar de novo", () => {
    const l = { staffId: "s1", commissionBase: 10, commissionAmount: 10, feeAmount: 0 };
    const e = { staffId: "s1", commissionBase: -10, commissionAmount: -10, feeAmount: 0 };
    expect(somarLinhasDaCaixinha([l, e])).toBeNull();
    expect(somarLinhasDaCaixinha([])).toBeNull();
  });
});
