import { describe, expect, it } from "vitest";
import { fluxoDiario, movimentosDeCaixa, resumoDoFluxo } from "../fluxo-de-caixa";
import { mesPeriodo } from "../analytics-periodo";
import { caixaDiario } from "../analytics";
import type { Doc } from "@/lib/db/repository";
import type {
  CashEntryDoc,
  ExpenseDoc,
  InventoryMovementDoc,
  PaymentDoc,
  RefundDoc,
} from "@/lib/domain";

/**
 * Rodada 3.2 · Fluxo de Caixa — D8 / D11 / D4.
 *
 * A régua é a mesma do DRE: **cada origem prova o valor E prova que nenhuma
 * outra contribui para ela**. Aqui a prova é mais direta, porque cada movimento
 * carrega a origem e o teste conta por origem — um total certo pode esconder
 * dois erros que se cancelam.
 */

const P = mesPeriodo("2026-09");
const vazio = { payments: [], refunds: [], expenses: [], movements: [], cashEntries: [], periodo: P };

const pg = (id: string, o: Partial<PaymentDoc> = {}): Doc<PaymentDoc> =>
  ({
    id, origin: "servico", clientId: "c1", date: "2026-09-10",
    paymentOrigin: "in_person", paymentMethod: "credit",
    grossAmount: 100, feePct: 3.49, feeAmount: 3.49, netAmount: 96.51, ...o,
  }) as Doc<PaymentDoc>;

const rf = (id: string, o: Partial<RefundDoc> = {}): Doc<RefundDoc> =>
  ({
    id, origin: "servico", paymentId: "p1", bookingId: "bk1", clientId: "c1",
    date: "2026-09-12", originalDate: "2026-09-10", reason: "Devolução",
    paymentMethod: "credit", grossAmount: 50, feeAmount: 0, netAmount: 50,
    parcial: false, ...o,
  }) as Doc<RefundDoc>;

const ex = (id: string, o: Partial<ExpenseDoc> = {}): Doc<ExpenseDoc> =>
  ({
    id, category: "Aluguel", description: "Aluguel", supplier: "X",
    value: 2000, date: "2026-09-05", payment: "Pix", recurring: true, ...o,
  }) as Doc<ExpenseDoc>;

const mv = (id: string, o: Partial<InventoryMovementDoc> = {}): Doc<InventoryMovementDoc> =>
  ({
    id, kind: "compra", productId: "pomada", quantity: 10, unitCost: 18,
    unitPrice: 0, value: 180, date: "2026-09-02", paymentMethod: "cash", ...o,
  }) as Doc<InventoryMovementDoc>;

const cx = (id: string, o: Partial<CashEntryDoc> = {}): Doc<CashEntryDoc> =>
  ({
    id, kind: "sangria", direction: "saida", amount: -300,
    date: "2026-09-15", reason: "Depósito", paymentMethod: "cash",
    staffId: null, ...o,
  }) as Doc<CashEntryDoc>;

/* ================================================================== */
/* Entradas                                                           */
/* ================================================================== */

