import { describe, expect, it } from "vitest";
import {
  caixaDiario,
  caixaDoDia,
  comissoesDeServico,
  indicadores,
  mesPeriodo,
  receitaDoMes,
  resultadoDoMes,
  taxasDePagamento,
} from "@/lib/analytics";
import { receitaDeServico } from "@/lib/fontes-financeiras";
import { movimentosDeCaixa, resumoDoFluxo } from "@/lib/fluxo-de-caixa";
import { recebidoPorForma } from "@/lib/resumo-do-dia";
import { extratoDaComissao } from "@/lib/barbeiro";
import { liquidacaoDoAtendimento } from "@/lib/booking-status";
import { camposDaCaixinha, lerCaixinha, TETO_DA_CAIXINHA, totalComCaixinha, caixinhasDoPeriodo } from "@/lib/caixinha";
import type { Doc } from "@/lib/db/repository";
import type { CommissionDoc, PaymentDoc } from "@/lib/domain";
import type { TenantPolicies } from "@/lib/tenant";
import {
  BOOKINGS,
  COMMISSIONS,
  COMMISSIONS_PRODUTO,
  EXPENSES,
  MES,
  MOVEMENTS,
  PAYMENTS,
  PAYMENTS_PRODUTO,
  POLICIES,
  STAFF,
  SUBSCRIBERS,
} from "./massa-conhecida";

/**
 * Caixinha (gorjeta) — pedido do dono.
 *
 * A regra de ouro: o dinheiro entrou, então aparece no caixa, no recebido por
 * forma e no fechamento; mas NÃO é receita da casa, então o DRE, o ticket, o
 * ranking e a base da comissão de serviço ficam EXATAMENTE como estavam. A prova
 * é comparar a massa conhecida com e sem caixinha.
 */

const periodo = mesPeriodo(MES);
const policies = POLICIES as unknown as TenantPolicies;
const DIA = "2026-09-10";

/** R$ 10 de caixinha no crédito a 3%: o barbeiro recebe R$ 9,70. */
const PAGAMENTO_CAIXINHA: Doc<PaymentDoc> = {
  id: "pagamento_caixinha_x1",
  origin: "caixinha",
  bookingId: "x1",
  staffId: "rafael",
  clientId: "cliente-x1",
  date: DIA,
  paymentOrigin: "in_person",
  paymentMethod: "credit",
  grossAmount: 10,
  feePct: 3,
  feeAmount: 0.3,
  netAmount: 9.7,
};

const COMISSAO_CAIXINHA: Doc<CommissionDoc> = {
  id: "comissao_x1_caixinha",
  origin: "caixinha",
  bookingId: "x1",
  staffId: "rafael",
  uid: null,
  staffName: "Rafael",
  date: DIA,
  commissionPct: 100,
  commissionBase: 10,
  feeAmount: 0.3,
  commissionAmount: 9.7,
};

const PAGAMENTOS = [...PAYMENTS, ...PAYMENTS_PRODUTO];
const COMISSOES = [...COMMISSIONS, ...COMMISSIONS_PRODUTO];
const PAGAMENTOS_COM = [...PAGAMENTOS, PAGAMENTO_CAIXINHA];
const COMISSOES_COM = [...COMISSOES, COMISSAO_CAIXINHA];

function dre(payments: Doc<PaymentDoc>[], commissions: Doc<CommissionDoc>[]) {
  const receita = receitaDoMes({
    bookings: BOOKINGS,
    movements: MOVEMENTS,
    subscribers: SUBSCRIBERS,
    payments,
    periodo,
    hoje: new Date("2026-09-30T12:00:00"),
  });
  const resultado = resultadoDoMes({
    receita,
    expenses: EXPENSES,
    movements: MOVEMENTS,
    periodo,
    policies,
    staff: STAFF,
    bookings: BOOKINGS,
    commissions,
    gatewayFeesTotal: taxasDePagamento(payments, periodo),
  });
  return { receita, resultado };
}

