import { describe, expect, it } from "vitest";
import {
  caixaDiario, caixaDoDia, capacidadeDiaria, horariosDaJornada, indicadores,
  mesPeriodo, projecaoDeCaixa, receitaDoMes, recorrenciaDeClientes,
  resultadoDoMes, topServicos,
} from "@/lib/analytics";
import { PLATFORM_DEFAULT_POLICIES } from "@/lib/tenant";
import type { Doc } from "@/lib/db/repository";
import type { BookingDoc, ExpenseDoc, InventoryMovementDoc, SubscriberDoc } from "@/lib/domain";

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
    const bookings = [bk({ id: "1", value: 1000 })];
    const movements = [mv({ id: "v", kind: "venda", value: 500 }), mv({ id: "c", kind: "compra", value: 200 })];
    const receita = receitaDoMes({ bookings, movements, subscribers: [], periodo: P });
    return { receita, movements };
  };

  it("margem = receita − custo variável", () => {
    const { receita, movements } = base();
    const r = resultadoDoMes({ receita, expenses: [], movements, periodo: P, policies: PLATFORM_DEFAULT_POLICIES });
    expect(r.contributionMargin).toBe(r.grossRevenue - r.variableCost);
  });

  it("só despesa recorrente é custo fixo", () => {
    const { receita, movements } = base();
    const r = resultadoDoMes({
      receita, movements, periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [ex({ id: "1", value: 1800, recurring: true }), ex({ id: "2", value: 200, recurring: false })],
    });
    expect(r.fixedExpenses).toBe(1800);
    expect(r.variableOperatingExpenses).toBe(200);
  });

  it("não cobra imposto sobre prejuízo", () => {
    const { receita, movements } = base();
    const r = resultadoDoMes({
      receita, movements, periodo: P, policies: PLATFORM_DEFAULT_POLICIES,
      expenses: [ex({ id: "1", value: 99999 })],
    });
    expect(r.resultBeforeTax).toBeLessThan(0);
    expect(r.tax).toBe(0);
  });

  it("comissão sai do lucro da loja, no rateio do tenant", () => {
    const { receita, movements } = base();
    const r = resultadoDoMes({ receita, expenses: [], movements, periodo: P, policies: PLATFORM_DEFAULT_POLICIES });
    const lucroLoja = 500 - 200;
    expect(r.commissions).toBe(Math.round((lucroLoja * PLATFORM_DEFAULT_POLICIES.commissionSplit.barberPct) / 100));
  });

  it("receita zero não gera NaN", () => {
    const receita = receitaDoMes({ bookings: [], movements: [], subscribers: [], periodo: P });
    const r = resultadoDoMes({ receita, expenses: [], movements: [], periodo: P, policies: PLATFORM_DEFAULT_POLICIES });
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
