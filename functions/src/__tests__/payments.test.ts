import { describe, expect, it } from "vitest";
import { documentoDePagamento, idDoPagamento, valoresDoPagamento } from "../payments";
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
