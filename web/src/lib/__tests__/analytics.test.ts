import { describe, expect, it } from "vitest";
import {
  caixaDiario, caixaDoDia, capacidadeDiaria, cenarioDeCrescimento,
  comissoesDeServico, folhaMensal,
  taxasDePagamento,
  horariosDaJornada, indicadores,
  mesPeriodo, projecaoDeCaixa, receitaDoMes, recorrenciaDeClientes,
  resultadoDoMes, topServicos,
} from "@/lib/analytics";
import { mesAtual } from "@/lib/format";
import { PLATFORM_DEFAULT_POLICIES } from "@/lib/tenant";
import type { Doc } from "@/lib/db/repository";
import type {
  BookingDoc, CommissionDoc, ExpenseDoc, InventoryMovementDoc, PaymentDoc,
  StaffDoc, SubscriberDoc,
} from "@/lib/domain";

const P = mesPeriodo("2026-07");

const bk = (o: Partial<BookingDoc> & { id: string }): Doc<BookingDoc> => ({
  clientId: "c1", staffId: "s1", clientName: "João", clientWhatsapp: "5511", serviceIds: ["corte"],
  date: "2026-07-10", time: "10:00", status: "completed", value: 90,
  paymentOrigin: "in_person", paymentMethod: "pix", ...o,
});
const ex = (o: Partial<ExpenseDoc> & { id: string }): Doc<ExpenseDoc> => ({
  category: "Aluguel", description: "Aluguel", supplier: "—", value: 1800,
  date: "2026-07-05", payment: "Pix", recurring: true, ...o,
});
const mv = (o: Partial<InventoryMovementDoc> & { id: string }): Doc<InventoryMovementDoc> => ({
  productId: "p1", kind: "venda", quantity: 1, value: 45, date: "2026-07-10", ...o,
});
const sub = (o: Partial<SubscriberDoc> & { id: string }): Doc<SubscriberDoc> => ({
  clientId: "c1", name: "João", planId: "p", planName: "Ilimitado", price: 149,
  status: "ativo", nextCharge: "2026-08-05", ...o,
});
const st = (o: Partial<StaffDoc> & { id: string }): Doc<StaffDoc> => ({
  name: "Barbeiro", active: true, ...o,
});

