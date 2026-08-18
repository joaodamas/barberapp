import { describe, expect, it } from "vitest";
import {
  comissaoDeProduto,
  custoDoVendido,
  estornosDoPeriodo,
  receitaDeMensalidade,
  receitaDeProduto,
  receitaDeServico,
} from "../fontes-financeiras";
import { mesPeriodo } from "../analytics-periodo";
import { composicaoDaReceita, receitaDoMes } from "../analytics";
import type { Doc } from "@/lib/db/repository";
import type {
  BookingDoc,
  CommissionDoc,
  InventoryMovementDoc,
  PaymentDoc,
  RefundDoc,
  SubscriberDoc,
  SubscriptionInvoiceDoc,
} from "@/lib/domain";

/**
 * Rodada 3.2 · de onde cada linha tira o número.
 *
 * Cada linha tem DUAS provas:
 *
 *   1. **valor** — sai do fato correto, com o campo congelado;
 *   2. **exclusividade** — nenhum outro fato contribui, e o mesmo fato não
 *      entra duas vezes.
 *
 * A prova de exclusividade tem forma concreta: montar o cenário com o fato
 * materializado E com o documento original, e verificar que o total é o valor
 * UMA vez. Uma implementação que somasse as duas fontes veria o dobro.
 */

const P = mesPeriodo("2026-09");

const bk = (id: string, over: Partial<BookingDoc> = {}): Doc<BookingDoc> =>
  ({
    id,
    date: "2026-09-14",
    time: "10:00",
    status: "completed",
    value: 50,
    staffId: "leo",
    clientId: "c1",
    serviceIds: ["corte"],
    isFitIn: false,
    paymentOrigin: "in_person",
    paymentMethod: "credit",
    ...over,
  }) as Doc<BookingDoc>;

const pg = (id: string, over: Partial<PaymentDoc> = {}): Doc<PaymentDoc> =>
  ({
    id,
    origin: "servico",
    clientId: "c1",
    date: "2026-09-14",
    paymentOrigin: "in_person",
    paymentMethod: "credit",
    grossAmount: 50,
    feePct: 3.49,
    feeAmount: 1.75,
    netAmount: 48.25,
    ...over,
  }) as Doc<PaymentDoc>;

const mv = (id: string, over: Partial<InventoryMovementDoc> = {}): Doc<InventoryMovementDoc> =>
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

const rf = (id: string, over: Partial<RefundDoc> = {}): Doc<RefundDoc> =>
  ({
    id,
    origin: "servico",
    paymentId: "pagamento_bk1",
    bookingId: "bk1",
    clientId: "c1",
    date: "2026-09-20",
    originalDate: "2026-09-14",
    reason: "teste",
    paymentMethod: "credit",
    grossAmount: 20,
    feeAmount: 0,
    netAmount: 20,
    parcial: true,
    ...over,
  }) as Doc<RefundDoc>;

const fat = (id: string, over: Partial<SubscriptionInvoiceDoc> = {}): Doc<SubscriptionInvoiceDoc> =>
  ({
    id,
    subscriptionId: "sub1",
    clientId: "c1",
    competencia: "2026-09",
    dueDate: "2026-09-05",
    amount: 99,
    planName: "2 cortes",
    status: "paga",
    paidAt: "2026-09-06",
    paymentMethod: "credit",
    ...over,
  }) as Doc<SubscriptionInvoiceDoc>;

const cm = (id: string, over: Partial<CommissionDoc> = {}): Doc<CommissionDoc> =>
  ({
    id,
    origin: "produto",
    movementId: "mv1",
    staffId: "leo",
    uid: null,
    staffName: "Léo",
    date: "2026-09-14",
    commissionPct: 50,
    commissionBase: 54,
    commissionAmount: 27,
    ...over,
  }) as Doc<CommissionDoc>;

/* ================================================================== */
/* Receita de serviço                                                 */
/* ================================================================== */

