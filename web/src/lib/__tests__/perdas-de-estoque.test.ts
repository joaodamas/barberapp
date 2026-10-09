import { describe, expect, it } from "vitest";
import { custoDoVendido, perdasDeEstoque } from "../fontes-financeiras";
import { mesPeriodo, receitaDoMes, resultadoDoMes } from "../analytics";
import { PLATFORM_DEFAULT_POLICIES } from "../tenant";
import type { Doc } from "@/lib/db/repository";
import type { InventoryMovementDoc, StaffDoc } from "@/lib/domain";

/**
 * "Perdas e uso interno de estoque" — a linha do DRE que o ajuste de estoque cria.
 *
 * O contrato (docs/CONTRATO-DO-DRE.md): cada número tem UM fato de origem. A
 * perda nasce do movimento `ajuste` MANUAL de saída, ao custo congelado nele.
 * Nenhum outro fato contribui para a linha — e ela não contribui para nenhuma
 * outra:
 *
 *  - contagem a MAIS não gera receita nem reduz custo;
 *  - devolução (`refundOf`) continua reduzindo o CMV, e NÃO vira perda;
 *  - o CMV não muda por causa de um ajuste.
 */

const P = mesPeriodo("2026-10");

const mv = (id: string, over: Partial<InventoryMovementDoc> = {}): Doc<InventoryMovementDoc> =>
  ({
    id,
    kind: "venda",
    productId: "pomada",
    quantity: 2,
    unitPrice: 45,
    unitCost: 18,
    value: 90,
    date: "2026-10-05",
    paymentMethod: "pix",
    staffId: null,
    ...over,
  }) as Doc<InventoryMovementDoc>;

/** Um ajuste manual: quantidade ASSINADA, sem `refundOf`. */
const ajuste = (id: string, quantity: number, over: Partial<InventoryMovementDoc> = {}) =>
  mv(id, {
    kind: "ajuste",
    quantity,
    unitPrice: 0,
    unitCost: 18,
    value: Math.abs(quantity) * 18,
    paymentMethod: null,
    reason: "perda",
    ...over,
  });

describe("perdasDeEstoque · o que entra", () => {
  it("saída por perda custa quantidade × custo congelado", () => {
    const r = perdasDeEstoque({ movements: [ajuste("a1", -2)], periodo: P });
    expect(r.total).toBe(36);
    expect(r.unidades).toBe(2);
    expect(r.linhas).toEqual([
      { productId: "pomada", reason: "perda", reasonText: null, unidades: 2, custo: 36 },
    ]);
  });

  it("uso interno, vencido, contagem a menos e outro são todos custo", () => {
    const r = perdasDeEstoque({
      movements: [
        ajuste("a1", -1, { reason: "uso_interno" }),
        ajuste("a2", -1, { reason: "vencido" }),
        ajuste("a3", -1, { reason: "contagem" }),
        ajuste("a4", -1, { reason: "outro", reasonText: "amostra" }),
      ],
      periodo: P,
    });
    expect(r.total).toBe(72);
    expect(r.linhas.map((l) => l.reason).sort()).toEqual(["contagem", "outro", "uso_interno", "vencido"]);
    expect(r.linhas.find((l) => l.reason === "outro")?.reasonText).toBe("amostra");
  });

  it("usa o custo CONGELADO de cada movimento, não um custo único", () => {
    const r = perdasDeEstoque({
      movements: [ajuste("a1", -1, { unitCost: 18 }), ajuste("a2", -1, { unitCost: 30 })],
      periodo: P,
    });
    expect(r.total).toBe(48);
    // Mesmo produto e mesmo motivo: uma linha só, com a soma.
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ unidades: 2, custo: 48 });
  });
});