describe("período", () => {
  it("cobre o mês inteiro, respeitando o tamanho", () => {
    expect(mesPeriodo("2026-07")).toEqual({ inicio: "2026-07-01", fim: "2026-07-31" });
    expect(mesPeriodo("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(mesPeriodo("2024-02").fim).toBe("2024-02-29"); // bissexto
  });
});

describe("receita", () => {
  it("só conta atendimento concluído", () => {
    const r = receitaDoMes({
      bookings: [
        bk({ id: "1", status: "completed", value: 90 }),
        bk({ id: "2", status: "confirmed", value: 90 }),
        bk({ id: "3", status: "no_show", value: 90 }),
        bk({ id: "4", status: "cancelled_by_client", value: 90 }),
      ],
      movements: [], subscribers: [], periodo: P,
    });
    expect(r.servicos).toBe(90);
    expect(r.atendimentos).toBe(1);
  });

  it("separa encaixe de serviço avulso", () => {
    const r = receitaDoMes({
      bookings: [bk({ id: "1", value: 90 }), bk({ id: "2", value: 50, isFitIn: true })],
      movements: [], subscribers: [], periodo: P,
    });
    expect(r.servicos).toBe(90);
    expect(r.encaixes).toBe(50);
  });

  /* Este teste afirmava `bruta === caixa + mensalistas` — ou seja, passava
   * porque codificava o defeito, igual ao "comissão sai do lucro da loja" que a
   * auditoria de agosto derrubou. Plano ativo não é dinheiro recebido. */
  it("mensalidade NÃO entra na receita realizada — é contratada", () => {
    const r = receitaDoMes({
      bookings: [bk({ id: "1", value: 90 })],
      movements: [mv({ id: "m1", value: 45 })],
      subscribers: [sub({ id: "s1", price: 149 })],
      periodo: P,
      hoje: new Date("2026-07-15T12:00:00"),
    });

    expect(r.caixa).toBe(135);
    // O único lastro de um mensalista "ativo" é uma caixinha marcada: não há
    // cobrança, e `subscription_invoices` não é escrita por ninguém.
    expect(r.bruta).toBe(135);
    expect(r.mensalistas).toBe(149);
  });

  it("nenhum mensalista muda a receita bruta, por mais que sejam", () => {
    const semAssinantes = receitaDoMes({
      bookings: [bk({ id: "1", value: 90 })],
      movements: [], subscribers: [], periodo: P,
      hoje: new Date("2026-07-15T12:00:00"),
    });
    const comQuarenta = receitaDoMes({
      bookings: [bk({ id: "1", value: 90 })],
      movements: [],
      subscribers: Array.from({ length: 40 }, (_, i) => sub({ id: `s${i}`, price: 149 })),
      periodo: P,
      hoje: new Date("2026-07-15T12:00:00"),
    });

    expect(comQuarenta.bruta).toBe(semAssinantes.bruta);
    expect(comQuarenta.mensalistas).toBe(5960);
  });

  it("o imposto não incide sobre dinheiro que não entrou", () => {
    /* `bruta` é a base do Simples Nacional. Com o MRR dentro, o dono separava
     * imposto sobre mensalidade que talvez não tivesse sido paga — e, no dia
     * 1º, sobre o mês inteiro de uma vez, porque nada olha `nextCharge`. */
    const bookings = [bk({ id: "1", value: 1000 })];
    const receita = receitaDoMes({
      bookings, movements: [],
      subscribers: Array.from({ length: 10 }, (_, i) => sub({ id: `s${i}`, price: 149 })),
      periodo: P,
      hoje: new Date("2026-07-15T12:00:00"),
    });
    const r = resultadoDoMes({
      receita, bookings, expenses: [], movements: [], periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES, staff: [st({ id: "s1" })],
    });

    expect(r.tax).toBe(Math.round((1000 * PLATFORM_DEFAULT_POLICIES.taxRatePct) / 100));
    expect(r.grossRevenue).toBe(1000);
  });

  it("o retrato de mensalistas não contamina mês passado", () => {
    // `SubscriberDoc` só sabe o estado de hoje. Somar os 149 de agora no DRE
    // de julho inventaria receita num mês que pode ter tido zero assinante.
    const assinantes = [sub({ id: "s1", price: 149 })];
    const hoje = new Date("2026-08-11T12:00:00");

    const julho = receitaDoMes({
      bookings: [], movements: [], subscribers: assinantes, periodo: P, hoje,
    });
    expect(julho.mensalistas).toBe(0);

    const agosto = receitaDoMes({
      bookings: [], movements: [], subscribers: assinantes,
      periodo: mesPeriodo("2026-08"), hoje,
    });
    expect(agosto.mensalistas).toBe(149);
  });

  it("ignora o que está fora do período", () => {
    const r = receitaDoMes({
      bookings: [bk({ id: "1", date: "2026-06-30" }), bk({ id: "2", date: "2026-08-01" })],
      movements: [], subscribers: [], periodo: P,
    });
    expect(r.atendimentos).toBe(0);
  });
});

describe("caixa diário", () => {
  /* Rodada 3.2 · o caixa passou a sair de `payments`, pelo LÍQUIDO.
   *
   * Lia `bookings.value` e jogava toda venda de produto na coluna dinheiro
   * (D4). Agora soma o que caiu na conta — que é contra o extrato da
   * maquininha que o dono confere. */
  const pgc = (o: Partial<PaymentDoc> & { id: string }): Doc<PaymentDoc> =>
    ({
      origin: "servico", bookingId: o.id, clientId: "c1", date: "2026-07-10",
      paymentOrigin: "in_person", paymentMethod: "pix",
      grossAmount: 90, feePct: 0, feeAmount: 0, netAmount: 90, ...o,
    }) as Doc<PaymentDoc>;

  it("agrupa por dia e separa meio de pagamento", () => {
    const dias = caixaDiario({
      payments: [
        pgc({ id: "1", date: "2026-07-10", paymentMethod: "pix", netAmount: 90 }),
        pgc({ id: "2", date: "2026-07-10", paymentMethod: "credit", netAmount: 60 }),
        pgc({ id: "3", date: "2026-07-11", paymentMethod: "cash", netAmount: 35 }),
      ],
      periodo: P,
    });
    expect(dias).toHaveLength(2);
    expect(dias[0]).toMatchObject({ date: "2026-07-10", pix: 90, cartao: 60, total: 150, appointments: 2 });
    expect(dias[1]).toMatchObject({ date: "2026-07-11", dinheiro: 35 });
  });

  it("entra o LÍQUIDO, não o bruto", () => {
    /* A maquininha deposita já descontada. Somar o bruto mostraria no caixa um
     * dinheiro que não chegou. */
    const dias = caixaDiario({
      payments: [pgc({ id: "1", paymentMethod: "credit", grossAmount: 100, feeAmount: 3.49, netAmount: 96.51 })],
      periodo: P,
    });
    expect(dias[0].cartao).toBe(96.51);
    expect(dias[0].total).toBe(96.51);
  });

  it("D4 · venda de produto NÃO cai toda em dinheiro", () => {
    const dias = caixaDiario({
      payments: [
        pgc({ id: "v1", origin: "produto", movementId: "mv1", bookingId: undefined, paymentMethod: "credit", netAmount: 87 }),
        pgc({ id: "v2", origin: "produto", movementId: "mv2", bookingId: undefined, paymentMethod: "pix", netAmount: 45 }),
      ],
      periodo: P,
    });
    expect(dias[0].cartao).toBe(87);
    expect(dias[0].pix).toBe(45);
    expect(dias[0].dinheiro).toBe(0);
  });

  it("`appointments` conta só ATENDIMENTO — não venda nem mensalidade", () => {
    /* Somar os três ali inflaria o denominador do ticket médio, que é o D2
     * entrando por outra porta. */
    const dias = caixaDiario({
      payments: [
        pgc({ id: "1", origin: "servico", netAmount: 50 }),
        pgc({ id: "v1", origin: "produto", movementId: "mv1", bookingId: undefined, netAmount: 90 }),
        pgc({ id: "f1", origin: "mensalidade", invoiceId: "f1", bookingId: undefined, netAmount: 99 }),
      ],
      periodo: P,
    });
    expect(dias[0].appointments).toBe(1);
    expect(dias[0].total).toBe(239);
  });

  it("débito e crédito somam na mesma coluna do caixa diário", () => {
    /* O dono concilia com o extrato da maquininha, que é uma fila só. A
     * distinção vive em `payments`, que congela a taxa de cada uma. */
    const dias = caixaDiario({
      payments: [
        pgc({ id: "1", paymentMethod: "debit", netAmount: 40 }),
        pgc({ id: "2", paymentMethod: "credit", netAmount: 60 }),
      ],
      periodo: P,
    });
    expect(dias[0].cartao).toBe(100);
  });

  it("sai ordenado por data", () => {
    const dias = caixaDiario({
      payments: [pgc({ id: "1", date: "2026-07-20" }), pgc({ id: "2", date: "2026-07-05" })],
      periodo: P,
    });
    expect(dias.map((d) => d.date)).toEqual(["2026-07-05", "2026-07-20"]);
  });
});

/** Comissão de produto materializada — a fonte da linha desde a Rodada 3.2. */
const comissaoDeVenda = (
  o: Partial<CommissionDoc> & { id: string }
): Doc<CommissionDoc> =>
  ({
    origin: "produto",
    movementId: "mv1",
    staffId: "leo",
    uid: null,
    staffName: "Léo",
    date: "2026-07-10",
    commissionPct: 40,
    commissionBase: 300,
    commissionAmount: 120,
    ...o,
  }) as Doc<CommissionDoc>;

describe("resultado do mês", () => {
  const base = () => {
    const bookings = [bk({ id: "1", value: 1000, paymentMethod: "cash" })];
    const movements = [mv({ id: "v", kind: "venda", value: 500 }), mv({ id: "c", kind: "compra", value: 200 })];
    const receita = receitaDoMes({ bookings, movements, subscribers: [], periodo: P });
    return { receita, movements, bookings, staff: [st({ id: "s1" })] };
  };

  it("margem = receita − custo variável", () => {
    const b = base();
    const r = resultadoDoMes({ ...b, expenses: [], periodo: P, policies: PLATFORM_DEFAULT_POLICIES });
    expect(r.contributionMargin).toBe(r.grossRevenue - r.variableCost);
  });

  it("só despesa recorrente é custo fixo", () => {
    const b = base();
    const r = resultadoDoMes({
      ...b, periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [ex({ id: "1", value: 1800, recurring: true }), ex({ id: "2", value: 200, recurring: false })],
    });
    expect(r.fixedExpenses).toBe(1800);
    expect(r.variableOperatingExpenses).toBe(200);
  });

  it("imposto incide sobre faturamento, e é devido mesmo no prejuízo", () => {
    // Simples Nacional (Anexo III) é sobre receita bruta. Calcular sobre o
    // resultado subestimava em ~3× e sumia inteiro no mês negativo — o dono
    // planejava com dinheiro que é do governo.
    const b = base();
    const r = resultadoDoMes({
      ...b, periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [ex({ id: "1", value: 99999 })],
    });
    expect(r.resultBeforeTax).toBeLessThan(0);
    expect(r.tax).toBe(
      Math.round((b.receita.bruta * PLATFORM_DEFAULT_POLICIES.taxRatePct) / 100)
    );
    expect(r.tax).toBeGreaterThan(0);
  });

  /* O teste que existia aqui afirmava que a comissão saía APENAS do lucro da
   * loja — ou seja, ele passava porque codificava o defeito. Com R$ 1.000 de
   * serviço, o custo de mão de obra lançado era R$ 120 (40% sobre R$ 300 de
   * lucro de produto) em vez de R$ 520.
   *
   * Na Rodada 3.2 ele mudou de novo: a comissão de produto deixou de ser
   * `lucroLoja × política de hoje` e passa a sair do FATO materializado. O
   * teste antigo afirmava a derivação — que é o P1-7 — e por isso precisou ser
   * reescrito com a comissão gravada. */
  it("serviço paga comissão sobre o FATURAMENTO, produto sai do FATO", () => {
    const b = base();
    const pct = PLATFORM_DEFAULT_POLICIES.commissionSplit.barberPct;
    const r = resultadoDoMes({
      ...b,
      expenses: [],
      periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES,
      commissions: [comissaoDeVenda({ id: "cv1", commissionAmount: 120 })],
    });

    expect(r.commissionsServico).toBe((1000 * pct) / 100);
    expect(r.commissionsLoja).toBe(120);
    expect(r.commissions).toBe(r.commissionsServico + r.commissionsLoja);
  });

  it("SEM o fato, a comissão de produto é ZERO — não deriva da política", () => {
    /* P1-7 na porta de saída. Derivar aqui faria meses fechados se reescrever
     * quando o split mudasse; zero é a verdade — não havia comissão gravada. */
    const b = base();
    const r = resultadoDoMes({ ...b, expenses: [], periodo: P, policies: PLATFORM_DEFAULT_POLICIES });
    expect(r.commissionsLoja).toBe(0);
  });

  it("mudar o split NÃO reescreve a comissão de produto já gravada", () => {
    const b = base();
    const gravada = [comissaoDeVenda({ id: "cv1", commissionPct: 50, commissionAmount: 150 })];
    const a40 = resultadoDoMes({
      ...b, expenses: [], periodo: P, commissions: gravada,
      policies: PLATFORM_DEFAULT_POLICIES,
    });
    const a60 = resultadoDoMes({
      ...b, expenses: [], periodo: P, commissions: gravada,
      policies: {
        ...PLATFORM_DEFAULT_POLICIES,
        commissionSplit: { barberPct: 60, shopPct: 40 } as unknown as typeof PLATFORM_DEFAULT_POLICIES.commissionSplit,
      },
    });
    expect(a40.commissionsLoja).toBe(150);
    expect(a60.commissionsLoja).toBe(150);
  });

  it("cada barbeiro paga o percentual DELE, não a média", () => {
    const bookings = [
      bk({ id: "1", staffId: "romulo", value: 1000 }),
      bk({ id: "2", staffId: "leo", value: 500 }),
      bk({ id: "3", staffId: "leo", value: 500 }),
    ];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const r = resultadoDoMes({
      receita, bookings, expenses: [], movements: [], periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES,
      staff: [st({ id: "romulo", name: "Rômulo", commissionPct: 50 }), st({ id: "leo", name: "Léo", commissionPct: 30 })],
    });

    expect(r.commissionsServico).toBe(500 + 300);
    const leo = r.comissaoPorBarbeiro.find((b) => b.staffId === "leo");
    expect(leo).toMatchObject({ nome: "Léo", base: 1000, pct: 30, valor: 300, atendimentos: 2 });
  });

  it("barbeiro sem percentual próprio cai no padrão da barbearia", () => {
    const bookings = [bk({ id: "1", staffId: "s1", value: 1000 })];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const r = resultadoDoMes({
      receita, bookings, expenses: [], movements: [], periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES, staff: [st({ id: "s1" })],
    });
    expect(r.comissaoPorBarbeiro[0].pct).toBe(PLATFORM_DEFAULT_POLICIES.commissionSplit.barberPct);
  });

  /* Reserva cujo `staffId` não corresponde a barbeiro nenhum: o corte
   * aconteceu e alguém recebeu. Somar zero esconderia custo real. */
  it("reserva órfã ainda gera custo, e diz que é órfã", () => {
    const bookings = [bk({ id: "1", staffId: "fantasma", value: 1000 })];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const r = resultadoDoMes({
      receita, bookings, expenses: [], movements: [], periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES, staff: [],
    });
    expect(r.commissionsServico).toBe(400);
    expect(r.comissaoPorBarbeiro[0].nome).toMatch(/não identificado/i);
  });

  it("a taxa da maquininha entra no custo variável, e não fica em zero", () => {
    /* A taxa vem SOMADA dos pagamentos congelados, via `gatewayFeesTotal`, e
     * não derivada da reserva com a taxa vigente hoje — senão mudar a taxa da
     * maquininha reescreveria meses já fechados. Aqui se prova só a ligação:
     * o que `taxasDePagamento` soma chega ao resultado. */
    const b = base();
    const semTaxa = resultadoDoMes({
      ...b, expenses: [], periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
    });
    const comTaxa = resultadoDoMes({
      ...b, expenses: [], periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      gatewayFeesTotal: 35,
    });
    expect(semTaxa.gatewayFees).toBe(0);
    expect(comTaxa.gatewayFees).toBe(35);
    expect(comTaxa.variableCost - semTaxa.variableCost).toBe(35);
    expect(comTaxa.result).toBe(semTaxa.result - 35);
  });

  /* A trava contra a regressão que originou tudo isto. O setor opera com 15% a
   * 30% de margem (Sebrae) e 45% a 65% de margem de contribuição. O motor
   * chegou a informar 94,6% e 59,8% — 2 a 4 vezes a realidade — porque os 91%
   * da receita que vêm de serviço não geravam custo de mão de obra nenhum. */
  it("uma barbearia realista não fecha com margem de software", () => {
    const bookings = Array.from({ length: 168 }, (_, i) =>
      bk({ id: `b${i}`, value: 74, paymentMethod: i % 2 ? "pix" : "credit" })
    );
    const movements = [mv({ id: "v", kind: "venda", value: 950 }), mv({ id: "c", kind: "compra", value: 600 })];
    const receita = receitaDoMes({ bookings, movements, subscribers: [], periodo: P });
    const r = resultadoDoMes({
      receita, bookings, movements, periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [ex({ id: "1", value: 4230, recurring: true })],
      staff: [st({ id: "s1" })],
    });

    expect(r.contributionMarginPct).toBeGreaterThan(45);
    expect(r.contributionMarginPct).toBeLessThan(65);
    expect(r.marginPct).toBeGreaterThan(10);
    expect(r.marginPct).toBeLessThan(35);
  });

  it("a identidade do DRE fecha", () => {
    const { receita, movements } = base();
    const r = resultadoDoMes({
      receita, movements, periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [ex({ id: "1", value: 300 }), ex({ id: "2", value: 120, recurring: false })],
    });
    expect(r.grossRevenue - r.totalCost).toBe(r.result);
  });

  it("comissão tem como base o serviço, não só o lucro de produto", () => {
    // O serviço é o negócio da barbearia. Comissionar só a revenda deixava o
    // maior custo variável da operação em R$ 0,00 no DRE.
    //
    // A parcela de produto agora vem do fato (3.2); a de serviço continua
    // derivando sobre o faturamento quando não há comissão gravada.
    const { receita, movements } = base();
    const r = resultadoDoMes({
      receita, expenses: [], movements, periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES,
      commissions: [comissaoDeVenda({ id: "cv1", commissionAmount: 120 })],
    });
    const servico = Math.round((1000 * PLATFORM_DEFAULT_POLICIES.commissionSplit.barberPct) / 100);
    expect(r.commissions).toBe(servico + 120);
  });

  it("despesa recorrente segue valendo no mês seguinte ao lançamento", () => {
    // Lançada em julho, marcada como recorrente: o DRE de agosto mostrava
    // custo fixo R$ 0,00 e lucro inflado no valor da conta.
    const agosto = mesPeriodo("2026-08");
    const receita = receitaDoMes({
      bookings: [], movements: [], subscribers: [], periodo: agosto,
    });
    const r = resultadoDoMes({
      receita, movements: [], periodo: agosto, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [ex({ id: "1", date: "2026-07-05", value: 1800, recurring: true })],
    });
    expect(r.fixedExpenses).toBe(1800);
  });

  it("relançar a mesma despesa recorrente não multiplica o custo fixo", () => {
    // Seis meses de uso = seis documentos "Aluguel". Vale o mais recente.
    const receita = receitaDoMes({ bookings: [], movements: [], subscribers: [], periodo: P });
    const r = resultadoDoMes({
      receita, movements: [], periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [
        ex({ id: "1", date: "2026-03-05", value: 1800 }),
        ex({ id: "2", date: "2026-04-05", value: 1800 }),
        ex({ id: "3", date: "2026-05-05", value: 2000 }), // reajuste
      ],
    });
    expect(r.fixedExpenses).toBe(2000);
  });

  it("receita zero não gera NaN", () => {
    const receita = receitaDoMes({ bookings: [], movements: [], subscribers: [], periodo: P });
    const r = resultadoDoMes({
      receita, expenses: [], movements: [], bookings: [], staff: [],
      periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
    });
    expect(Number.isFinite(r.marginPct)).toBe(true);
    expect(r.breakEvenDay).toBeNull();
  });
});

describe("indicadores", () => {
  it("ocupação nunca passa de 100%", () => {
    const bookings = Array.from({ length: 50 }, (_, i) => bk({ id: String(i) }));
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    expect(indicadores({ bookings, receita, periodo: P, capacidade: 10 }).occupancyPct).toBe(100);
  });

  it("no-show é contagem sobre agendamentos, não taxa inventada", () => {
    const bookings = [
      bk({ id: "1", status: "completed" }), bk({ id: "2", status: "completed" }),
      bk({ id: "3", status: "no_show" }), bk({ id: "4", status: "no_show" }),
    ];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const i = indicadores({ bookings, receita, periodo: P, capacidade: 100 });
    expect(i.noShowPct).toBe(50);
    expect(i.noShowCount).toBe(2);
  });

  it("sem agendamento não vira NaN", () => {
    const receita = receitaDoMes({ bookings: [], movements: [], subscribers: [], periodo: P });
    const i = indicadores({ bookings: [], receita, periodo: P, capacidade: 0 });
    expect(i.avgTicket).toBe(0);
    expect(i.occupancyPct).toBe(0);
    expect(i.noShowPct).toBe(0);
  });
});

describe("top serviços", () => {
  it("rateia o valor do combo entre os serviços", () => {
    const top = topServicos({
      bookings: [bk({ id: "1", serviceIds: ["corte", "barba"], value: 100 })],
      nomePorId: new Map([["corte", "Corte"], ["barba", "Barba"]]),
      periodo: P,
    });
    expect(top).toHaveLength(2);
    expect(top[0].revenue).toBe(50);
  });
});

describe("recorrência", () => {
  it("classifica pelo hábito do cliente, não por prazo fixo", () => {
    const hoje = new Date("2026-08-02T12:00:00");
    // Vem a cada 7 dias e sumiu há 30 → muito acima do hábito dele.
    const semanal = recorrenciaDeClientes({
      bookings: [
        bk({ id: "1", clientId: "a", date: "2026-06-25" }),
        bk({ id: "2", clientId: "a", date: "2026-07-02" }),
      ],
      hoje,
    });
    expect(semanal[0].status).toBe("sumiu");

    // Vem a cada 30 dias e sumiu há 31 → está dentro do normal dele.
    const mensal = recorrenciaDeClientes({
      bookings: [
        bk({ id: "1", clientId: "b", date: "2026-06-02" }),
        bk({ id: "2", clientId: "b", date: "2026-07-02" }),
      ],
      hoje,
    });
    expect(mensal[0].status).toBe("em_dia");
  });
});

describe("projeção", () => {
  it("não projeta receita em dia fechado", () => {
    const p = projecaoDeCaixa({
      bookings: [], expenses: [], subscribers: [],
      historico: [{ date: "2026-07-05", pix: 100, cartao: 0, dinheiro: 0, naoInformado: 0, total: 100, appointments: 1 }],
      openWeekdays: [1, 2, 3, 4, 5, 6],
      inicio: new Date("2026-08-02T00:00:00"), // domingo
      dias: 2,
    });
    expect(p[0].isClosed).toBe(true);
    expect(p[0].bookingRevenue).toBe(0);
    expect(p[1].isClosed).toBe(false);
  });

  it("acumulado é a soma corrente dos líquidos", () => {
    const p = projecaoDeCaixa({
      bookings: [], expenses: [], subscribers: [], historico: [],
      openWeekdays: [1, 2, 3, 4, 5, 6], inicio: new Date("2026-08-03T00:00:00"), dias: 3,
    });
    expect(p[2].cumulative).toBe(p[0].net + p[1].net + p[2].net);
  });

  it("o mesmo aluguel relançado todo mês é cobrado uma vez só", () => {
    // Seis meses de uso somavam seis aluguéis no mesmo dia 05 — e o erro
    // crescia a cada mês em que o produto era usado.
    const p = projecaoDeCaixa({
      bookings: [], subscribers: [], historico: [],
      expenses: [
        ex({ id: "1", date: "2026-03-05", value: 2000 }),
        ex({ id: "2", date: "2026-04-05", value: 2000 }),
        ex({ id: "3", date: "2026-05-05", value: 2000 }),
      ],
      openWeekdays: [0, 1, 2, 3, 4, 5, 6],
      inicio: new Date("2026-08-01T00:00:00"), dias: 10,
    });
    expect(p.find((d) => d.date === "2026-08-05")?.fixedExpense).toBe(2000);
  });

  it("conta do dia 31 vence no último dia de um mês de 30", () => {
    const p = projecaoDeCaixa({
      bookings: [], subscribers: [], historico: [],
      expenses: [ex({ id: "1", date: "2026-07-31", value: 500, description: "Software" })],
      openWeekdays: [0, 1, 2, 3, 4, 5, 6],
      inicio: new Date("2026-09-25T00:00:00"), dias: 8, // setembro tem 30
    });
    expect(p.find((d) => d.date === "2026-09-30")?.fixedExpense).toBe(500);
    expect(p.reduce((s, d) => s + d.fixedExpense, 0)).toBe(500);
  });
});

describe("mão de obra", () => {
  const P8 = mesPeriodo("2026-07");

  it("soma o salário de quem está no quadro", () => {
    // A linha de folha do DRE era R$ 0,00 estrutural: `payroll` existia como
    // parâmetro e nenhum chamador o preenchia.
    expect(folhaMensal([st({ id: "1", salary: 2200 }), st({ id: "2", salary: 1800 })])).toBe(4000);
  });

  it("quem saiu do quadro não custa mais", () => {
    expect(
      folhaMensal([st({ id: "1", salary: 2200 }), st({ id: "2", salary: 1800, active: false })])
    ).toBe(2200);
  });

  it("barbeiro só por comissão não vira NaN na folha", () => {
    expect(folhaMensal([st({ id: "1" })])).toBe(0);
    expect(folhaMensal([])).toBe(0);
  });

  it("cada barbeiro comissiona pelo percentual DELE", () => {
    /* `commissionPct` existia desde o multi-barbeiro e nada o lia: quem foi
     * contratado a 50% e quem entrou a 30% apareciam com o mesmo custo. */
    const comissao = comissoesDeServico({
      bookings: [
        bk({ id: "1", staffId: "a", value: 100 }),
        bk({ id: "2", staffId: "b", value: 100 }),
      ],
      staff: [st({ id: "a", commissionPct: 50 }), st({ id: "b", commissionPct: 30 })],
      periodo: P8,
      policies: PLATFORM_DEFAULT_POLICIES,
    });
    expect(comissao.total).toBe(80); // 50 + 30, não 40 + 40
  });

  it("sem percentual próprio cai no padrão da barbearia", () => {
    // O cadastro inicial grava `commissionPct: null`, não ausente.
    const comissao = comissoesDeServico({
      bookings: [bk({ id: "1", staffId: "a", value: 100 })],
      staff: [st({ id: "a", commissionPct: undefined })],
      periodo: P8,
      policies: PLATFORM_DEFAULT_POLICIES,
    });
    expect(comissao.total).toBe(40);
  });

  it("atendimento que não virou receita não gera comissão", () => {
    const comissao = comissoesDeServico({
      bookings: [
        bk({ id: "1", staffId: "a", value: 100, status: "no_show" }),
        bk({ id: "2", staffId: "a", value: 100, status: "cancelled_by_client" }),
        bk({ id: "3", staffId: "a", value: 100, date: "2026-06-10" }), // fora do período
      ],
      staff: [st({ id: "a", commissionPct: 50 })],
      periodo: P8,
      policies: PLATFORM_DEFAULT_POLICIES,
    });
    expect(comissao.total).toBe(0);
  });

  it("o DRE usa o percentual de cada um quando a equipe é informada", () => {
    const bookings = [
      bk({ id: "1", staffId: "a", value: 1000 }),
      bk({ id: "2", staffId: "b", value: 1000 }),
    ];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P8 });
    const staff = [st({ id: "a", commissionPct: 50 }), st({ id: "b", commissionPct: 30 })];

    const comEquipe = resultadoDoMes({
      receita, expenses: [], movements: [], periodo: P8,
      policies: PLATFORM_DEFAULT_POLICIES, staff, bookings,
    });
    expect(comEquipe.commissions).toBe(800);

    // Sem a equipe, cai no percentual único — que é o certo na operação solo.
    const semEquipe = resultadoDoMes({
      receita, expenses: [], movements: [], periodo: P8,
      policies: PLATFORM_DEFAULT_POLICIES,
    });
    expect(semEquipe.commissions).toBe(
      Math.round((2000 * PLATFORM_DEFAULT_POLICIES.commissionSplit.barberPct) / 100)
    );
  });
});