describe("3.2 · receita de SERVIÇO", () => {
  it("VALOR: sai do pagamento congelado, não do booking", () => {
    /* O booking diz 50; o pagamento congelou 45 (desconto dado no balcão). O
     * que entrou foram 45. */
    const r = receitaDeServico({
      bookings: [bk("bk1", { value: 50 })],
      payments: [pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 45 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(45);
    expect(r.bruta).not.toBe(50);
  });

  it("EXCLUSIVIDADE: o mesmo atendimento não entra duas vezes", () => {
    /* A prova central da rodada. Com booking E pagamento presentes, uma
     * implementação que somasse as duas fontes veria 100. */
    const r = receitaDeServico({
      bookings: [bk("bk1", { value: 50 })],
      payments: [pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 50 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(50);
    expect(r.quantidade).toBe(1);
  });

  it("EXCLUSIVIDADE: pagamento de OUTRA origem não entra na linha de serviço", () => {
    /* Um pagamento de venda no mesmo período não pode inflar a receita de
     * serviço — e um `movementId` casando por acidente com um `bookingId` é
     * exatamente o tipo de coincidência que uma indexação frouxa aceitaria. */
    const r = receitaDeServico({
      bookings: [bk("mv1", { value: 50 })],
      payments: [pg("p", { origin: "produto", movementId: "mv1", grossAmount: 900 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(50);
    expect(r.semFatoMaterializado).toBe(1);
  });

  it("FALLBACK: atendimento sem pagamento usa `booking.value` e é contado", () => {
    /* Sem isto, o histórico anterior ao gatilho apareceria zerado — e o dono
     * concluiria que o sistema perdeu a receita dele. */
    const r = receitaDeServico({
      bookings: [bk("bk1", { value: 50 }), bk("bk2", { value: 70 })],
      payments: [pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 50 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(120);
    expect(r.semFatoMaterializado).toBe(1);
  });

  it("o fallback NÃO é uma segunda parcela somada", () => {
    /* Um `PaymentDoc` órfão — aponta um booking que não está no universo — não
     * pode adicionar receita. Se a implementação somasse coleções, entraria. */
    const r = receitaDeServico({
      bookings: [bk("bk1", { value: 50 })],
      payments: [
        pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 50 }),
        pg("orfao", { bookingId: "bk-que-nao-existe", grossAmount: 999 }),
      ],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(50);
  });

  it("só conta atendimento CONCLUÍDO", () => {
    const r = receitaDeServico({
      bookings: [bk("bk1"), bk("bk2", { status: "confirmed" }), bk("bk3", { status: "no_show" })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.quantidade).toBe(1);
  });

  it("respeita o período", () => {
    const r = receitaDeServico({
      bookings: [bk("bk1"), bk("bk2", { date: "2026-08-14" })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(50);
  });

  it("ESTORNO reduz a líquida e NÃO mexe na bruta", () => {
    /* O pagamento original permanece inteiro — é a decisão de D22. Quem vê a
     * devolução é a líquida. */
    const r = receitaDeServico({
      bookings: [bk("bk1", { value: 50 })],
      payments: [pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 50 })],
      refunds: [rf("e1", { grossAmount: 20 })],
      periodo: P,
    });
    expect(r.bruta).toBe(50);
    expect(r.estornada).toBe(20);
    expect(r.liquida).toBe(30);
  });

  it("estorno de PRODUTO não reduz a receita de serviço", () => {
    const r = receitaDeServico({
      bookings: [bk("bk1", { value: 50 })],
      payments: [],
      refunds: [rf("e1", { origin: "produto", movementId: "mv1", grossAmount: 45 })],
      periodo: P,
    });
    expect(r.estornada).toBe(0);
    expect(r.liquida).toBe(50);
  });

  it("separa encaixe de atendimento normal sem contar em dobro", () => {
    const bookings = [bk("bk1", { value: 50 }), bk("bk2", { value: 30, isFitIn: true })];
    const normal = receitaDeServico({ bookings, payments: [], refunds: [], periodo: P, apenasEncaixes: false });
    const encaixe = receitaDeServico({ bookings, payments: [], refunds: [], periodo: P, apenasEncaixes: true });
    const tudo = receitaDeServico({ bookings, payments: [], refunds: [], periodo: P });

    expect(normal.bruta).toBe(50);
    expect(encaixe.bruta).toBe(30);
    expect(normal.bruta + encaixe.bruta).toBe(tudo.bruta);
  });

  it("pagamento ANTIGO sem `origin` ainda é reconhecido como serviço", () => {
    /* Anteriores ao D29 não gravavam o campo, e todos eram de serviço. Exigir
     * `origin` os jogaria no fallback sem necessidade. */
    const r = receitaDeServico({
      bookings: [bk("bk1", { value: 50 })],
      payments: [pg("p", { origin: undefined, bookingId: "bk1", grossAmount: 47 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(47);
    expect(r.semFatoMaterializado).toBe(0);
  });
});

/* ================================================================== */
/* Receita de produto                                                 */
/* ================================================================== */

describe("3.2 · receita de PRODUTO", () => {
  it("VALOR: sai do pagamento congelado", () => {
    const r = receitaDeProduto({
      movements: [mv("mv1", { value: 90 })],
      payments: [pg("p", { origin: "produto", movementId: "mv1", grossAmount: 90 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(90);
    expect(r.quantidade).toBe(1);
  });

  it("EXCLUSIVIDADE: movimento + pagamento não somam em dobro", () => {
    const r = receitaDeProduto({
      movements: [mv("mv1", { value: 90 })],
      payments: [pg("p", { origin: "produto", movementId: "mv1", grossAmount: 90 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).not.toBe(180);
    expect(r.bruta).toBe(90);
  });

  it("EXCLUSIVIDADE: o ajuste de devolução NÃO entra como venda", () => {
    /* Quem reduz a receita é o `refund`. Contar o ajuste também subtrairia a
     * mesma devolução duas vezes. */
    const r = receitaDeProduto({
      movements: [
        mv("mv1", { value: 90 }),
        mv("aj1", { kind: "ajuste", refundOf: "mv1", value: 45, quantity: 1 }),
      ],
      payments: [],
      refunds: [rf("e1", { origin: "produto", movementId: "mv1", grossAmount: 45 })],
      periodo: P,
    });
    expect(r.bruta).toBe(90);
    expect(r.estornada).toBe(45);
    expect(r.liquida).toBe(45);
  });

  it("EXCLUSIVIDADE: compra não é receita", () => {
    const r = receitaDeProduto({
      movements: [mv("c1", { kind: "compra", value: 500, unitPrice: 0 })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(0);
  });

  it("FALLBACK: venda anterior a G1.6 usa `movement.value`", () => {
    const r = receitaDeProduto({
      movements: [mv("mv1", { value: 90 })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(90);
    expect(r.semFatoMaterializado).toBe(1);
  });
});

/* ================================================================== */
/* Receita de mensalidade — D20                                       */
/* ================================================================== */

describe("3.2 · receita de MENSALIDADE", () => {
  it("VALOR: sai da fatura PAGA, não do contrato ativo", () => {
    /* `subscriptions.status === "ativo"` é contrato. Um mensalista que parou de
     * pagar seguia gerando receita até alguém mudar o status à mão. */
    const r = receitaDeMensalidade({
      invoices: [fat("f1", { amount: 99 })],
      payments: [pg("p", { origin: "mensalidade", invoiceId: "f1", grossAmount: 99 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(99);
  });

  it("EXCLUSIVIDADE: fatura + pagamento não somam em dobro", () => {
    const r = receitaDeMensalidade({
      invoices: [fat("f1", { amount: 99 })],
      payments: [pg("p", { origin: "mensalidade", invoiceId: "f1", grossAmount: 99 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(99);
    expect(r.quantidade).toBe(1);
  });

  it("fatura ABERTA não é receita realizada", () => {
    const r = receitaDeMensalidade({
      invoices: [fat("f1", { status: "aberta", paidAt: null })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(0);
    expect(r.quantidade).toBe(0);
  });

  it("fatura CANCELADA não é receita", () => {
    const r = receitaDeMensalidade({
      invoices: [fat("f1", { status: "cancelada" })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(0);
  });

  it("recorta pela data do PAGAMENTO, não pela competência", () => {
    /* A fatura de agosto paga em setembro é receita realizada de setembro. A
     * competência continua no documento para o MRR histórico. */
    const r = receitaDeMensalidade({
      invoices: [fat("f1", { competencia: "2026-08", dueDate: "2026-08-05", paidAt: "2026-09-03" })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(99);
  });

  it("ESTORNO de mensalidade reduz a líquida", () => {
    const r = receitaDeMensalidade({
      invoices: [fat("f1", { amount: 99 })],
      payments: [],
      refunds: [rf("e1", { origin: "mensalidade", invoiceId: "f1", grossAmount: 99 })],
      periodo: P,
    });
    expect(r.bruta).toBe(99);
    expect(r.liquida).toBe(0);
  });
});

/* ================================================================== */
/* CMV — D3                                                           */
/* ================================================================== */

describe("3.2 · CMV pelo custo do VENDIDO", () => {
  it("VALOR: `unitCost × quantity` congelados na venda", () => {
    const r = custoDoVendido({ movements: [mv("mv1", { unitCost: 18, quantity: 2 })], periodo: P });
    expect(r.total).toBe(36);
  });

  it("EXCLUSIVIDADE: COMPRA não entra mais no CMV", () => {
    /* Era o D3. Num mês de reposição o lucro despencava sem nada ter piorado;
     * comprar estoque é saída de CAIXA, não custo do período. */
    const r = custoDoVendido({
      movements: [
        mv("mv1", { unitCost: 18, quantity: 2 }),
        mv("c1", { kind: "compra", unitCost: 20, quantity: 50, value: 1000 }),
      ],
      periodo: P,
    });
    expect(r.total).toBe(36);
    expect(r.total).not.toBe(1036);
  });

  it("a DEVOLUÇÃO reduz o CMV — a mercadoria voltou para a prateleira", () => {
    /* Se só a receita caísse no estorno, a margem de um mês com devolução
     * apareceria negativa sem motivo. */
    const r = custoDoVendido({
      movements: [
        mv("mv1", { unitCost: 18, quantity: 2 }),
        mv("aj1", { kind: "ajuste", refundOf: "mv1", unitCost: 18, quantity: 1 }),
      ],
      periodo: P,
    });
    expect(r.total).toBe(18);
  });

  it("ajuste SEM `refundOf` não mexe no CMV", () => {
    /* Recontagem, quebra e vencimento são outra coisa — e mexem no resultado em
     * direções diferentes de uma devolução. */
    const r = custoDoVendido({
      movements: [
        mv("mv1", { unitCost: 18, quantity: 2 }),
        mv("aj1", { kind: "ajuste", unitCost: 18, quantity: 5, refundOf: undefined }),
      ],
      periodo: P,
    });
    expect(r.total).toBe(36);
  });

  it("venda sem custo congelado soma ZERO e é contada", () => {
    /* Ler `products.cost` como substituto reintroduziria o defeito que este
     * cálculo existe para eliminar: uma reposição mais cara reescreveria o
     * lucro de meses fechados. O contador expõe o buraco em vez de tapá-lo. */
    const r = custoDoVendido({
      movements: [mv("antigo", { unitCost: undefined }), mv("mv1", { unitCost: 18, quantity: 2 })],
      periodo: P,
    });
    expect(r.total).toBe(36);
    expect(r.semCustoCongelado).toBe(1);
  });

  it("respeita o período", () => {
    const r = custoDoVendido({
      movements: [mv("mv1"), mv("mv2", { date: "2026-08-14" })],
      periodo: P,
    });
    expect(r.total).toBe(36);
  });
});

/* ================================================================== */
/* Comissão de produto — P1-7                                         */
/* ================================================================== */

describe("3.2 · comissão de PRODUTO", () => {
  it("VALOR: sai do fato materializado", () => {
    expect(comissaoDeProduto({ commissions: [cm("c1", { commissionAmount: 27 })], periodo: P })).toBe(27);
  });

  it("EXCLUSIVIDADE: comissão de SERVIÇO não entra", () => {
    /* Bases diferentes: serviço incide sobre o faturamento, produto sobre o
     * lucro. Misturar dobraria o custo variável do DRE. */
    const r = comissaoDeProduto({
      commissions: [
        cm("c1", { commissionAmount: 27 }),
        cm("c2", { origin: "servico", bookingId: "bk1", movementId: undefined, commissionAmount: 200 }),
      ],
      periodo: P,
    });
    expect(r).toBe(27);
  });

  it("as linhas de ESTORNO entram naturalmente na soma", () => {
    /* São `CommissionDoc` com valor negativo — nenhuma fórmula precisa saber
     * que houve estorno. */
    const r = comissaoDeProduto({
      commissions: [cm("c1", { commissionAmount: 27 }), cm("c2", { commissionAmount: -27 })],
      periodo: P,
    });
    expect(r).toBe(0);
  });

  it("SEM FALLBACK: venda antiga sem comissão materializada soma zero", () => {
    /* Derivar aqui restauraria o P1-7: meses fechados voltariam a se reescrever
     * quando o split mudasse. Zero é a verdade — não havia comissão
     * registrada. */
    expect(comissaoDeProduto({ commissions: [], periodo: P })).toBe(0);
  });

  it("respeita o período", () => {
    const r = comissaoDeProduto({
      commissions: [cm("c1"), cm("c2", { date: "2026-08-14", commissionAmount: 500 })],
      periodo: P,
    });
    expect(r).toBe(27);
  });
});

/* ================================================================== */
/* Estornos                                                           */
/* ================================================================== */

describe("3.2 · estornos por origem", () => {
  it("separa as três origens", () => {
    const refunds = [
      rf("a", { origin: "servico", grossAmount: 20 }),
      rf("b", { origin: "produto", grossAmount: 45 }),
      rf("c", { origin: "mensalidade", grossAmount: 99 }),
    ];
    expect(estornosDoPeriodo(refunds, "servico", P)).toBe(20);
    expect(estornosDoPeriodo(refunds, "produto", P)).toBe(45);
    expect(estornosDoPeriodo(refunds, "mensalidade", P)).toBe(99);
  });

  it("recorta pela data do ESTORNO, não pela do fato original", () => {
    /* Devolução feita em setembro de uma venda de agosto é competência de
     * setembro. `originalDate` fica no documento para o outro regime. */
    const r = estornosDoPeriodo(
      [rf("a", { date: "2026-09-03", originalDate: "2026-08-20", grossAmount: 45 })],
      "servico",
      P
    );
    expect(r).toBe(45);
  });

  it("sem estorno é zero, não NaN", () => {
    expect(estornosDoPeriodo([], "servico", P)).toBe(0);
  });
});

/* ================================================================== */
/* A árvore fecha                                                     */
/* ================================================================== */

describe("3.2 · a árvore da receita SOMA o cabeçalho", () => {
  it("os filhos fecham com a receita bruta, com estorno no meio", () => {
    /* D6/P1-2 outra vez, agora pelo outro lado: se a devolução não aparecesse
     * como linha, os filhos somariam MAIS que o cabeçalho e o dono que
     * expandisse e conferisse na mão não fecharia. */
    const receita = receitaDoMes({
      bookings: [bk("bk1", { value: 100 }), bk("bk2", { value: 40, isFitIn: true })],
      movements: [mv("mv1", { value: 90 })],
      subscribers: [],
      invoices: [fat("f1", { amount: 99 })],
      refunds: [rf("e1", { origin: "produto", movementId: "mv1", grossAmount: 45 })],
      payments: [],
      periodo: P,
      hoje: new Date("2026-09-15T12:00:00"),
    });

    const soma = composicaoDaReceita(receita).reduce((s, i) => s + i.value, 0);
    expect(soma).toBeCloseTo(receita.bruta, 2);
    expect(receita.bruta).toBe(100 + 40 + 90 + 99 - 45);
  });

  it("MRR contratado NÃO entra na árvore — não tem lastro de recebimento", () => {
    const receita = receitaDoMes({
      bookings: [bk("bk1", { value: 100 })],
      movements: [],
      subscribers: [
        { id: "s1", name: "X", status: "ativo", price: 149 } as unknown as Doc<SubscriberDoc>,
      ],
      periodo: P,
      hoje: new Date("2026-09-15T12:00:00"),
    });

    expect(receita.mensalistas).toBe(149);
    expect(receita.bruta).toBe(100);
    expect(composicaoDaReceita(receita).map((i) => i.label)).not.toContain(
      "Mensalidades recebidas"
    );
  });

  it("linha zerada não polui a árvore", () => {
    const receita = receitaDoMes({
      bookings: [bk("bk1", { value: 100 })],
      movements: [],
      subscribers: [],
      periodo: P,
      hoje: new Date("2026-09-15T12:00:00"),
    });
    expect(composicaoDaReceita(receita).map((i) => i.label)).toEqual(["Serviços avulsos"]);
  });
});

describe("3.2 · os percentuais da composição fecham 100%", () => {
  const comDevolucao = () =>
    receitaDoMes({
      bookings: [bk("bk1", { value: 50 })],
      movements: [mv("mv1", { value: 90 })],
      subscribers: [],
      invoices: [fat("f1", { amount: 99 })],
      refunds: [rf("e1", { origin: "produto", movementId: "mv1", grossAmount: 45 })],
      payments: [],
      periodo: P,
      hoje: new Date("2026-09-15T12:00:00"),
    });

  it("as FATIAS somam 100, não 123", () => {
    /* O denominador era a receita LÍQUIDA: 50 + 90 + 99 sobre 194 dava
     * 26 + 46 + 51 = 123%. Visto na tela, não por teste. */
    const linhas = composicaoDaReceita(comDevolucao());
    const fatias = linhas.filter((l) => !l.deducao).reduce((s, l) => s + l.pct, 0);
    expect(fatias).toBe(100);
  });

  it("a devolução tem percentual NEGATIVO, não zero", () => {
    /* `safePct` clampa negativo em 0, e o dono via uma dedução de R$ 45,00
     * valendo zero por cento. */
    const devolucao = composicaoDaReceita(comDevolucao()).find((l) => l.deducao)!;
    expect(devolucao.pct).toBeLessThan(0);
    expect(devolucao.value).toBe(-45);
  });

  it("sem devolução, não existe linha de dedução", () => {
    const receita = receitaDoMes({
      bookings: [bk("bk1", { value: 50 })],
      movements: [],
      subscribers: [],
      periodo: P,
      hoje: new Date("2026-09-15T12:00:00"),
    });
    expect(composicaoDaReceita(receita).some((l) => l.deducao)).toBe(false);
  });

  it("receita zerada não vira NaN nem divisão por zero", () => {
    const receita = receitaDoMes({
      bookings: [], movements: [], subscribers: [], periodo: P,
      hoje: new Date("2026-09-15T12:00:00"),
    });
    for (const l of composicaoDaReceita(receita)) expect(Number.isNaN(l.pct)).toBe(false);
  });
});
