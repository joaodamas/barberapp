import { describe, expect, it } from "vitest";
import { devolucoesPorVenda, estornadoDe, situacaoDaVenda, vendasEstornaveis } from "../estornos";
import type { Doc } from "@/lib/db/repository";
import type { InventoryMovementDoc, RefundDoc } from "@/lib/domain";

/**
 * D22 / D23 · o que a tela de estorno afirma.
 *
 * Tudo derivado dos fatos. A decisão real acontece no servidor — aqui se prova
 * que a tela não promete um botão que o servidor vai recusar, nem esconde uma
 * venda que ainda pode ser devolvida.
 */

const venda = (
  id: string,
  over: Partial<InventoryMovementDoc> = {}
): Doc<InventoryMovementDoc> =>
  ({
    id,
    kind: "venda",
    productId: "pomada",
    quantity: 2,
    unitPrice: 45,
    unitCost: 18,
    value: 90,
    date: "2026-09-14",
    paymentMethod: "credit",
    staffId: "leo",
    ...over,
  }) as Doc<InventoryMovementDoc>;

const estorno = (
  movementId: string,
  quantity: number,
  over: Partial<Doc<RefundDoc>> = {}
) =>
  ({
    id: `estorno_venda_${movementId}_${quantity}`,
    origin: "produto",
    movementId,
    paymentId: `pagamento_venda_${movementId}`,
    quantity,
    grossAmount: quantity * 45,
    clientId: null,
    date: "2026-09-20",
    originalDate: "2026-09-14",
    reason: "teste",
    paymentMethod: "credit",
    feeAmount: 0,
    netAmount: quantity * 45,
    parcial: false,
    ...over,
  }) as Doc<RefundDoc>;

describe("D23 · quanto já foi devolvido", () => {
  it("soma os estornos parciais da mesma venda", () => {
    const m = devolucoesPorVenda([estorno("mv1", 1, { id: "a" }), estorno("mv1", 1, { id: "b" })]);
    expect(m.get("mv1")).toBe(2);
  });

  it("ignora estornos de serviço e mensalidade", () => {
    /* Eles não têm `quantity` e não mexem em estoque. Somá-los aqui faria uma
     * venda parecer devolvida por causa de um corte estornado. */
    const m = devolucoesPorVenda([
      estorno("mv1", 1),
      { ...estorno("mv1", 0), origin: "servico", bookingId: "bk1" } as Doc<RefundDoc>,
    ]);
    expect(m.get("mv1")).toBe(1);
  });
});

describe("D23 · as vendas que ainda podem ser desfeitas", () => {
  it("lista só vendas — compra, ajuste e perda ficam de fora", () => {
    const r = vendasEstornaveis({
      movimentos: [
        venda("mv1"),
        venda("c1", { kind: "compra" }),
        venda("a1", { kind: "ajuste" }),
        venda("p1", { kind: "perda" }),
      ],
      refunds: [],
    });
    expect(r.map((v) => v.movementId)).toEqual(["mv1"]);
  });

  it("calcula o que resta e o valor correspondente", () => {
    const [v] = vendasEstornaveis({
      movimentos: [venda("mv1", { quantity: 3, value: 135 })],
      refunds: [estorno("mv1", 1)],
    });
    expect(v.quantidade).toBe(3);
    expect(v.devolvida).toBe(1);
    expect(v.resta).toBe(2);
    expect(v.valorRestante).toBe(90);
    expect(v.encerrada).toBe(false);
  });

  it("marca como encerrada quando tudo voltou — e NÃO some da lista", () => {
    /* Sumir com ela faria a tela contar a mesma história que um `delete`
     * contaria: a venda deixaria de ter existido. */
    const [v] = vendasEstornaveis({
      movimentos: [venda("mv1", { quantity: 2 })],
      refunds: [estorno("mv1", 2)],
    });
    expect(v.encerrada).toBe(true);
    expect(v.resta).toBe(0);
    expect(v.valorRestante).toBe(0);
  });

  it("nunca deixa `resta` ficar negativo", () => {
    /* Defesa contra dado inconsistente: um número negativo na tela viraria um
     * botão oferecendo devolver o que não existe. */
    const [v] = vendasEstornaveis({
      movimentos: [venda("mv1", { quantity: 1 })],
      refunds: [estorno("mv1", 3)],
    });
    expect(v.resta).toBe(0);
    expect(v.encerrada).toBe(true);
  });

  it("mais recentes primeiro", () => {
    const r = vendasEstornaveis({
      movimentos: [
        venda("antiga", { date: "2026-09-01" }),
        venda("nova", { date: "2026-09-20" }),
      ],
      refunds: [],
    });
    expect(r.map((v) => v.movementId)).toEqual(["nova", "antiga"]);
  });

  it("respeita o limite", () => {
    const muitas = Array.from({ length: 20 }, (_, i) =>
      venda(`mv${i}`, { date: `2026-09-${String(i + 1).padStart(2, "0")}` })
    );
    expect(vendasEstornaveis({ movimentos: muitas, refunds: [], limite: 5 })).toHaveLength(5);
  });

  it("venda sem `unitPrice` — anterior a G1 — não vira NaN na tela", () => {
    const [v] = vendasEstornaveis({
      movimentos: [venda("antigo", { unitPrice: undefined })],
      refunds: [],
    });
    expect(v.valor).toBe(0);
    expect(v.valorRestante).toBe(0);
    expect(Number.isNaN(v.valor)).toBe(false);
  });
});