describe("comissão congelada vence sobre a derivação", () => {
  const P7 = mesPeriodo("2026-07");
  const cm = (o: Partial<CommissionDoc> & { id: string }): Doc<CommissionDoc> => ({
    bookingId: "1", staffId: "a", uid: null, date: "2026-07-10",
    origin: "servico", commissionPct: 40, commissionBase: 100,
    commissionAmount: 40, ...o,
  });

  it("usa o valor gravado, não o percentual atual do barbeiro", () => {
    /* O atendimento foi concluído quando o barbeiro estava a 40%. Ele passou
     * para 50% depois. O fechamento daquele mês não pode mudar. */
    const bookings = [bk({ id: "1", staffId: "a", value: 100 })];
    const comissao = comissoesDeServico({
      bookings,
      staff: [st({ id: "a", commissionPct: 50 })], // percentual de HOJE
      periodo: P7,
      policies: PLATFORM_DEFAULT_POLICIES,
      commissions: [cm({ id: "c1", bookingId: "1", commissionPct: 40, commissionAmount: 40 })],
    });
    expect(comissao.total).toBe(40); // e não 50
  });

  it("deriva o atendimento anterior ao trigger, sem zerar o histórico", () => {
    // Sem fallback, todo mês anterior à materialização apareceria com R$ 0,00.
    const comissao = comissoesDeServico({
      bookings: [
        bk({ id: "1", staffId: "a", value: 100 }),  // tem comissão gravada
        bk({ id: "2", staffId: "a", value: 100 }),  // é anterior ao trigger
      ],
      staff: [st({ id: "a", commissionPct: 50 })],
      periodo: P7,
      policies: PLATFORM_DEFAULT_POLICIES,
      commissions: [cm({ id: "c1", bookingId: "1", commissionAmount: 40 })],
    });
    expect(comissao.total).toBe(90); // 40 congelado + 50 derivado
  });

  it("comissão de outro período não vaza para este", () => {
    const comissao = comissoesDeServico({
      bookings: [bk({ id: "1", staffId: "a", value: 100 })],
      staff: [st({ id: "a", commissionPct: 50 })],
      periodo: P7,
      policies: PLATFORM_DEFAULT_POLICIES,
      commissions: [cm({ id: "c1", bookingId: "1", date: "2026-06-10" })],
    });
    // A de junho é ignorada e a reserva de julho deriva pelos 50% atuais.
    expect(comissao.total).toBe(50);
  });
});