describe("caixinha · fora da receita da casa", () => {
  it("o DRE inteiro fica IDÊNTICO com caixinha: receita, taxa, comissão e resultado", () => {
    const sem = dre(PAGAMENTOS, COMISSOES);
    const com = dre(PAGAMENTOS_COM, COMISSOES_COM);
    expect(com.receita).toEqual(sem.receita);
    expect(com.resultado).toEqual(sem.resultado);
  });

  it("a taxa da maquininha sobre a caixinha é do barbeiro: não vira custo do DRE", () => {
    expect(taxasDePagamento(PAGAMENTOS_COM, periodo)).toBe(taxasDePagamento(PAGAMENTOS, periodo));
  });

  it("receita de serviço e quantidade (ticket médio) não enxergam a caixinha", () => {
    const base = { bookings: BOOKINGS, refunds: [], periodo };
    const sem = receitaDeServico({ ...base, payments: PAGAMENTOS });
    const com = receitaDeServico({ ...base, payments: PAGAMENTOS_COM });
    expect(com).toEqual(sem);
  });

  it("indicadores (ticket, atendimentos) idênticos", () => {
    const kpis = (payments: Doc<PaymentDoc>[]) =>
      indicadores({
        bookings: BOOKINGS,
        receita: dre(payments, COMISSOES).receita,
        periodo,
        capacidade: 200,
      });
    expect(kpis(PAGAMENTOS_COM)).toEqual(kpis(PAGAMENTOS));
  });

  it("a comissão de serviço não ganha base nem valor da caixinha", () => {
    const calc = (commissions: Doc<CommissionDoc>[]) =>
      comissoesDeServico({ bookings: BOOKINGS, staff: STAFF, periodo, policies, commissions });
    expect(calc(COMISSOES_COM)).toEqual(calc(COMISSOES));
  });
});

describe("caixinha · é dinheiro que entrou", () => {
  it("o caixa diário soma a caixinha (líquida) no dia e na forma, sem contar atendimento", () => {
    const dia = (payments: Doc<PaymentDoc>[]) => caixaDiario({ payments, periodo }).find((d) => d.date === DIA)!;
    const sem = dia(PAGAMENTOS);
    const com = dia(PAGAMENTOS_COM);
    expect(com.total).toBeCloseTo(sem.total + 9.7, 2);
    expect(com.cartao).toBeCloseTo(sem.cartao + 9.7, 2);
    expect(com.appointments).toBe(sem.appointments);
  });

  it("R$ 50 no Pix + R$ 10 de caixinha (taxa 0): o caixa do dia tem 60 e a caixinha vem destacada", () => {
    const servico = { ...PAGAMENTO_CAIXINHA, id: "pagamento_x2", origin: "servico" as const, bookingId: "x2", paymentMethod: "pix" as const, grossAmount: 50, netAmount: 50, feePct: 0, feeAmount: 0 };
    const tip = { ...PAGAMENTO_CAIXINHA, paymentMethod: "pix" as const, feePct: 0, feeAmount: 0, netAmount: 10 };
    const caixa = caixaDoDia([servico, tip]);
    expect(caixa.total).toBe(60);
    expect(caixa.pix).toBe(60);
    expect(caixa.caixinha).toBe(10);
    /* E a receita de serviço, a mesma coisa vista pela outra porta: 50. */
    const receita = receitaDeServico({
      bookings: [{ ...BOOKINGS[0], id: "x2", date: DIA, status: "completed", value: 50, discountAmount: undefined, cobertura: undefined } as never],
      payments: [servico, tip],
      refunds: [],
      periodo,
    });
    expect(receita.bruta).toBe(50);
    expect(receita.quantidade).toBe(1);
  });

  it("sem caixinha o caixa do dia diz zero de caixinha", () => {
    expect(caixaDoDia(PAGAMENTOS).caixinha).toBe(0);
  });

  it("o recebido por forma já traz a caixinha na forma em que foi paga", () => {
    const sem = recebidoPorForma(caixaDoDia(PAGAMENTOS.filter((p) => p.date === DIA)));
    const com = recebidoPorForma(caixaDoDia(PAGAMENTOS_COM.filter((p) => p.date === DIA)));
    const cartao = (f: { forma: string; valor: number }[]) => f.find((x) => x.forma === "Cartão")!.valor;
    expect(cartao(com)).toBeCloseTo(cartao(sem) + 10, 2);
  });

  it("o fluxo de caixa mostra 'Caixinha' como entrada própria (líquida)", () => {
    const movs = movimentosDeCaixa({ payments: [PAGAMENTO_CAIXINHA], refunds: [], expenses: [], movements: [], cashEntries: [], periodo });
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ origem: "caixinha", direcao: "entrada", valor: 9.7, descricao: "Caixinha" });
    expect(resumoDoFluxo(movs).porOrigem.caixinha).toBe(9.7);
  });

  it("o repasse ao barbeiro fecha a caixinha em zero para a casa", () => {
    const entrada = movimentosDeCaixa({ payments: [PAGAMENTO_CAIXINHA], refunds: [], expenses: [], movements: [], cashEntries: [], periodo });
    const saida = movimentosDeCaixa({
      payments: [],
      refunds: [],
      expenses: [],
      movements: [],
      cashEntries: [
        {
          id: "ce1",
          kind: "pagamento_comissao",
          direction: "saida",
          amount: -9.7,
          date: DIA,
          reason: "Acerto pago ao barbeiro",
          paymentMethod: "cash",
          staffId: "rafael",
        },
      ],
      periodo,
    });
    const resumo = resumoDoFluxo([...entrada, ...saida]);
    expect(resumo.entradas).toBe(9.7);
    expect(resumo.saldo).toBe(0);
  });
});