describe("3.2 · ENTRADAS — o dinheiro que caiu na conta", () => {
  it("VALOR: entra o LÍQUIDO, não o bruto", () => {
    /* A maquininha deposita já descontada; o bruto nunca passa pela conta. O
     * dono confere o Fluxo contra o extrato. */
    const r = resumoDoFluxo(
      movimentosDeCaixa({ ...vazio, payments: [pg("p1", { grossAmount: 100, netAmount: 96.51 })] })
    );
    expect(r.entradas).toBe(96.51);
    expect(r.entradas).not.toBe(100);
  });

  it("Pix e dinheiro não perdem nada — líquido é o bruto", () => {
    const r = resumoDoFluxo(
      movimentosDeCaixa({
        ...vazio,
        payments: [pg("p1", { paymentMethod: "pix", grossAmount: 80, feeAmount: 0, netAmount: 80 })],
      })
    );
    expect(r.entradas).toBe(80);
  });

  it("as TRÊS origens entram, cada uma com o próprio nome", () => {
    const r = resumoDoFluxo(
      movimentosDeCaixa({
        ...vazio,
        payments: [
          pg("p1", { origin: "servico", netAmount: 50 }),
          pg("p2", { origin: "produto", movementId: "mv1", netAmount: 90 }),
          pg("p3", { origin: "mensalidade", invoiceId: "f1", netAmount: 99 }),
        ],
      })
    );
    expect(r.porOrigem.servico).toBe(50);
    expect(r.porOrigem.produto).toBe(90);
    expect(r.porOrigem.mensalidade).toBe(99);
    expect(r.entradas).toBe(239);
  });

  it("D4 · a venda NÃO entra toda como dinheiro", () => {
    /* Era o defeito: `d.dinheiro += m.value` para toda venda, mesmo com o meio
     * gravado no movimento desde G1. */
    const r = resumoDoFluxo(
      movimentosDeCaixa({
        ...vazio,
        payments: [
          pg("p1", { origin: "produto", movementId: "mv1", paymentMethod: "credit", netAmount: 87 }),
          pg("p2", { origin: "produto", movementId: "mv2", paymentMethod: "pix", netAmount: 45 }),
        ],
      })
    );
    expect(r.porMetodo.cartao).toBe(87);
    expect(r.porMetodo.pix).toBe(45);
    expect(r.porMetodo.dinheiro).toBe(0);
  });

  it("pagamento sem origem reconhecível não entra — e não vira zero silencioso", () => {
    const movs = movimentosDeCaixa({
      ...vazio,
      payments: [{ ...pg("p1"), origin: undefined, bookingId: undefined } as Doc<PaymentDoc>],
    });
    expect(movs).toHaveLength(0);
  });
});

/* ================================================================== */
/* Saídas                                                             */
/* ================================================================== */

describe("3.2 · SAÍDAS — o dinheiro que saiu", () => {
  it("devolução sai pelo BRUTO", () => {
    /* É o que volta para a mão do cliente. A taxa retida na entrada não volta. */
    const r = resumoDoFluxo(movimentosDeCaixa({ ...vazio, refunds: [rf("e1", { grossAmount: 50 })] }));
    expect(r.saidas).toBe(50);
    expect(r.porOrigem.estorno).toBe(-50);
  });

  it("despesa sai pela data LANÇADA, não pela vigência do DRE", () => {
    /* Divergir do DRE aqui é correto: recorrente é custo de todo mês em que
     * vigora e saída só no mês em que foi paga. */
    const r = resumoDoFluxo(
      movimentosDeCaixa({
        ...vazio,
        expenses: [ex("x1", { date: "2026-09-05", value: 2000 }), ex("x2", { date: "2026-08-05", value: 9999 })],
      })
    );
    expect(r.saidas).toBe(2000);
  });

  it("COMPRA de estoque é saída de caixa — e não vira despesa", () => {
    /* O usuário foi explícito: sem transformar compra em despesa. Contá-la
     * como despesa dobraria o custo do produto — uma vez na compra, outra no
     * CMV. */
    const r = resumoDoFluxo(movimentosDeCaixa({ ...vazio, movements: [mv("c1", { value: 180 })] }));
    expect(r.porOrigem.compra).toBe(-180);
    expect(r.porOrigem.despesa).toBe(0);
    expect(r.saidas).toBe(180);
  });

  it("EXCLUSIVIDADE: venda e ajuste NÃO entram pelo movimento", () => {
    /* A venda já entrou pelo pagamento; a devolução já saiu pelo estorno.
     * Contá-los aqui somaria o mesmo dinheiro duas vezes. */
    const r = resumoDoFluxo(
      movimentosDeCaixa({
        ...vazio,
        movements: [
          mv("c1", { kind: "compra", value: 180 }),
          mv("v1", { kind: "venda", value: 90 }),
          mv("a1", { kind: "ajuste", refundOf: "v1", value: 45 }),
          mv("p1", { kind: "perda", value: 36 }),
        ],
      })
    );
    expect(r.porOrigem.compra).toBe(-180);
    expect(r.saidas).toBe(180);
  });
});

/* ================================================================== */
/* Livro caixa                                                        */
/* ================================================================== */