describe("taxa de maquininha", () => {
  const P7 = mesPeriodo("2026-07");
  const pg = (o: Partial<PaymentDoc> & { id: string }): Doc<PaymentDoc> => ({
    clientId: "c1", date: "2026-07-10", paymentOrigin: "in_person", paymentMethod: "credit",
    grossAmount: 100, feePct: 3.49, feeAmount: 3.49, netAmount: 96.51, ...o,
  });

  it("soma o que foi de fato cobrado no período, AO CENTAVO", () => {
    // Era um parâmetro que nenhum chamador preenchia: o DRE debitava zero.
    //
    // E depois passou a somar arredondando ao real — 5,49 virava 5,00 (D1/D5).
    // O número precisa bater com o extrato da maquininha, que é onde o dono
    // confere; ali não existe real inteiro.
    expect(
      taxasDePagamento([pg({ id: "1", feeAmount: 3.49 }), pg({ id: "2", feeAmount: 2 })], P7)
    ).toBe(5.49);
  });

  it("ignora pagamento de outro mês", () => {
    expect(
      taxasDePagamento([pg({ id: "1", date: "2026-06-30", feeAmount: 50 })], P7)
    ).toBe(0);
  });

  it("barbearia sem taxa cadastrada não recebe custo inventado", () => {
    expect(taxasDePagamento([pg({ id: "1", feePct: 0, feeAmount: 0 })], P7)).toBe(0);
    expect(taxasDePagamento([], P7)).toBe(0);
  });
});

