import { describe, expect, it } from "vitest";
import {
  caixaDiario, caixaDoDia, capacidadeDiaria, horariosDaJornada, indicadores,
  mesPeriodo, projecaoDeCaixa, receitaDoMes, recorrenciaDeClientes,
  resultadoDoMes, topServicos,
} from "@/lib/analytics";
import { PLATFORM_DEFAULT_POLICIES } from "@/lib/tenant";
import type { Doc } from "@/lib/db/repository";
import type { BookingDoc, ExpenseDoc, InventoryMovementDoc, StaffDoc, SubscriberDoc } from "@/lib/domain";

const P = mesPeriodo("2026-07");

const bk = (o: Partial<BookingDoc> & { id: string }): Doc<BookingDoc> => ({
  clientId: "c1", staffId: "s1", clientName: "João", clientWhatsapp: "5511", serviceIds: ["corte"],
  date: "2026-07-10", time: "10:00", status: "completed", value: 90,
  paymentMethod: "pix", ...o,
});
const ex = (o: Partial<ExpenseDoc> & { id: string }): Doc<ExpenseDoc> => ({
  category: "Aluguel", description: "Aluguel", supplier: "—", value: 1800,
  date: "2026-07-05", payment: "Pix", recurring: true, ...o,
});
const mv = (o: Partial<InventoryMovementDoc> & { id: string }): Doc<InventoryMovementDoc> => ({
  productId: "p1", kind: "venda", quantity: 1, value: 45, date: "2026-07-10", ...o,
});
const st = (o: Partial<StaffDoc> & { id: string }): Doc<StaffDoc> => ({
  name: "Rômulo", active: true, ...o,
});
const sub = (o: Partial<SubscriberDoc> & { id: string }): Doc<SubscriberDoc> => ({
  clientId: "c1", name: "João", planId: "p", planName: "Ilimitado", price: 149,
  status: "ativo", nextCharge: "2026-08-05", ...o,
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

  it("mensalidade não entra no caixa do balcão", () => {
    const r = receitaDoMes({
      bookings: [bk({ id: "1", value: 90 })],
      movements: [mv({ id: "m1", value: 45 })],
      subscribers: [sub({ id: "s1", price: 149 })],
      periodo: P,
    });
    expect(r.caixa).toBe(135);
    expect(r.bruta).toBe(284);
    expect(r.caixa + r.mensalistas).toBe(r.bruta);
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
  it("agrupa por dia e separa meio de pagamento", () => {
    const dias = caixaDiario({
      bookings: [
        bk({ id: "1", date: "2026-07-10", paymentMethod: "pix", value: 90 }),
        bk({ id: "2", date: "2026-07-10", paymentMethod: "cartao", value: 60 }),
        bk({ id: "3", date: "2026-07-11", paymentMethod: "local", value: 35 }),
      ],
      movements: [], periodo: P,
    });
    expect(dias).toHaveLength(2);
    expect(dias[0]).toMatchObject({ date: "2026-07-10", pix: 90, cartao: 60, total: 150, appointments: 2 });
    expect(dias[1]).toMatchObject({ date: "2026-07-11", dinheiro: 35 });
  });

  it("a soma dos dias é a receita de balcão", () => {
    const bookings = [bk({ id: "1", value: 90 }), bk({ id: "2", date: "2026-07-12", value: 60 })];
    const movements = [mv({ id: "m", value: 45 })];
    const receita = receitaDoMes({ bookings, movements, subscribers: [], periodo: P });
    const total = caixaDiario({ bookings, movements, periodo: P }).reduce((s, d) => s + d.total, 0);
    expect(total).toBe(receita.caixa);
  });

  it("sai ordenado por data", () => {
    const dias = caixaDiario({
      bookings: [bk({ id: "1", date: "2026-07-20" }), bk({ id: "2", date: "2026-07-05" })],
      movements: [], periodo: P,
    });
    expect(dias.map((d) => d.date)).toEqual(["2026-07-05", "2026-07-20"]);
  });
});

describe("resultado do mês", () => {
  const base = () => {
    const bookings = [bk({ id: "1", value: 1000, paymentMethod: "local" })];
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

  it("não cobra imposto sobre prejuízo", () => {
    const b = base();
    const r = resultadoDoMes({
      ...b, periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [ex({ id: "1", value: 99999 })],
    });
    expect(r.resultBeforeTax).toBeLessThan(0);
    expect(r.tax).toBe(0);
  });

  /* O teste que existia aqui afirmava que a comissão saía APENAS do lucro da
   * loja — ou seja, ele passava porque codificava o defeito. Com R$ 1.000 de
   * serviço, o custo de mão de obra lançado era R$ 120 (40% sobre R$ 300 de
   * lucro de produto) em vez de R$ 520. */
  it("serviço paga comissão sobre o FATURAMENTO, produto sobre o lucro", () => {
    const b = base();
    const r = resultadoDoMes({ ...b, expenses: [], periodo: P, policies: PLATFORM_DEFAULT_POLICIES });
    const pct = PLATFORM_DEFAULT_POLICIES.commissionSplit.barberPct;

    expect(r.commissionsServico).toBe((1000 * pct) / 100);
    expect(r.commissionsLoja).toBe(((500 - 200) * pct) / 100);
    expect(r.commissions).toBe(r.commissionsServico + r.commissionsLoja);
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

  it("a taxa de recebimento depende do meio, e nunca é zero no cartão", () => {
    const bookings = [
      bk({ id: "1", value: 1000, paymentMethod: "cartao" }),
      bk({ id: "2", value: 1000, paymentMethod: "pix" }),
      bk({ id: "3", value: 1000, paymentMethod: "local" }),
    ];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const r = resultadoDoMes({
      receita, bookings, expenses: [], movements: [], periodo: P,
      policies: PLATFORM_DEFAULT_POLICIES, staff: [st({ id: "s1" })],
    });
    const { pix, cartao } = PLATFORM_DEFAULT_POLICIES.gatewayFeePct;
    expect(r.gatewayFees).toBe(Math.round(1000 * (cartao / 100) + 1000 * (pix / 100)));
    expect(r.gatewayFees).toBeGreaterThan(0);
  });

  /* A trava contra a regressão que originou tudo isto. O setor opera com 15% a
   * 30% de margem (Sebrae) e 45% a 65% de margem de contribuição. O motor
   * chegou a informar 94,6% e 59,8% — 2 a 4 vezes a realidade — porque os 91%
   * da receita que vêm de serviço não geravam custo de mão de obra nenhum. */
  it("uma barbearia realista não fecha com margem de software", () => {
    const bookings = Array.from({ length: 168 }, (_, i) =>
      bk({ id: `b${i}`, value: 74, paymentMethod: i % 2 ? "pix" : "cartao" })
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
      historico: [{ date: "2026-07-05", pix: 100, cartao: 0, dinheiro: 0, total: 100, appointments: 1 }],
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

describe("caixa do dia", () => {
  it("dinheiro só entra quando concluído; pix e cartão contam ao confirmar", () => {
    const c = caixaDoDia([
      bk({ id: "1", status: "confirmed", paymentMethod: "pix", value: 90 }),
      bk({ id: "2", status: "confirmed", paymentMethod: "local", value: 60 }),
      bk({ id: "3", status: "completed", paymentMethod: "local", value: 35 }),
    ]);
    expect(c.pix).toBe(90);
    expect(c.dinheiro).toBe(35);
    expect(c.total).toBe(125);
  });
});
