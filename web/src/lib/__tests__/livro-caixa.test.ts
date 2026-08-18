import { describe, expect, it } from "vitest";
import {
  EXPLICACAO_DO_TIPO,
  lancamentosDoPeriodo,
  resumoDoCaixa,
  ROTULO_DO_TIPO,
  saldoDosLancamentos,
} from "../livro-caixa";
import type { Doc } from "@/lib/db/repository";
import type { CashEntryDoc } from "@/lib/domain";

/**
 * D25 · o que a tela do livro caixa afirma.
 *
 * Tudo derivado. O sinal e a direção nascem no servidor, resolvidos pelo tipo —
 * aqui se prova que a leitura não os reinventa.
 */

const lanc = (over: Partial<Doc<CashEntryDoc>> = {}): Doc<CashEntryDoc> =>
  ({
    id: "cx1",
    kind: "sangria",
    direction: "saida",
    amount: -200,
    date: "2026-09-20",
    reason: "Depósito",
    paymentMethod: "cash",
    staffId: null,
    ...over,
  }) as Doc<CashEntryDoc>;

describe("D25 · o saldo sai da soma, sem consultar o tipo", () => {
  it("soma os sinais direto", () => {
    /* Uma leitura que precisasse de `switch (kind)` erraria no dia em que um
     * tipo novo aparecesse. O sinal mora no fato. */
    const r = saldoDosLancamentos([
      lanc({ id: "a", kind: "troco_inicial", direction: "entrada", amount: 100 }),
      lanc({ id: "b", kind: "aporte", direction: "entrada", amount: 500 }),
      lanc({ id: "c", kind: "sangria", direction: "saida", amount: -250 }),
      lanc({ id: "d", kind: "pagamento_comissao", direction: "saida", amount: -180 }),
    ]);
    expect(r).toBe(170);
  });

  it("lista vazia é zero, não NaN", () => {
    expect(saldoDosLancamentos([])).toBe(0);
  });

  it("valor ausente não contamina o saldo", () => {
    const r = saldoDosLancamentos([
      lanc({ id: "a", amount: -100 }),
      lanc({ id: "b", amount: undefined as unknown as number }),
    ]);
    expect(r).toBe(-100);
    expect(Number.isNaN(r)).toBe(false);
  });
});

describe("D25 · entradas e saídas separadas", () => {
  const entradas = [
    lanc({ id: "a", kind: "aporte", direction: "entrada", amount: 1000 }),
    lanc({ id: "b", kind: "sangria", direction: "saida", amount: -830 }),
  ];

  it("separa os dois lados em vez de mostrar só o líquido", () => {
    /* Saldo de R$ 170 pode ser R$ 170 de aporte ou R$ 1.000 de aporte com
     * R$ 830 de sangria — e o dono precisa da diferença. Mesma decisão de
     * `resumoDasFaturas`. */
    const r = resumoDoCaixa(entradas);
    expect(r.entradas).toBe(1000);
    expect(r.saidas).toBe(830);
    expect(r.saldo).toBe(170);
    expect(r.quantidade).toBe(2);
  });

  it("as saídas saem POSITIVAS — o sinal serve para somar, não para exibir", () => {
    expect(resumoDoCaixa(entradas).saidas).toBeGreaterThan(0);
  });

  it("filtra pela competência", () => {
    const r = resumoDoCaixa(
      [
        lanc({ id: "a", date: "2026-09-20", amount: -100 }),
        lanc({ id: "b", date: "2026-08-20", amount: -900 }),
      ],
      "2026-09"
    );
    expect(r.saidas).toBe(100);
    expect(r.quantidade).toBe(1);
  });

  it("sem competência, considera tudo", () => {
    const r = resumoDoCaixa([
      lanc({ id: "a", date: "2026-09-20", amount: -100 }),
      lanc({ id: "b", date: "2026-08-20", amount: -900 }),
    ]);
    expect(r.saidas).toBe(1000);
  });

  it("caixa vazio não vira NaN nem negativo do nada", () => {
    const r = resumoDoCaixa([]);
    expect(r).toEqual({ entradas: 0, saidas: 0, saldo: 0, quantidade: 0 });
  });
});

describe("D25 · a lista", () => {
  it("mais recentes primeiro", () => {
    const r = lancamentosDoPeriodo([
      lanc({ id: "velho", date: "2026-09-01" }),
      lanc({ id: "novo", date: "2026-09-20" }),
    ]);
    expect(r.map((e) => e.id)).toEqual(["novo", "velho"]);
  });

  it("respeita o limite", () => {
    const muitos = Array.from({ length: 30 }, (_, i) =>
      lanc({ id: `l${i}`, date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}` })
    );
    expect(lancamentosDoPeriodo(muitos, undefined, 5)).toHaveLength(5);
  });
});

describe("D25 · o vocabulário da tela", () => {
  it("todo tipo tem rótulo e explicação", () => {
    /* "Sangria" é vocabulário de quem já trabalha com caixa. Um tipo sem
     * explicação vira um botão que o dono não sabe se deve apertar. */
    const tipos: CashEntryDoc["kind"][] = [
      "sangria",
      "troco_inicial",
      "aporte",
      "pagamento_comissao",
      "ajuste",
    ];
    for (const t of tipos) {
      expect(ROTULO_DO_TIPO[t]).toBeTruthy();
      expect(EXPLICACAO_DO_TIPO[t].length).toBeGreaterThan(20);
    }
  });

  it("NENHUM rótulo sugere venda, atendimento ou mensalidade", () => {
    /* A exclusividade também vale para o texto: um rótulo "Venda em dinheiro"
     * convidaria o dono a lançar aqui o que já entrou pelo pagamento. */
    const todos = Object.values(ROTULO_DO_TIPO).join(" ").toLowerCase();
    for (const proibido of ["venda", "atendimento", "mensalidade", "despesa", "compra"]) {
      expect(todos).not.toContain(proibido);
    }
  });
});