describe("mês de referência", () => {
  it("não pula meses quando hoje é dia 31", () => {
    // `setMonth` preserva o dia: 31/03 menos um mês pedia "31 de fevereiro" e
    // transbordava de volta para março, deixando fevereiro inalcançável — no
    // dia do fechamento, justamente.
    const trintaEUm = new Date("2026-03-31T12:00:00");
    expect(mesAtual(0, trintaEUm)).toBe("2026-03");
    expect(mesAtual(1, trintaEUm)).toBe("2026-02");
    expect(mesAtual(2, trintaEUm)).toBe("2026-01");
  });

  it("meses consecutivos nunca se repetem", () => {
    const fimDeAgosto = new Date("2026-08-31T12:00:00");
    const meses = [0, 1, 2, 3, 4].map((o) => mesAtual(o, fimDeAgosto));
    expect(meses).toEqual(["2026-08", "2026-07", "2026-06", "2026-05", "2026-04"]);
    expect(new Set(meses).size).toBe(meses.length);
  });
});

describe("jornada", () => {
  const schedule = { opensAt: "09:00", closesAt: "19:00", breaks: [{ from: "12:00", to: "14:00" }], slotMinutes: 30 };

  it("conta os horários da grade, descontando o intervalo", () => {
    // 09–12 = 6 slots, 14–19 = 10 slots
    expect(capacidadeDiaria(schedule)).toBe(16);
    expect(horariosDaJornada(schedule)).toHaveLength(16);
    expect(horariosDaJornada(schedule)).not.toContain("12:30");
  });

  it("jornada inválida devolve zero em vez de laço infinito", () => {
    expect(capacidadeDiaria({ ...schedule, closesAt: "08:00" })).toBe(0);
  });
});