describe("perdasDeEstoque · o que NÃO entra", () => {
  it("🔒 contagem a MAIS não gera custo (nem receita)", () => {
    const r = perdasDeEstoque({ movements: [ajuste("a1", 3, { reason: "contagem" })], periodo: P });
    expect(r.total).toBe(0);
    expect(r.linhas).toEqual([]);
  });

  it("🔒 a devolução (`refundOf`) não é perda — ela reduz o CMV", () => {
    const devolucao = mv("d1", { kind: "ajuste", quantity: 1, refundOf: "v1", unitPrice: 45, unitCost: 18 });
    expect(perdasDeEstoque({ movements: [devolucao], periodo: P }).total).toBe(0);
    // …e continua reduzindo o CMV, que é onde ela mora.
    const cmv = custoDoVendido({ movements: [mv("v1", { quantity: 2 }), devolucao], periodo: P });
    expect(cmv.total).toBe(18);
  });

  it("venda, compra e perda legada ficam de fora", () => {
    const r = perdasDeEstoque({
      movements: [mv("v1"), mv("c1", { kind: "compra", quantity: 5 }), mv("p1", { kind: "perda", quantity: 1 })],
      periodo: P,
    });
    expect(r.total).toBe(0);
  });

  it("ajuste de outro mês não pesa neste", () => {
    const r = perdasDeEstoque({
      movements: [ajuste("a1", -2, { date: "2026-09-30" }), ajuste("a2", -1, { date: "2026-11-01" })],
      periodo: P,
    });
    expect(r.total).toBe(0);
  });

  it("ajuste sem custo congelado entra com custo zero e é CONTADO — não lê o cadastro", () => {
    const r = perdasDeEstoque({
      movements: [ajuste("a1", -2, { unitCost: undefined })],
      periodo: P,
    });
    expect(r.total).toBe(0);
    expect(r.semCustoCongelado).toBe(2);
  });
});

describe("perdasDeEstoque · custo zero", () => {
  it("custo 0 conta como 'sem custo', não como perda de R$ 0 silenciosa", () => {
    const r = perdasDeEstoque({ movements: [ajuste("a1", -3, { unitCost: 0 })], periodo: P });
    expect(r.total).toBe(0);
    expect(r.semCustoCongelado).toBe(3);
  });
});

describe("perdasDeEstoque · os filhos fecham com o cabeçalho", () => {
  it("custo quebrado (R$ 100 ÷ 12) soma exatamente o total", () => {
    const movements = [
      ajuste("a1", -1, { unitCost: 100 / 12, productId: "a" }),
      ajuste("a2", -1, { unitCost: 100 / 12, productId: "b" }),
      ajuste("a3", -1, { unitCost: 100 / 12, productId: "c" }),
    ];
    const r = perdasDeEstoque({ movements, periodo: P });
    const soma = r.linhas.reduce((s, l) => s + l.custo, 0);
    expect(Math.round(soma * 100)).toBe(Math.round(r.total * 100));
  });

  it("mês sem ajuste: zero, sem linhas", () => {
    const r = perdasDeEstoque({ movements: [], periodo: P });
    expect(r).toEqual({ total: 0, unidades: 0, linhas: [], semCustoCongelado: 0 });
  });
});

describe("o DRE · a perda é custo variável e o CMV não muda", () => {
  const staff: Doc<StaffDoc>[] = [{ id: "s1", name: "Barbeiro", active: true } as Doc<StaffDoc>];

  function dre(movements: Doc<InventoryMovementDoc>[]) {
    const receita = receitaDoMes({ bookings: [], movements, subscribers: [], periodo: P });
    return resultadoDoMes({
      receita,
      bookings: [],
      expenses: [],
      movements,
      periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES,
      staff,
    });
  }

  it("a perda entra no custo variável e reduz o resultado pelo valor exato", () => {
    const base = [mv("v1")];
    const sem = dre(base);
    const com = dre([...base, ajuste("a1", -2)]);

    expect(com.perdasDeEstoque).toBe(36);
    expect(com.cmv).toBe(sem.cmv);
    expect(com.variableCost).toBeCloseTo(sem.variableCost + 36, 10);
    expect(com.result).toBeCloseTo(sem.result - 36, 10);
    expect(com.grossRevenue).toBe(sem.grossRevenue);
  });

  it("a identidade receita bruta − custo total = resultado segue valendo", () => {
    const r = dre([mv("v1"), ajuste("a1", -2)]);
    expect(r.grossRevenue - r.totalCost).toBeCloseTo(r.result, 10);
  });

  it("🔒 contagem a mais NÃO muda nenhum número do resultado", () => {
    const base = [mv("v1")];
    const sem = dre(base);
    const com = dre([...base, ajuste("a1", 4, { reason: "contagem" })]);
    expect(com.perdasDeEstoque).toBe(0);
    expect(com.result).toBe(sem.result);
    expect(com.variableCost).toBe(sem.variableCost);
    expect(com.grossRevenue).toBe(sem.grossRevenue);
  });

  it("mês sem ajuste é idêntico ao de antes: perdas zero", () => {
    const r = dre([mv("v1")]);
    expect(r.perdasDeEstoque).toBe(0);
    expect(r.variableCost).toBe(r.cmv + r.gatewayFees + r.commissions);
  });
});
