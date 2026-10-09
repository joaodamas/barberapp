import { describe, expect, it } from "vitest";
import { situacaoDoHorario } from "@/lib/situacao-do-horario";

const base = { value: 60 };

/** Só os campos que a situação lê; o resto do documento não importa aqui. */
const reserva = (campos: Record<string, unknown>) =>
  ({ ...base, ...campos }) as Parameters<typeof situacaoDoHorario>[0]["booking"];

describe("situação do horário", () => {
  it("em aberto e no horário não diz nada", () => {
    expect(
      situacaoDoHorario({ booking: reserva({ status: "confirmed" }), atrasado: false, atrasoMin: 0 })
    ).toBeNull();
  });

  it("atrasado diz há quanto tempo, em vermelho", () => {
    expect(
      situacaoDoHorario({ booking: reserva({ status: "confirmed" }), atrasado: true, atrasoMin: 50 })
    ).toEqual({ tom: "erro", texto: "Atrasado 50 min" });
  });

  it("concluído diz como foi pago", () => {
    expect(
      situacaoDoHorario({
        booking: reserva({ status: "completed", paymentMethod: "pix" }),
        atrasado: false,
        atrasoMin: null,
      })
    ).toEqual({ tom: "ok", texto: "Concluído · Pix" });
  });

  it("concluído pelo plano não inventa forma de pagamento", () => {
    const r = situacaoDoHorario({
      booking: reserva({
        status: "completed",
        cobertura: { tipo: "plano", planName: "Mensal", cota: 4, usoNaCompetencia: 1 },
      }),
      atrasado: false,
      atrasoMin: null,
    });
    expect(r).toEqual({ tom: "ok", texto: "Concluído · plano" });
  });

  it("cancelado pelo cliente mantém a frase do status", () => {
    expect(
      situacaoDoHorario({
        booking: reserva({ status: "cancelled_by_client" }),
        atrasado: false,
        atrasoMin: null,
      })
    ).toEqual({ tom: "erro", texto: "Cancelado pelo cliente" });
  });

  it("encaixe pendente e aguardando pagamento pedem atenção", () => {
    expect(
      situacaoDoHorario({ booking: reserva({ status: "fit_in_requested" }), atrasado: false, atrasoMin: null })?.tom
    ).toBe("alerta");
    expect(
      situacaoDoHorario({ booking: reserva({ status: "pending_payment" }), atrasado: false, atrasoMin: null })?.texto
    ).toBe("Aguardando pagamento");
  });
});