describe("caixa do dia · D2 · a fonte é o pagamento, não a reserva", () => {
  /* A troca de fonte É a correção. Enquanto "concluído" e "recebido" foram
   * sinônimos, somar reservas funcionava. O atendimento coberto pelo plano
   * quebrou a equivalência: o servidor conclui e não cria pagamento. */
  const pg = (over: Record<string, unknown> = {}) =>
    ({
      id: "p1", origin: "servico", clientId: "c1", date: "2026-09-14",
      paymentOrigin: "in_person", paymentMethod: "pix",
      grossAmount: 50, feePct: 0, feeAmount: 0, netAmount: 50, ...over,
    }) as unknown as Doc<PaymentDoc>;

  it("1 · atendimento pago entra no caixa", () => {
    const c = caixaDoDia([pg({ paymentMethod: "pix", grossAmount: 40 })]);
    expect(c.pix).toBe(40);
    expect(c.total).toBe(40);
  });

  it("2 · atendimento COBERTO pelo plano não entra — porque não tem pagamento", () => {
    /* Verificado na tela em 18/08: o mensalista do plano Ilimitado tinha o
     * corte concluído, o servidor gravava `cobertura` e nenhum `PaymentDoc`, e
     * o Hoje exibia `Recebido até agora R$ 50,00`.
     *
     * A prova aqui é a AUSÊNCIA: não existe pagamento para passar. É por isso
     * que a correção foi trocar a fonte em vez de filtrar por cobertura — o
     * `PaymentDoc` já é, por construção, a definição de "entrou". */
    expect(caixaDoDia([]).total).toBe(0);
    expect(caixaDoDia([]).naoInformado).toBe(0);
  });

  it("3 · pagamento SEM forma informada é dinheiro que entrou — e não é ausência de pagamento", () => {
    /* A distinção que o D2 tornou obrigatória, e que a coluna precisa manter:
     * ausência de pagamento e pagamento sem forma informada são opostos. O
     * primeiro não entra em lugar nenhum; o segundo entrou e falta classificar. */
    const c = caixaDoDia([
      pg({ id: "a", paymentMethod: "pix", grossAmount: 100 }),
      pg({ id: "b", paymentMethod: null, grossAmount: 60 }),
    ]);
    expect(c.pix).toBe(100);
    expect(c.naoInformado).toBe(60);
    expect(c.dinheiro).toBe(0);
    expect(c.total).toBe(160);
  });

  it("4 · venda de produto continua entrando", () => {
    const c = caixaDoDia([pg({ origin: "produto", paymentMethod: "credit", grossAmount: 135 })]);
    expect(c.cartao).toBe(135);
    expect(c.total).toBe(135);
  });

  it("5 · mensalidade entra só quando há pagamento real", () => {
    const paga = caixaDoDia([
      pg({ origin: "mensalidade", paymentMethod: "pix", grossAmount: 149 }),
    ]);
    expect(paga.pix).toBe(149);
    /* Fatura emitida e não paga não gera `PaymentDoc` — logo não chega aqui. */
    expect(caixaDoDia([]).total).toBe(0);
  });

  it("os filhos sempre somam o cabeçalho", () => {
    const c = caixaDoDia([
      pg({ id: "a", paymentMethod: "pix", grossAmount: 50 }),
      pg({ id: "b", paymentMethod: "credit", grossAmount: 30 }),
      pg({ id: "c", paymentMethod: "cash", grossAmount: 20 }),
      pg({ id: "d", paymentMethod: null, grossAmount: 15 }),
    ]);
    expect(c.pix + c.cartao + c.dinheiro + c.naoInformado).toBe(c.total);
    expect(c.total).toBe(115);
  });

  it("é BRUTO — a taxa não é descontada aqui", () => {
    /* Esta tela responde "quanto passou pelo meu caixa hoje", que é o que o
     * dono confere contra a maquininha e a gaveta. O líquido, com a taxa já
     * descontada como no extrato, é a pergunta do Fluxo de Caixa. */
    const c = caixaDoDia([
      pg({
        paymentMethod: "credit", grossAmount: 100,
        feePct: 3.49, feeAmount: 3.49, netAmount: 96.51,
      }),
    ]);
    expect(c.cartao).toBe(100);
  });
});