describe("caixinha · o extrato do barbeiro", () => {
  const servico = { id: "c1", date: DIA, origin: "servico" as const, commissionPct: 40, commissionBase: 50, commissionAmount: 20, bookingId: "x1" };
  const tip = { id: "c2", date: DIA, origin: "caixinha" as const, commissionPct: 100, commissionBase: 10, commissionAmount: 9.7, feeAmount: 0.3, bookingId: "x1" };

  it("soma a caixinha no total, separada, sem inflar atendimentos nem a base", () => {
    const e = extratoDaComissao([servico, tip]);
    expect(e.total).toBe(29.7);
    expect(e.caixinha).toBe(9.7);
    expect(e.atendimentos).toBe(1);
    expect(e.base).toBe(50);
  });

  it("estorno e ajuste de taxa da caixinha entram no saldo da caixinha", () => {
    const ajuste = { id: "c3", date: DIA, origin: "caixinha" as const, commissionPct: 100, commissionBase: 0, commissionAmount: -0.3, feeAmount: 0.3, bookingId: "x1" };
    const estorno = { id: "c4", date: DIA, origin: "caixinha" as const, commissionPct: 100, commissionBase: -10, commissionAmount: -9.4, feeAmount: -0.6, bookingId: "x1" };
    expect(extratoDaComissao([servico, { ...tip, commissionAmount: 10, feeAmount: 0 }, ajuste]).caixinha).toBe(9.7);
    expect(extratoDaComissao([{ ...tip, commissionAmount: 9.4 }, estorno]).caixinha).toBe(0);
  });

  it("sem caixinha, o extrato é o de sempre", () => {
    const e = extratoDaComissao([servico]);
    expect(e.caixinha).toBe(0);
    expect(e.total).toBe(20);
  });
});

