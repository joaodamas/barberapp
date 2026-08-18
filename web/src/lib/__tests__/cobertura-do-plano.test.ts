import { describe, expect, it } from "vitest";
import { receitaDeMensalidade, receitaDeServico } from "../fontes-financeiras";
import { cobertoPeloPlano } from "@/lib/domain";
import { mesPeriodo } from "../analytics-periodo";
import type { Doc } from "@/lib/db/repository";
import type {
  BookingDoc,
  CoberturaDoAtendimento,
  PaymentDoc,
  SubscriptionInvoiceDoc,
} from "@/lib/domain";

/**
 * D2 · o corte coberto pelo plano não vira receita nova.
 *
 * O DRE de 18/08 somou `Serviços avulsos R$ 100,00` **e** `Mensalidades
 * recebidas R$ 149,00` — do mesmo cliente, no mesmo dia. Os R$ 100,00 eram dois
 * cortes que o plano Ilimitado já tinha pago.
 *
 * O detalhe que torna estes testes necessários e não óbvios: o corte coberto
 * **não tem pagamento materializado**, e a linha de serviço tem um fallback
 * para o `booking.value` justamente para não zerar o histórico anterior ao
 * gatilho. Sem uma exclusão explícita, o atendimento coberto entraria como
 * receita pela porta dos fundos da migração — e ainda seria contado como
 * "sem fato materializado", como se fosse dívida técnica em vez de decisão.
 */

const P = mesPeriodo("2026-09");

const COBERTO: CoberturaDoAtendimento = {
  tipo: "plano",
  subscriptionId: "assin-1",
  planId: "ilimitado",
  planName: "Ilimitado",
  competencia: "2026-09",
  valorCoberto: 50,
  usoNaCompetencia: 1,
  cota: null,
};

const bk = (id: string, over: Partial<BookingDoc> = {}): Doc<BookingDoc> =>
  ({
    id,
    date: "2026-09-14",
    time: "10:00",
    status: "completed",
    value: 50,
    staffId: "leo",
    clientId: "marcos",
    serviceIds: ["corte"],
    isFitIn: false,
    paymentOrigin: "in_person",
    paymentMethod: "cash",
    ...over,
  }) as Doc<BookingDoc>;

const pg = (id: string, over: Partial<PaymentDoc> = {}): Doc<PaymentDoc> =>
  ({
    id,
    origin: "servico",
    clientId: "marcos",
    date: "2026-09-14",
    paymentOrigin: "in_person",
    paymentMethod: "cash",
    grossAmount: 50,
    feePct: 0,
    feeAmount: 0,
    netAmount: 50,
    ...over,
  }) as Doc<PaymentDoc>;

const fat = (id: string, over: Partial<SubscriptionInvoiceDoc> = {}): Doc<SubscriptionInvoiceDoc> =>
  ({
    id,
    subscriptionId: "assin-1",
    clientId: "marcos",
    competencia: "2026-09",
    dueDate: "2026-09-05",
    amount: 149,
    planName: "Ilimitado",
    status: "paga",
    paidAt: "2026-09-06",
    paymentMethod: "pix",
    ...over,
  }) as Doc<SubscriptionInvoiceDoc>;

describe("D2 · a reserva diz como foi liquidada", () => {
  it("sem o campo, o atendimento é avulso — é o que todo o histórico é", () => {
    expect(cobertoPeloPlano(bk("bk1"))).toBe(false);
  });

  it("com a cobertura gravada, o atendimento se declara coberto", () => {
    expect(cobertoPeloPlano(bk("bk1", { cobertura: COBERTO }))).toBe(true);
  });

  it("avulso explícito continua sendo receita", () => {
    /* A marca de avulso existe para a tela explicar a cobrança; ela não pode
     * ser confundida com cobertura. */
    const b = bk("bk1", {
      cobertura: { tipo: "avulso", motivo: "cota_esgotada", valorCoberto: 0 },
    });
    expect(cobertoPeloPlano(b)).toBe(false);
  });
});