describe("simulação de cenário de crescimento — A6", () => {
  /**
   * O defeito medido: com o slider em 0% — simulando exatamente o mês que a
   * tela acabara de apresentar — a linha "Resultado do Mês" mostrava
   * `atual −R$ 556,80 · cenário −R$ 536,00 · DIFERENÇA +R$ 20,80`.
   *
   * Duas causas somavam o valor: o cenário não descontava imposto embora a
   * linha se chamasse "Resultado do Mês", e `Math.round` arredondava em reais
   * onde o motor arredonda em centavos.
   *
   * A causa de fundo era DUAS contas para o mesmo número, só uma sob teste.
   * Com a fórmula no motor, este teste é a prova que faltava.
   */
  const cenarioBase = () => {
    const bookings = [bk({ id: "1", value: 1000, paymentMethod: "cash" })];
    const movements = [mv({ id: "v", kind: "venda", value: 500 })];
    const receita = receitaDoMes({ bookings, movements, subscribers: [], periodo: P });
    return resultadoDoMes({
      receita, bookings, movements, periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES, staff: [st({ id: "s1" })],
      expenses: [ex({ id: "1", value: 1800, recurring: true })],
    });
  };

  it("variação 0% reproduz o mês EXATAMENTE — inclusive o resultado", () => {
    const r = cenarioBase();
    const c = cenarioDeCrescimento({
      grossRevenue: r.grossRevenue,
      variableCost: r.variableCost,
      fixedCost: r.fixedCost,
      taxRatePct: PLATFORM_DEFAULT_POLICIES.taxRatePct,
      variacaoPct: 0,
    });

    // A linha que divergia em R$ 20,80.
    expect(c.result).toBe(r.result);
    // E as outras, que divergiam em R$ 0,21 pelo arredondamento em reais.
    expect(c.grossRevenue).toBe(r.grossRevenue);
    expect(c.variableCost).toBe(r.variableCost);
    expect(c.contributionMargin).toBe(r.contributionMargin);
    expect(c.fixedCost).toBe(r.fixedCost);
    expect(c.tax).toBe(r.tax);
  });

  it("o imposto entra no resultado do cenário", () => {
    // A maior das duas causas: sem esta linha o cenário mostrava um resultado
    // melhor que o real pelo valor exato do Simples.
    const r = cenarioBase();
    const c = cenarioDeCrescimento({
      grossRevenue: r.grossRevenue,
      variableCost: r.variableCost,
      fixedCost: r.fixedCost,
      taxRatePct: PLATFORM_DEFAULT_POLICIES.taxRatePct,
      variacaoPct: 0,
    });
    expect(c.tax).toBeGreaterThan(0);
    expect(c.result).toBe(c.contributionMargin - c.fixedCost - c.tax);
  });

  it("o imposto acompanha a receita simulada, não fica congelado", () => {
    // Congelado, o cenário de +100% prometeria uma sobra que o dono não teria:
    // o Simples incide sobre faturamento.
    const comum = { grossRevenue: 1000, variableCost: 400, fixedCost: 300, taxRatePct: 6 };
    const zero = cenarioDeCrescimento({ ...comum, variacaoPct: 0 });
    const dobro = cenarioDeCrescimento({ ...comum, variacaoPct: 100 });

    expect(zero.tax).toBe(60);
    expect(dobro.tax).toBe(120);
    expect(dobro.grossRevenue).toBe(2000);
    expect(dobro.variableCost).toBe(800);
    // O custo fixo NÃO escala — é a premissa que a simulação existe para mostrar.
    expect(dobro.fixedCost).toBe(300);
    expect(dobro.result).toBe(2000 - 800 - 300 - 120);
  });

  it("arredonda ao centavo, nunca ao real", () => {
    // `Math.round` em reais era a segunda causa dos R$ 20,80, e some
    // exatamente onde o dono conferiria.
    const c = cenarioDeCrescimento({
      grossRevenue: 1000.555,
      variableCost: 333.333,
      fixedCost: 100,
      taxRatePct: 6,
      variacaoPct: 0,
    });
    expect(c.grossRevenue).toBe(1000.56);
    expect(c.variableCost).toBe(333.33);
    // Arredondando em reais seria 1001 — inteiro.
    expect(Number.isInteger(c.grossRevenue)).toBe(false);
  });
});