describe("D22 · quanto já foi devolvido de um fato qualquer", () => {
  it("soma os estornos da venda pelo movementId", () => {
    expect(
      estornadoDe([estorno("mv1", 1, { id: "a" }), estorno("mv1", 1, { id: "b" })], "produto", "mv1")
    ).toBe(90);
  });

  it("não confunde origens que compartilham o mesmo id", () => {
    /* `bookingId: "x"` e `movementId: "x"` são fatos diferentes. Casar por id
     * sem olhar a origem faria um corte estornado esconder o saldo de uma
     * venda. */
    const refunds = [
      { ...estorno("x", 1, { id: "a" }), grossAmount: 45 },
      {
        ...estorno("x", 0, { id: "b" }),
        origin: "servico",
        bookingId: "x",
        movementId: undefined,
        grossAmount: 50,
      },
    ] as Doc<RefundDoc>[];

    expect(estornadoDe(refunds, "produto", "x")).toBe(45);
    expect(estornadoDe(refunds, "servico", "x")).toBe(50);
  });

  it("casa mensalidade pelo invoiceId", () => {
    const r = [
      {
        ...estorno("ignorado", 0, { id: "a" }),
        origin: "mensalidade",
        invoiceId: "f1",
        movementId: undefined,
        grossAmount: 149,
      },
    ] as Doc<RefundDoc>[];
    expect(estornadoDe(r, "mensalidade", "f1")).toBe(149);
    expect(estornadoDe(r, "mensalidade", "f2")).toBe(0);
  });

  it("sem estorno nenhum, é zero e não NaN", () => {
    expect(estornadoDe([], "servico", "bk1")).toBe(0);
  });
});

describe("D23 · a frase da situação", () => {
  it("é vazia quando nada foi devolvido", () => {
    const [v] = vendasEstornaveis({ movimentos: [venda("mv1")], refunds: [] });
    expect(situacaoDaVenda(v)).toBe("");
  });

  it("conta o parcial com o total", () => {
    const [v] = vendasEstornaveis({
      movimentos: [venda("mv1", { quantity: 3 })],
      refunds: [estorno("mv1", 1)],
    });
    expect(situacaoDaVenda(v)).toBe("1 de 3 devolvida");
  });

  it("concorda em número no plural", () => {
    const [v] = vendasEstornaveis({
      movimentos: [venda("mv1", { quantity: 3 })],
      refunds: [estorno("mv1", 2)],
    });
    expect(situacaoDaVenda(v)).toBe("2 de 3 devolvidas");
  });

  it("diz por inteiro quando acabou", () => {
    const [v] = vendasEstornaveis({
      movimentos: [venda("mv1", { quantity: 2 })],
      refunds: [estorno("mv1", 2)],
    });
    expect(situacaoDaVenda(v)).toBe("Devolvida por inteiro");
  });
});