describe("3.2 · o livro caixa entra pelos DOIS lados", () => {
  it("sangria sai, aporte entra", () => {
    const r = resumoDoFluxo(
      movimentosDeCaixa({
        ...vazio,
        cashEntries: [
          cx("c1", { kind: "sangria", direction: "saida", amount: -300 }),
          cx("c2", { kind: "aporte", direction: "entrada", amount: 1000, paymentMethod: "pix" }),
        ],
      })
    );
    expect(r.porOrigem.caixa).toBe(700);
    expect(r.entradas).toBe(1000);
    expect(r.saidas).toBe(300);
  });

  it("EXCLUSIVIDADE: o livro caixa não repete o que já entrou por pagamento", () => {
    /* A garantia vem do enum fechado em `caixa.ts`: não existe `kind` de venda
     * nem de despesa. Aqui se prova o efeito — as duas origens coexistem sem se
     * somarem. */
    const r = resumoDoFluxo(
      movimentosDeCaixa({
        ...vazio,
        payments: [pg("p1", { origin: "produto", movementId: "mv1", netAmount: 90 })],
        cashEntries: [cx("c1", { kind: "sangria", amount: -90 })],
      })
    );
    expect(r.porOrigem.produto).toBe(90);
    expect(r.porOrigem.caixa).toBe(-90);
    expect(r.saldo).toBe(0);
    expect(r.entradas).toBe(90);
    expect(r.saidas).toBe(90);
  });

  it("pagamento de comissão é saída de caixa, e não custo em duplicidade", () => {
    /* A comissão DEVIDA já está no DRE como custo do mês. Aqui é o dinheiro
     * saindo da gaveta — momentos diferentes do mesmo compromisso. */
    const r = resumoDoFluxo(
      movimentosDeCaixa({
        ...vazio,
        cashEntries: [cx("c1", { kind: "pagamento_comissao", amount: -180, staffId: "leo" })],
      })
    );
    expect(r.porOrigem.caixa).toBe(-180);
  });
});

/* ================================================================== */
/* O saldo                                                            */
/* ================================================================== */

describe("3.2 · o número que responde 'quanto sobrou'", () => {
  const completo = () =>
    movimentosDeCaixa({
      periodo: P,
      payments: [
        pg("p1", { origin: "servico", netAmount: 500, paymentMethod: "credit" }),
        pg("p2", { origin: "produto", movementId: "mv1", netAmount: 200, paymentMethod: "pix" }),
        pg("p3", { origin: "mensalidade", invoiceId: "f1", netAmount: 300, paymentMethod: "pix" }),
      ],
      refunds: [rf("e1", { grossAmount: 50 })],
      expenses: [ex("x1", { value: 400 })],
      movements: [mv("c1", { value: 180 })],
      cashEntries: [cx("c1", { kind: "sangria", amount: -100 })],
    });

  it("saldo = entradas − saídas, e cada origem aparece uma vez", () => {
    const r = resumoDoFluxo(completo());
    expect(r.entradas).toBe(1000);
    expect(r.saidas).toBe(730);
    expect(r.saldo).toBe(270);

    expect(r.porOrigem).toEqual({
      servico: 500,
      produto: 200,
      mensalidade: 300,
      estorno: -50,
      despesa: -400,
      compra: -180,
      caixa: -100,
    });
  });

  it("a soma das ORIGENS é o saldo — nenhuma sobra, nenhuma falta", () => {
    /* A prova de exclusividade em uma linha: se algum fato entrasse em duas
     * origens, ou ficasse fora de todas, esta soma não fecharia. */
    const r = resumoDoFluxo(completo());
    const soma = Object.values(r.porOrigem).reduce((s, v) => s + v, 0);
    expect(Math.round(soma * 100) / 100).toBe(r.saldo);
  });

  it("CAIXA não é RESULTADO — os dois divergem, e é correto", () => {
    /* Comprar estoque é saída de caixa e não é custo do período. Um fluxo que
     * batesse com o DRE apagaria a diferença entre lucro e dinheiro em conta —
     * a razão pela qual barbearia lucrativa quebra. */
    const r = resumoDoFluxo(completo());
    expect(r.porOrigem.compra).toBe(-180);
    expect(r.saldo).toBe(270);
  });

  it("mês sem movimento nenhum é zero, não NaN", () => {
    const r = resumoDoFluxo(movimentosDeCaixa(vazio));
    expect(r).toMatchObject({ entradas: 0, saidas: 0, saldo: 0 });
    for (const v of Object.values(r.porOrigem)) expect(Number.isNaN(v)).toBe(false);
  });

  it("o caixa por instrumento cobre só as ENTRADAS", () => {
    /* É o que o dono concilia com o extrato. Misturar saídas ali faria o
     * "Pix" da tela não bater com o Pix que ele recebeu. */
    const r = resumoDoFluxo(completo());
    expect(r.porMetodo.pix).toBe(500);
    expect(r.porMetodo.cartao).toBe(500);
    expect(r.porMetodo.pix + r.porMetodo.cartao + r.porMetodo.dinheiro + r.porMetodo.outros).toBe(
      r.entradas
    );
  });

  it("despesa em boleto cai em OUTROS, sem inventar instrumento", () => {
    /* `ExpenseDoc.payment` tem vocabulário paralelo. Chutar débito ou crédito
     * inventaria informação no campo que o dono usa para conferir. */
    const movs = movimentosDeCaixa({ ...vazio, expenses: [ex("x1", { payment: "Boleto" })] });
    expect(movs[0].metodo).toBeNull();
  });
});