describe("ocupação — A17", () => {
  it("o mês com UM atendimento não é apresentado como 0%", () => {
    /* Medido na tela: `OCUPAÇÃO 0%` no mês em que houve 1 atendimento, com o
     * mapa de calor logo abaixo dizendo "100% de ocupação" naquele horário.
     * A capacidade de uma jornada mensal passa de 400 horários, e
     * `Math.round(1/464 * 100)` é zero.
     *
     * "0%" é a única leitura que autoriza o dono a concluir que a cadeira
     * ficou vazia o mês inteiro — e ela é falsa. */
    const bookings = [bk({ id: "1", value: 50 })];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const k = indicadores({ bookings, receita, periodo: P, capacidade: 464 });

    expect(k.occupancyPct).toBeGreaterThan(0);
  });

  it("segue limitada a 100%, e só devolve 0 quando não houve atendimento", () => {
    const receitaVazia = receitaDoMes({
      bookings: [], movements: [], subscribers: [], periodo: P,
    });
    expect(
      indicadores({ bookings: [], receita: receitaVazia, periodo: P, capacidade: 464 })
        .occupancyPct
    ).toBe(0);

    const lotado = Array.from({ length: 20 }, (_, i) => bk({ id: `b${i}` }));
    const receitaCheia = receitaDoMes({
      bookings: lotado, movements: [], subscribers: [], periodo: P,
    });
    expect(
      indicadores({ bookings: lotado, receita: receitaCheia, periodo: P, capacidade: 5 })
        .occupancyPct
    ).toBe(100);
  });
});