describe("D2 · receita de serviço", () => {
  it("o corte coberto NÃO entra na receita", () => {
    const r = receitaDeServico({
      bookings: [bk("bk1", { cobertura: COBERTO })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(0);
    expect(r.liquida).toBe(0);
  });

  it("o corte coberto não cai no FALLBACK histórico", () => {
    /* Era o caminho pelo qual ele voltaria a virar receita: sem pagamento
     * materializado, a linha usa `booking.value`. E `semFatoMaterializado`
     * existe para tornar a migração visível — contar um corte coberto ali
     * inventaria uma dívida técnica que não existe. */
    const r = receitaDeServico({
      bookings: [bk("bk1", { cobertura: COBERTO })],
      payments: [],
      refunds: [],
      periodo: P,
    });
    expect(r.semFatoMaterializado).toBe(0);
    expect(r.quantidade).toBe(0);
  });

  it("coberto e avulso no mesmo dia: só o avulso soma", () => {
    const r = receitaDeServico({
      bookings: [
        bk("coberto", { cobertura: COBERTO }),
        bk("avulso", { clientId: "outro", value: 70 }),
      ],
      payments: [pg("pagamento_avulso", { bookingId: "avulso", grossAmount: 70 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(70);
    expect(r.quantidade).toBe(1);
  });

  it("o corte ADICIONAL além da cota volta a somar", () => {
    /* O quinto corte de um plano de quatro é cobrança legítima, e precisa
     * aparecer na receita como qualquer avulso. */
    const r = receitaDeServico({
      bookings: [
        bk("c1", { cobertura: { ...COBERTO, cota: 4, usoNaCompetencia: 4 } }),
        bk("c2", { cobertura: { tipo: "avulso", motivo: "cota_esgotada", valorCoberto: 0 } }),
      ],
      payments: [pg("pagamento_c2", { bookingId: "c2", grossAmount: 50 })],
      refunds: [],
      periodo: P,
    });
    expect(r.bruta).toBe(50);
  });

  it("plano ilimitado com dez cortes no mês não cria R$ 500,00 de receita", () => {
    const dez = Array.from({ length: 10 }, (_, i) =>
      bk(`bk${i}`, { cobertura: { ...COBERTO, usoNaCompetencia: i + 1 } })
    );
    expect(receitaDeServico({ bookings: dez, payments: [], refunds: [], periodo: P }).bruta).toBe(0);
  });
});

describe("D2 · o DRE de 18/08, refeito", () => {
  it("dois cortes cobertos + mensalidade paga somam R$ 149,00, e não R$ 249,00", () => {
    /* O número exato que a tela mostrou: `Serviços avulsos R$ 100,00` e
     * `Mensalidades recebidas R$ 149,00` do mesmo cliente no mesmo dia. A
     * mensalidade continua sendo a receita do plano — ela não se perde, ela
     * passa a ser a ÚNICA. */
    const bookings = [
      bk("bk1", { cobertura: COBERTO }),
      bk("bk2", { cobertura: { ...COBERTO, usoNaCompetencia: 2 } }),
    ];
    const invoices = [fat("fatura_assin-1_2026-09")];

    const servico = receitaDeServico({ bookings, payments: [], refunds: [], periodo: P });
    const mensalidade = receitaDeMensalidade({ invoices, payments: [], refunds: [], periodo: P });

    expect(servico.bruta).toBe(0);
    expect(mensalidade.bruta).toBe(149);
    expect(servico.bruta + mensalidade.bruta).toBe(149);
  });

  it("o registro operacional do atendimento é PRESERVADO", () => {
    /* O outro caminho que o dono tinha era não concluir o atendimento. A
     * reserva continua concluída, com valor e barbeiro — o que muda é só o que
     * ela faz com o dinheiro. */
    const b = bk("bk1", { cobertura: COBERTO });
    expect(b.status).toBe("completed");
    expect(b.value).toBe(50);
    expect(b.staffId).toBe("leo");
    expect(b.cobertura?.valorCoberto).toBe(50);
  });
});
