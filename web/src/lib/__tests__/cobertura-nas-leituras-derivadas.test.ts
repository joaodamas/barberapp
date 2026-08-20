import { describe, expect, it } from "vitest";
import { mesPeriodo, recorrenciaDeClientes, topServicos } from "@/lib/analytics";
import type { BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * As leituras derivadas e o atendimento coberto pelo plano — D2.
 *
 * ## O que faltava
 *
 * `receitaDeServico` exclui o atendimento coberto desde o D2, e o comentário de
 * `fontes-financeiras.ts` explica por quê: *"o corte coberto não tem pagamento,
 * então cairia no `b.value` e viraria receita — o mensalista do Ilimitado seria
 * cobrado de novo a cada corte"*.
 *
 * Quatro leituras derivadas não sabiam disso e continuavam somando
 * `booking.value`. Duas delas são sobre o PASSADO e estão corrigidas aqui.
 *
 * As outras duas — `previsaoDoDia` e `projecaoDeCaixa` — falam do FUTURO, e uma
 * reserva agendada **ainda não tem `cobertura`**: ela só é decidida na conclusão
 * (achado do R1 — *a cobertura é indecidível antes da conclusão*). Filtrar pelo
 * campo não as alcança; elas precisam da assinatura ativa como fonte, e isso é
 * frente própria com decisão de produto embutida.
 *
 * ## A regra que estes testes fixam
 *
 * O atendimento coberto **aconteceu** e **não faturou**. Contá-lo como zero
 * receita é diferente de fingir que não existiu: excluir a linha inteira faria
 * o produto subestimar quantos cortes a casa fez, e a recorrência perderia
 * justamente o cliente que mais volta.
 */

const bk = (o: Partial<BookingDoc> & { id: string }): Doc<BookingDoc> => ({
  clientId: "c1", staffId: "s1", clientName: "João", clientWhatsapp: "5511",
  serviceIds: ["corte"], date: "2026-07-10", time: "10:00", status: "completed",
  value: 50, paymentOrigin: "in_person", paymentMethod: "pix", ...o,
});

const COBERTO = {
  cobertura: {
    tipo: "plano" as const,
    subscriptionId: "sub1",
    planId: "ilimitado",
    planName: "Ilimitado",
    competencia: "2026-07",
    valorCoberto: 50,
    usoNaCompetencia: 1,
    cota: null,
  },
};

const PERIODO = mesPeriodo("2026-07");
const NOMES = new Map([["corte", "Corte"]]);

describe("topServicos · o coberto conta, mas não fatura", () => {
  it("dois cortes, um coberto: contagem 2, receita 50", () => {
    const tops = topServicos({
      bookings: [bk({ id: "1" }), bk({ id: "2", ...COBERTO })],
      nomePorId: NOMES,
      periodo: PERIODO,
    });

    expect(tops[0].count).toBe(2);
    expect(tops[0].revenue).toBe(50);
  });

  it("todos cobertos: o serviço aparece, com receita zero", () => {
    /* Excluir a linha faria "serviços mais vendidos" esconder o corte mais
     * feito da casa só porque quem o fez é mensalista. */
    const tops = topServicos({
      bookings: [bk({ id: "1", ...COBERTO }), bk({ id: "2", ...COBERTO })],
      nomePorId: NOMES,
      periodo: PERIODO,
    });

    expect(tops).toHaveLength(1);
    expect(tops[0].count).toBe(2);
    expect(tops[0].revenue).toBe(0);
  });

  it("o avulso continua faturando integralmente", () => {
    const tops = topServicos({
      bookings: [bk({ id: "1" }), bk({ id: "2" })],
      nomePorId: NOMES,
      periodo: PERIODO,
    });
    expect(tops[0].revenue).toBe(100);
  });

  it("combo coberto não rateia receita nenhuma entre os serviços", () => {
    const tops = topServicos({
      bookings: [bk({ id: "1", serviceIds: ["corte", "barba"], value: 90, ...COBERTO })],
      nomePorId: new Map([["corte", "Corte"], ["barba", "Barba"]]),
      periodo: PERIODO,
    });
    expect(tops.every((t) => t.revenue === 0)).toBe(true);
    expect(tops.every((t) => t.count === 1)).toBe(true);
  });
});

describe("recorrenciaDeClientes · a visita conta, o gasto não", () => {
  it("mensalista com três cortes cobertos aparece com três visitas e gasto zero", () => {
    /* É o cliente que MAIS volta. Tirá-lo destruiria a resposta que a função
     * existe para dar. */
    const r = recorrenciaDeClientes({
      bookings: [
        bk({ id: "1", date: "2026-07-01", ...COBERTO }),
        bk({ id: "2", date: "2026-07-10", ...COBERTO }),
        bk({ id: "3", date: "2026-07-20", ...COBERTO }),
      ],
      hoje: new Date("2026-07-25T12:00:00"),
    });

    expect(r).toHaveLength(1);
    expect(r[0].visits).toBe(3);
    expect(r[0].spent).toBe(0);
    /* E o hábito dele continua legível: três visitas em 20 dias. */
    expect(r[0].avgIntervalDays).toBe(10);
    expect(r[0].status).toBe("em_dia");
  });

  it("mensalista que pagou um corte avulso soma só esse", () => {
    /* O caso `cobrado_no_balcao` do D-3: o plano cobriria e o dono cobrou. */
    const r = recorrenciaDeClientes({
      bookings: [
        bk({ id: "1", date: "2026-07-01", ...COBERTO }),
        bk({ id: "2", date: "2026-07-10" }),
      ],
      hoje: new Date("2026-07-25T12:00:00"),
    });

    expect(r[0].spent).toBe(50);
  });

  it("cliente avulso continua somando tudo", () => {
    const r = recorrenciaDeClientes({
      bookings: [bk({ id: "1", date: "2026-07-01" }), bk({ id: "2", date: "2026-07-10" })],
      hoje: new Date("2026-07-25T12:00:00"),
    });
    expect(r[0].spent).toBe(100);
  });
});