/* ================================================================== */
/* Dia a dia                                                          */
/* ================================================================== */

describe("3.2 · o fluxo dia a dia", () => {
  it("acumula o saldo ao longo do mês", () => {
    /* É o que responde "em que dia o caixa virou". Sem o acumulado o dono soma
     * as colunas de cabeça. */
    const dias = fluxoDiario(
      movimentosDeCaixa({
        ...vazio,
        movements: [mv("c1", { date: "2026-09-02", value: 180 })],
        payments: [
          pg("p1", { date: "2026-09-10", netAmount: 100 }),
          pg("p2", { date: "2026-09-11", netAmount: 200 }),
        ],
      })
    );

    expect(dias.map((d) => [d.date, d.saldo, d.acumulado])).toEqual([
      ["2026-09-02", -180, -180],
      ["2026-09-10", 100, -80],
      ["2026-09-11", 200, 120],
    ]);
  });

  it("dia sem movimento não vira linha", () => {
    /* Uma tabela com 31 linhas onde 20 são zero esconde as 11 que importam. */
    const dias = fluxoDiario(movimentosDeCaixa({ ...vazio, payments: [pg("p1")] }));
    expect(dias).toHaveLength(1);
  });

  it("entradas e saídas do mesmo dia aparecem separadas", () => {
    const [dia] = fluxoDiario(
      movimentosDeCaixa({
        ...vazio,
        payments: [pg("p1", { date: "2026-09-10", netAmount: 300 })],
        expenses: [ex("x1", { date: "2026-09-10", value: 500 })],
      })
    );
    expect(dia).toMatchObject({ entradas: 300, saidas: 500, saldo: -200 });
  });
});

describe("3.2 · método NÃO INFORMADO não vira dinheiro", () => {
  it("o nulo cai em `outros`, e não em espécie", () => {
    /* Achado pela bateria de regressão. O servidor grava `paymentMethod: null`
     * DE PROPÓSITO quando o atendimento é concluído sem informar como o cliente
     * pagou. Somar isso em dinheiro faz a coluna que o dono confere contra a
     * gaveta afirmar algo que ninguém registrou — a primeira metade da régua.
     *
     * `caixaDiario` dizia dinheiro e `resumoDoFluxo` dizia outros: as duas
     * leituras discordavam do MESMO pagamento, e o total fechava nas duas, que
     * é o que escondia. */
    const r = resumoDoFluxo(
      movimentosDeCaixa({ ...vazio, payments: [pg("p1", { paymentMethod: null, netAmount: 50 })] })
    );
    expect(r.porMetodo.outros).toBe(50);
    expect(r.porMetodo.dinheiro).toBe(0);
  });

  it("as duas leituras CONCORDAM sobre o mesmo pagamento", () => {
    /* A invariante que faltava: o que uma chama de desconhecido, a outra
     * também. */
    const payments = [pg("p1", { paymentMethod: null, netAmount: 50 })];
    const fluxo = resumoDoFluxo(movimentosDeCaixa({ ...vazio, payments }));
    const [dia] = caixaDiario({ payments, periodo: P });

    expect(dia.dinheiro).toBe(0);
    expect(dia.naoInformado).toBe(50);
    expect(dia.naoInformado).toBe(fluxo.porMetodo.outros);
  });
});