describe("caixinha · o fechamento na tela", () => {
  it("lê o campo com o leitor único de reais", () => {
    expect(lerCaixinha("")).toEqual({ estado: "vazia", valor: 0 });
    expect(lerCaixinha("0")).toEqual({ estado: "vazia", valor: 0 });
    expect(lerCaixinha("10")).toEqual({ estado: "ok", valor: 10 });
    expect(lerCaixinha("R$ 7,50")).toEqual({ estado: "ok", valor: 7.5 });
    /* "1.000" é mil, não R$ 1,00 (a armadilha do Number()). */
    expect(lerCaixinha("1.000")).toEqual({ estado: "ok", valor: 1000 });
    expect(lerCaixinha("abc").estado).toBe("ilegivel");
    expect(lerCaixinha("1.000,01").estado).toBe("acima_do_teto");
    expect(TETO_DA_CAIXINHA).toBe(1000);
  });

  it("só grava tipAmount com forma de pagamento e leitura válida", () => {
    expect(camposDaCaixinha(lerCaixinha("10"), true)).toEqual({ tipAmount: 10 });
    expect(camposDaCaixinha(lerCaixinha("10"), false)).toEqual({});
    expect(camposDaCaixinha(lerCaixinha(""), true)).toEqual({});
    expect(camposDaCaixinha(lerCaixinha("abc"), true)).toEqual({});
    expect(camposDaCaixinha(lerCaixinha("5000"), true)).toEqual({});
  });

  it("mostra o que o cliente paga: cobrado + caixinha", () => {
    expect(totalComCaixinha(50, lerCaixinha("10"))).toBe(60);
    expect(totalComCaixinha(45, lerCaixinha(""))).toBe(45);
  });

  it("a agenda lista a caixinha ao lado da forma na reserva concluída", () => {
    const l = liquidacaoDoAtendimento({
      status: "completed",
      paymentOrigin: "in_person",
      paymentMethod: "pix",
      paymentFormLabel: "Pix",
      value: 50,
      tipAmount: 10,
    });
    expect(l.label).toBe("Pix");
    expect(l.detalhe).toContain("de caixinha");
    expect(
      liquidacaoDoAtendimento({ status: "completed", paymentOrigin: "in_person", paymentMethod: "pix", value: 50 }).detalhe
    ).toBeNull();
  });
});

describe("caixinhas a repassar por barbeiro (DRE, fora do resultado)", () => {
  const periodo = { inicio: "2026-10-01", fim: "2026-10-31" };
  const linha = (o: Partial<Parameters<typeof caixinhasDoPeriodo>[0]["commissions"][number]>) => ({
    origin: "caixinha" as const,
    staffId: "b-rafael",
    staffName: "Rafael",
    date: "2026-10-10",
    commissionBase: 10,
    feeAmount: 0.35,
    commissionAmount: 9.65,
    ...o,
  });

  it("soma o líquido por barbeiro, com a taxa dele à parte", () => {
    const r = caixinhasDoPeriodo({
      commissions: [
        linha({}),
        linha({ staffId: "b-leo", staffName: "Léo", commissionBase: 5, feeAmount: 0, commissionAmount: 5 }),
        /* serviço e produto não entram */
        { ...linha({}), origin: "servico" as const, commissionAmount: 20 },
        { ...linha({}), origin: "produto" as const, commissionAmount: 4.5 },
      ],
      periodo,
    });
    expect(r.total).toBe(14.65);
    expect(r.porBarbeiro).toEqual([
      { staffId: "b-rafael", nome: "Rafael", bruto: 10, taxa: 0.35, liquido: 9.65 },
      { staffId: "b-leo", nome: "Léo", bruto: 5, taxa: 0, liquido: 5 },
    ]);
  });

  it("estorno da conclusão desfeita zera e o barbeiro sai da lista; ajuste de taxa soma", () => {
    const r = caixinhasDoPeriodo({
      commissions: [
        linha({ feeAmount: 0, commissionAmount: 10 }),
        /* Pix → crédito 3%: ajuste −0,30 */
        linha({ commissionBase: 0, feeAmount: 0.3, commissionAmount: -0.3 }),
        linha({ staffId: "b-leo", staffName: "Léo" }),
        linha({ staffId: "b-leo", staffName: "Léo", commissionBase: -10, feeAmount: -0.35, commissionAmount: -9.65 }),
      ],
      periodo,
    });
    expect(r.porBarbeiro).toEqual([{ staffId: "b-rafael", nome: "Rafael", bruto: 10, taxa: 0.3, liquido: 9.7 }]);
    expect(r.total).toBe(9.7);
  });

  it("fora do mês não conta; o nome do cadastro vence o congelado", () => {
    const r = caixinhasDoPeriodo({
      commissions: [linha({ date: "2026-09-30" }), linha({})],
      periodo,
      nomes: new Map([["b-rafael", "Rafael Siqueira"]]),
    });
    expect(r.porBarbeiro).toHaveLength(1);
    expect(r.porBarbeiro[0].nome).toBe("Rafael Siqueira");
  });
});
